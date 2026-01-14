/**
 * Serial port connection service
 */

import { SerialPort } from 'serialport';
import { generateId } from '@connectty/shared';
import type { ServerConnection, SSHSessionEvent, SerialSettings } from '@connectty/shared';

interface SerialSession {
  id: string;
  port: SerialPort;
  connectionId: string;
}

type EventCallback = (sessionId: string, event: SSHSessionEvent) => void;

export class SerialService {
  private sessions: Map<string, SerialSession> = new Map();
  private onEvent: EventCallback;

  constructor(onEvent: EventCallback) {
    this.onEvent = onEvent;
  }

  async connect(connection: ServerConnection): Promise<string> {
    const sessionId = generateId();
    const settings = connection.serialSettings;

    if (!settings) {
      throw new Error('Serial settings are required for serial connections');
    }

    return new Promise((resolve, reject) => {
      const port = new SerialPort({
        path: settings.device,
        baudRate: settings.baudRate,
        dataBits: settings.dataBits as 5 | 6 | 7 | 8,
        stopBits: settings.stopBits as 1 | 1.5 | 2,
        parity: settings.parity,
        rtscts: settings.flowControl === 'hardware',
        xon: settings.flowControl === 'software',
        xoff: settings.flowControl === 'software',
        autoOpen: false,
      });

      port.on('open', () => {
        const session: SerialSession = {
          id: sessionId,
          port,
          connectionId: connection.id,
        };

        this.sessions.set(sessionId, session);
        resolve(sessionId);
      });

      port.on('data', (data: Buffer) => {
        this.onEvent(sessionId, {
          type: 'data',
          data: data.toString('utf-8'),
        });
      });

      port.on('close', () => {
        this.onEvent(sessionId, {
          type: 'close',
          code: 0,
        });
        this.cleanup(sessionId);
      });

      port.on('error', (err) => {
        this.onEvent(sessionId, {
          type: 'error',
          message: err.message,
        });
        this.cleanup(sessionId);
        reject(err);
      });

      port.open((err) => {
        if (err) {
          reject(new Error(`Failed to open serial port: ${err.message}`));
        }
      });
    });
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.port.isOpen) {
      session.port.write(data);
    }
  }

  disconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.port.isOpen) {
        session.port.close();
      }
      this.cleanup(sessionId);
    }
  }

  private cleanup(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  disconnectAll(): void {
    for (const [sessionId] of this.sessions) {
      this.disconnect(sessionId);
    }
  }

  /**
   * List available serial ports on the system
   */
  static async listPorts(): Promise<{ path: string; manufacturer?: string; productId?: string }[]> {
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer,
      productId: port.productId,
    }));
  }
}
