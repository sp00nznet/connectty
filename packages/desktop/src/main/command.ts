/**
 * Command execution service for bulk actions
 * Supports SSH for Linux/Unix and WinRM for Windows
 */

import { Client } from 'ssh2';
import { spawn } from 'child_process';
import type {
  ServerConnection,
  Credential,
  CommandResult,
  CommandExecution,
  CommandTargetOS,
} from '@connectty/shared';

/**
 * Escape a string for use in PowerShell single-quoted strings
 * Single quotes in PowerShell are escaped by doubling them
 */
function escapePowerShellString(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Encode a PowerShell script as base64 for safe execution via -EncodedCommand
 * This prevents command injection by avoiding shell metacharacter interpretation
 */
function encodePowerShellCommand(script: string): string {
  // PowerShell expects UTF-16LE encoded base64
  const buffer = Buffer.from(script, 'utf16le');
  return buffer.toString('base64');
}

/**
 * Validate hostname to prevent injection via hostname parameter
 */
function isValidHostname(hostname: string): boolean {
  // Allow alphanumeric, dots, hyphens, and IP addresses
  return /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/.test(hostname) ||
         /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

interface CommandExecutionCallbacks {
  onProgress: (connectionId: string, result: Partial<CommandResult>) => void;
  onComplete: (executionId: string) => void;
}

export class CommandService {
  private runningExecutions: Map<string, { cancelled: boolean }> = new Map();

  /**
   * Execute a command across multiple hosts
   */
  async executeCommand(
    execution: CommandExecution,
    connections: ServerConnection[],
    getCredential: (id: string) => Credential | null,
    callbacks: CommandExecutionCallbacks
  ): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    this.runningExecutions.set(execution.id, { cancelled: false });

    // Execute in parallel with concurrency limit
    const concurrencyLimit = 10;
    const chunks = this.chunkArray(connections, concurrencyLimit);

    for (const chunk of chunks) {
      if (this.runningExecutions.get(execution.id)?.cancelled) {
        break;
      }

      const chunkResults = await Promise.all(
        chunk.map(async (connection) => {
          if (this.runningExecutions.get(execution.id)?.cancelled) {
            return this.createSkippedResult(connection, 'Execution cancelled');
          }

          // Notify start
          callbacks.onProgress(connection.id, {
            connectionId: connection.id,
            connectionName: connection.name,
            hostname: connection.hostname,
            status: 'running',
            startedAt: new Date(),
          });

          // Determine target OS and skip if incompatible
          const targetOS = execution.targetOS;
          const isWindows = connection.osType === 'windows';

          if (targetOS === 'linux' && isWindows) {
            return this.createSkippedResult(connection, 'Skipped: Windows host for Linux command');
          }
          if (targetOS === 'windows' && !isWindows) {
            return this.createSkippedResult(connection, 'Skipped: Linux host for Windows command');
          }

          // Get credential
          const credential = connection.credentialId
            ? getCredential(connection.credentialId)
            : null;

          try {
            let result: CommandResult;

            if (isWindows) {
              result = await this.executeWinRMCommand(connection, credential, execution.command);
            } else {
              result = await this.executeSSHCommand(connection, credential, execution.command);
            }

            callbacks.onProgress(connection.id, result);
            return result;
          } catch (error) {
            const result = this.createErrorResult(connection, error);
            callbacks.onProgress(connection.id, result);
            return result;
          }
        })
      );

      results.push(...chunkResults);
    }

    this.runningExecutions.delete(execution.id);
    callbacks.onComplete(execution.id);

    return results;
  }

  /**
   * Cancel a running execution
   */
  cancelExecution(executionId: string): void {
    const execution = this.runningExecutions.get(executionId);
    if (execution) {
      execution.cancelled = true;
    }
  }

  /**
   * Execute command via SSH
   */
  private executeSSHCommand(
    connection: ServerConnection,
    credential: Credential | null,
    command: string
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const client = new Client();
      const startedAt = new Date();
      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        client.end();
        resolve({
          connectionId: connection.id,
          connectionName: connection.name,
          hostname: connection.hostname,
          status: 'error',
          error: 'Command timed out after 5 minutes',
          startedAt,
          completedAt: new Date(),
        });
      }, 5 * 60 * 1000); // 5 minute timeout

      client.on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            client.end();
            resolve({
              connectionId: connection.id,
              connectionName: connection.name,
              hostname: connection.hostname,
              status: 'error',
              error: err.message,
              startedAt,
              completedAt: new Date(),
            });
            return;
          }

          stream.on('data', (data: Buffer) => {
            stdout += data.toString('utf-8');
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString('utf-8');
          });

          stream.on('close', (code: number) => {
            clearTimeout(timeout);
            client.end();
            resolve({
              connectionId: connection.id,
              connectionName: connection.name,
              hostname: connection.hostname,
              status: code === 0 ? 'success' : 'error',
              exitCode: code,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              startedAt,
              completedAt: new Date(),
            });
          });
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          connectionId: connection.id,
          connectionName: connection.name,
          hostname: connection.hostname,
          status: 'error',
          error: err.message,
          startedAt,
          completedAt: new Date(),
        });
      });

      // Build connection config
      const config: Parameters<Client['connect']>[0] = {
        host: connection.hostname,
        port: connection.port,
        username: credential?.username || connection.username || 'root',
        readyTimeout: 30000,
      };

      if (credential) {
        switch (credential.type) {
          case 'password':
            config.password = credential.secret;
            break;
          case 'privateKey':
            config.privateKey = credential.privateKey;
            if (credential.passphrase) {
              config.passphrase = credential.passphrase;
            }
            break;
          case 'agent':
            config.agent = process.env.SSH_AUTH_SOCK;
            break;
        }
      } else {
        // Try SSH agent
        if (process.platform === 'win32') {
          config.agent = '\\\\.\\pipe\\openssh-ssh-agent';
        } else if (process.env.SSH_AUTH_SOCK) {
          config.agent = process.env.SSH_AUTH_SOCK;
        }
      }

      client.connect(config);
    });
  }

  /**
   * Execute command via WinRM (using PowerShell remoting)
   * Uses external winrs or PowerShell Invoke-Command
   * Security: Uses -EncodedCommand to prevent shell metacharacter injection
   */
  private executeWinRMCommand(
    connection: ServerConnection,
    credential: Credential | null,
    command: string
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const startedAt = new Date();

      // Build PowerShell command for remote execution
      const hostname = connection.hostname;

      // Validate hostname to prevent injection
      if (!isValidHostname(hostname)) {
        resolve({
          connectionId: connection.id,
          connectionName: connection.name,
          hostname: connection.hostname,
          status: 'error',
          error: 'Invalid hostname format',
          startedAt,
          completedAt: new Date(),
        });
        return;
      }

      const username = credential?.username || connection.username;
      const password = credential?.secret;
      const domain = credential?.domain;

      // Use full username with domain if available
      const fullUsername = domain ? `${domain}\\${username}` : username;

      let psCommand: string;
      let args: string[];

      if (process.platform === 'win32') {
        // On Windows, use PowerShell Invoke-Command with credential
        // Build script safely using proper escaping
        let script: string;
        if (password) {
          // Create credential object and invoke command
          // Use single-quoted strings with proper escaping to prevent injection
          script =
            `$secpasswd = ConvertTo-SecureString '${escapePowerShellString(password)}' -AsPlainText -Force; ` +
            `$cred = New-Object System.Management.Automation.PSCredential ('${escapePowerShellString(fullUsername || '')}', $secpasswd); ` +
            `Invoke-Command -ComputerName '${escapePowerShellString(hostname)}' -Credential $cred -ScriptBlock { ${command} }`;
        } else {
          // Use current credentials (integrated auth)
          script = `Invoke-Command -ComputerName '${escapePowerShellString(hostname)}' -ScriptBlock { ${command} }`;
        }

        // Use -EncodedCommand to safely pass the script without shell interpretation
        psCommand = 'powershell.exe';
        args = [
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          encodePowerShellCommand(script)
        ];
      } else {
        // On Linux/macOS, try to use pwsh (PowerShell Core) if available
        // Build script safely using proper escaping
        const script =
          `$secpasswd = ConvertTo-SecureString '${escapePowerShellString(password || '')}' -AsPlainText -Force; ` +
          `$cred = New-Object System.Management.Automation.PSCredential ('${escapePowerShellString(fullUsername || '')}', $secpasswd); ` +
          `Invoke-Command -ComputerName '${escapePowerShellString(hostname)}' -Credential $cred -Authentication Negotiate -ScriptBlock { ${command} }`;

        // Use -EncodedCommand to safely pass the script without shell interpretation
        psCommand = 'pwsh';
        args = [
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          encodePowerShellCommand(script)
        ];
      }

      let stdout = '';
      let stderr = '';

      const proc = spawn(psCommand, args, {
        timeout: 5 * 60 * 1000, // 5 minute timeout
      });

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString('utf-8');
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8');
      });

      proc.on('error', (err) => {
        resolve({
          connectionId: connection.id,
          connectionName: connection.name,
          hostname: connection.hostname,
          status: 'error',
          error: `WinRM execution failed: ${err.message}. Ensure PowerShell remoting is enabled on the target.`,
          startedAt,
          completedAt: new Date(),
        });
      });

      proc.on('close', (code) => {
        resolve({
          connectionId: connection.id,
          connectionName: connection.name,
          hostname: connection.hostname,
          status: code === 0 ? 'success' : 'error',
          exitCode: code ?? undefined,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          startedAt,
          completedAt: new Date(),
        });
      });
    });
  }

  /**
   * Escape special regex characters to prevent ReDoS attacks
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Substitute variables in a command template
   * Security: Escapes regex special characters in variable names to prevent ReDoS
   */
  substituteVariables(command: string, variables: Record<string, string>): string {
    let result = command;
    for (const [key, value] of Object.entries(variables)) {
      // Escape the key to prevent regex injection/ReDoS
      const escapedKey = this.escapeRegex(key);
      result = result.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), value);
    }
    return result;
  }

  private createSkippedResult(connection: ServerConnection, reason: string): CommandResult {
    return {
      connectionId: connection.id,
      connectionName: connection.name,
      hostname: connection.hostname,
      status: 'skipped',
      error: reason,
    };
  }

  private createErrorResult(connection: ServerConnection, error: unknown): CommandResult {
    return {
      connectionId: connection.id,
      connectionName: connection.name,
      hostname: connection.hostname,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date(),
    };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
