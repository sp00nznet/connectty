/**
 * PTY service for local shell sessions
 */

import * as pty from 'node-pty';
import * as os from 'os';
import { generateId } from '@connectty/shared';
import type { DatabaseService } from './database';

export interface PTYSession {
  id: string;
  userId: string;
  ptyProcess: pty.IPty;
  shell: string;
}

export interface PTYSessionEvent {
  type: 'data' | 'close' | 'error';
  data?: string;
  message?: string;
  code?: number;
}

type SessionCallback = (event: PTYSessionEvent) => void;

export class PTYService {
  private db?: DatabaseService;
  private sessions: Map<string, PTYSession> = new Map();
  private callbacks: Map<string, SessionCallback> = new Map();
  private loggingEnabled: boolean;

  constructor(db?: DatabaseService) {
    this.db = db;
    this.loggingEnabled = process.env.SESSION_LOGGING_ENABLED === 'true';
  }

  private async logSession(session: PTYSession, data: string, dataType: 'input' | 'output'): Promise<void> {
    if (!this.loggingEnabled || !this.db) return;

    try {
      await this.db.createSessionLog({
        userId: session.userId,
        sessionId: session.id,
        sessionType: 'pty',
        data,
        dataType,
      });
    } catch (err) {
      console.error('Failed to log PTY session data:', err);
    }
  }

  /**
   * Create a new local shell session
   */
  connect(userId: string, callback: SessionCallback): string {
    const sessionId = generateId();

    // Determine the shell to use
    const shell = this.getDefaultShell();
    const shellArgs = this.getShellArgs(shell);

    // Spawn the PTY process
    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      } as { [key: string]: string },
    });

    const session: PTYSession = {
      id: sessionId,
      userId,
      ptyProcess,
      shell,
    };

    this.sessions.set(sessionId, session);
    this.callbacks.set(sessionId, callback);

    // Handle PTY data output
    ptyProcess.onData((data) => {
      const cb = this.callbacks.get(sessionId);
      if (cb) {
        cb({ type: 'data', data });
      }
      // Log output
      this.logSession(session, data, 'output').catch(() => {});
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      const cb = this.callbacks.get(sessionId);
      if (cb) {
        cb({ type: 'close', code: exitCode });
      }
      this.sessions.delete(sessionId);
      this.callbacks.delete(sessionId);
    });

    return sessionId;
  }

  /**
   * Disconnect a session
   */
  disconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.ptyProcess.kill();
      this.sessions.delete(sessionId);
      this.callbacks.delete(sessionId);
    }
  }

  /**
   * Disconnect all sessions for a user
   */
  disconnectUser(userId: string): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        session.ptyProcess.kill();
        this.sessions.delete(sessionId);
        this.callbacks.delete(sessionId);
      }
    }
  }

  /**
   * Disconnect all sessions
   */
  disconnectAll(): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      session.ptyProcess.kill();
      this.sessions.delete(sessionId);
      this.callbacks.delete(sessionId);
    }
  }

  /**
   * Write data to a session
   */
  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.ptyProcess.write(data);
      // Log input
      this.logSession(session, data, 'input').catch(() => {});
    }
  }

  /**
   * Resize a session's terminal
   */
  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.ptyProcess.resize(cols, rows);
    }
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): PTYSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for a user
   */
  getUserSessions(userId: string): PTYSession[] {
    const userSessions: PTYSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        userSessions.push(session);
      }
    }
    return userSessions;
  }

  /**
   * Determine the default shell for the current platform
   */
  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      // Prefer PowerShell on Windows, fall back to cmd
      return process.env.COMSPEC || 'cmd.exe';
    }
    // On Unix-like systems, use the user's shell or fall back to bash/sh
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Get shell arguments based on the shell type
   */
  private getShellArgs(shell: string): string[] {
    const shellName = shell.toLowerCase();

    if (shellName.includes('powershell') || shellName.includes('pwsh')) {
      return ['-NoLogo'];
    }

    if (shellName.includes('bash')) {
      return ['--login'];
    }

    if (shellName.includes('zsh')) {
      return ['--login'];
    }

    if (shellName.includes('fish')) {
      return ['--login'];
    }

    return [];
  }
}
