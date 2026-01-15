/**
 * Embedded RDP session service using node-rdpjs-2
 * Provides tabbed RDP sessions similar to SSH
 */

import { generateId } from '@connectty/shared';
import type { ServerConnection, Credential } from '@connectty/shared';

// RDP session event types
export interface RDPSessionEvent {
  type: 'bitmap' | 'close' | 'error' | 'connect';
  // For bitmap events
  bitmap?: {
    destLeft: number;
    destTop: number;
    destRight: number;
    destBottom: number;
    width: number;
    height: number;
    bitsPerPixel: number;
    data: number[]; // Plain array for IPC serialization
  };
  // For screen info
  screenWidth?: number;
  screenHeight?: number;
  // For error events
  message?: string;
  code?: number;
}

interface RDPSession {
  id: string;
  client: any;
  connectionId: string;
  screenWidth: number;
  screenHeight: number;
}

type EventCallback = (sessionId: string, event: RDPSessionEvent) => void;

export class RDPSessionService {
  private sessions: Map<string, RDPSession> = new Map();
  private onEvent: EventCallback;
  private rdpjs: any = null;

  constructor(onEvent: EventCallback) {
    this.onEvent = onEvent;
    // Try to load node-rdpjs-2
    try {
      this.rdpjs = require('node-rdpjs-2');
    } catch (err) {
      console.warn('node-rdpjs-2 not available, embedded RDP disabled:', err);
    }
  }

  isAvailable(): boolean {
    return this.rdpjs !== null;
  }

  async connect(connection: ServerConnection, credential: Credential | null): Promise<string> {
    if (!this.rdpjs) {
      throw new Error('Embedded RDP not available. Please install node-rdpjs-2.');
    }

    const sessionId = generateId();
    const screenWidth = 1920;
    const screenHeight = 1080;

    return new Promise((resolve, reject) => {
      try {
        const client = this.rdpjs.createClient({
          domain: credential?.domain || '',
          userName: credential?.username || connection.username || '',
          password: credential?.secret || '',
          enablePerf: true,
          autoLogin: true,
          decompress: true, // Decompress RLE-compressed bitmaps
          screen: {
            width: screenWidth,
            height: screenHeight,
          },
          locale: 'en',
          logLevel: 'ERROR',
        });

        const session: RDPSession = {
          id: sessionId,
          client,
          connectionId: connection.id,
          screenWidth,
          screenHeight,
        };

        // Handle connection events
        client.on('connect', () => {
          this.sessions.set(sessionId, session);
          this.onEvent(sessionId, {
            type: 'connect',
            screenWidth,
            screenHeight,
          });
          resolve(sessionId);
        });

        client.on('bitmap', (bitmap: any) => {
          // Convert Buffer to Uint8Array for proper IPC serialization
          const dataArray = bitmap.data instanceof Buffer
            ? new Uint8Array(bitmap.data)
            : bitmap.data;

          this.onEvent(sessionId, {
            type: 'bitmap',
            bitmap: {
              destLeft: bitmap.destLeft,
              destTop: bitmap.destTop,
              destRight: bitmap.destRight,
              destBottom: bitmap.destBottom,
              width: bitmap.width,
              height: bitmap.height,
              bitsPerPixel: bitmap.bitsPerPixel,
              data: Array.from(dataArray), // Convert to plain array for reliable IPC
            },
          });
        });

        client.on('close', () => {
          this.onEvent(sessionId, {
            type: 'close',
            code: 0,
          });
          this.cleanup(sessionId);
        });

        client.on('error', (err: Error) => {
          this.onEvent(sessionId, {
            type: 'error',
            message: err.message,
          });
          this.cleanup(sessionId);
          if (!this.sessions.has(sessionId)) {
            reject(err);
          }
        });

        // Connect to RDP server
        client.connect(connection.hostname, connection.port || 3389);
      } catch (err) {
        reject(err);
      }
    });
  }

  sendKeyEvent(sessionId: string, scanCode: number, isPressed: boolean, _isExtended: boolean = false): void {
    const session = this.sessions.get(sessionId);
    if (session?.client) {
      try {
        // node-rdpjs-2 API: sendKeyEventScancode(code, isPressed)
        session.client.sendKeyEventScancode(scanCode, isPressed);
      } catch (err) {
        console.error('Error sending key event:', err);
      }
    }
  }

  sendMouseEvent(
    sessionId: string,
    x: number,
    y: number,
    button: number,
    isPressed: boolean
  ): void {
    const session = this.sessions.get(sessionId);
    if (session?.client) {
      try {
        session.client.sendPointerEvent(x, y, button, isPressed);
      } catch (err) {
        console.error('Error sending mouse event:', err);
      }
    }
  }

  sendWheelEvent(sessionId: string, x: number, y: number, delta: number, isHorizontal: boolean = false): void {
    const session = this.sessions.get(sessionId);
    if (session?.client) {
      try {
        // node-rdpjs-2 API: sendWheelEvent(x, y, step, isNegative, isHorizontal)
        const step = Math.abs(delta);
        const isNegative = delta < 0;
        session.client.sendWheelEvent(x, y, step, isNegative, isHorizontal);
      } catch (err) {
        console.error('Error sending wheel event:', err);
      }
    }
  }

  disconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.client.close();
      } catch {
        // Ignore errors during disconnect
      }
      this.cleanup(sessionId);
    }
  }

  disconnectAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.disconnect(sessionId);
    }
  }

  private cleanup(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  getSessionInfo(sessionId: string): { screenWidth: number; screenHeight: number } | null {
    const session = this.sessions.get(sessionId);
    if (session) {
      return {
        screenWidth: session.screenWidth,
        screenHeight: session.screenHeight,
      };
    }
    return null;
  }
}
