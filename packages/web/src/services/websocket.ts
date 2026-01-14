/**
 * WebSocket service for SSH terminal connections
 */

import type { SSHSessionEvent } from '@connectty/shared';

type MessageHandler = (event: SSHSessionEvent & { sessionId?: string }) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private authenticated = false;
  private pendingMessages: string[] = [];

  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        // Send auth message
        this.send({ type: 'auth', token });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'auth_success') {
            this.authenticated = true;
            // Send any pending messages
            this.pendingMessages.forEach((msg) => this.ws?.send(msg));
            this.pendingMessages = [];
            resolve();
            return;
          }

          if (data.type === 'auth_error') {
            reject(new Error(data.message || 'Authentication failed'));
            return;
          }

          // Forward to handlers
          this.messageHandlers.forEach((handler) => handler(data));
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };

      this.ws.onclose = () => {
        this.authenticated = false;
        this.handleReconnect(token);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }

  private handleReconnect(token: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      setTimeout(() => {
        console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
        this.connect(token).catch(console.error);
      }, delay);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.authenticated = false;
    this.messageHandlers.clear();
  }

  private send(message: Record<string, unknown>) {
    const msgStr = JSON.stringify(message);

    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      this.ws.send(msgStr);
    } else if (message.type !== 'auth') {
      this.pendingMessages.push(msgStr);
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msgStr);
    }
  }

  connectSSH(connectionId: string): void {
    this.send({ type: 'connect', connectionId });
  }

  disconnectSSH(sessionId: string): void {
    this.send({ type: 'disconnect', sessionId });
  }

  sendData(sessionId: string, data: string): void {
    this.send({ type: 'data', sessionId, data });
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.send({ type: 'resize', sessionId, cols, rows });
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.authenticated;
  }
}

export const wsService = new WebSocketService();
