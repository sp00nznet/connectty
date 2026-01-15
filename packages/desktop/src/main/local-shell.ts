/**
 * Local Shell Service - handles spawning local terminal sessions
 * Supports Windows (cmd, PowerShell, Windows Terminal), Linux (bash, zsh, etc.), and WSL
 */

import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

export interface LocalShellInfo {
  id: string;
  name: string;
  path: string;
  args?: string[];
  icon?: string;
  elevated?: boolean; // Run as administrator (Windows only)
}

export interface LocalShellSessionEvent {
  type: 'data' | 'close' | 'error';
  data?: string;
  message?: string;
  exitCode?: number;
}

interface LocalShellSession {
  id: string;
  shellInfo: LocalShellInfo;
  ptyProcess: pty.IPty;
}

export class LocalShellService {
  private sessions: Map<string, LocalShellSession> = new Map();
  private eventCallback: (sessionId: string, event: LocalShellSessionEvent) => void;
  private platform: NodeJS.Platform;

  constructor(eventCallback: (sessionId: string, event: LocalShellSessionEvent) => void) {
    this.eventCallback = eventCallback;
    this.platform = process.platform;
  }

  /**
   * Get available shells based on the current platform
   */
  async getAvailableShells(): Promise<LocalShellInfo[]> {
    const shells: LocalShellInfo[] = [];

    if (this.platform === 'win32') {
      // Windows shells
      shells.push(...this.getWindowsShells());

      // Add WSL distributions
      const wslDistros = await this.getWSLDistributions();
      shells.push(...wslDistros);
    } else if (this.platform === 'linux') {
      // Linux shells
      shells.push(...this.getLinuxShells());
    } else if (this.platform === 'darwin') {
      // macOS shells
      shells.push(...this.getMacOSShells());
    }

    return shells;
  }

  /**
   * Get Windows shells (cmd, PowerShell, Windows Terminal)
   */
  private getWindowsShells(): LocalShellInfo[] {
    const shells: LocalShellInfo[] = [];
    const systemRoot = process.env.SYSTEMROOT || 'C:\\Windows';

    // Command Prompt
    const cmdPath = path.join(systemRoot, 'System32', 'cmd.exe');
    if (fs.existsSync(cmdPath)) {
      shells.push({
        id: 'cmd',
        name: 'Command Prompt',
        path: cmdPath,
        icon: 'cmd',
      });
      // Admin version
      shells.push({
        id: 'cmd-admin',
        name: 'Command Prompt (Administrator)',
        path: cmdPath,
        icon: 'cmd',
        elevated: true,
      });
    }

    // PowerShell (Windows PowerShell 5.x)
    const powershellPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (fs.existsSync(powershellPath)) {
      shells.push({
        id: 'powershell',
        name: 'Windows PowerShell',
        path: powershellPath,
        icon: 'powershell',
      });
      // Admin version
      shells.push({
        id: 'powershell-admin',
        name: 'Windows PowerShell (Administrator)',
        path: powershellPath,
        icon: 'powershell',
        elevated: true,
      });
    }

    // PowerShell Core (PowerShell 7+)
    const pwshPaths = [
      path.join(process.env.PROGRAMFILES || '', 'PowerShell', '7', 'pwsh.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'PowerShell', '7', 'pwsh.exe'),
    ];
    for (const pwshPath of pwshPaths) {
      if (fs.existsSync(pwshPath)) {
        shells.push({
          id: 'pwsh',
          name: 'PowerShell 7',
          path: pwshPath,
          icon: 'powershell',
        });
        // Admin version
        shells.push({
          id: 'pwsh-admin',
          name: 'PowerShell 7 (Administrator)',
          path: pwshPath,
          icon: 'powershell',
          elevated: true,
        });
        break;
      }
    }

    // Windows Terminal (if installed)
    const wtPath = path.join(
      process.env.LOCALAPPDATA || '',
      'Microsoft',
      'WindowsApps',
      'wt.exe'
    );
    if (fs.existsSync(wtPath)) {
      shells.push({
        id: 'wt',
        name: 'Windows Terminal',
        path: wtPath,
        icon: 'terminal',
      });
    }

    return shells;
  }

  /**
   * Get WSL distributions
   */
  private async getWSLDistributions(): Promise<LocalShellInfo[]> {
    const shells: LocalShellInfo[] = [];

    try {
      // Check if WSL is available
      const wslPath = path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'wsl.exe');
      if (!fs.existsSync(wslPath)) {
        return shells;
      }

      // Get list of installed distributions
      const output = execSync('wsl --list --quiet', { encoding: 'utf-8', timeout: 5000 });
      const distros = output
        .split('\n')
        .map(line => line.trim().replace(/\0/g, '').replace(/[\uFEFF\uFFFE]/g, '')) // Remove null chars and BOM
        .filter(line => line.length > 0 && !line.includes('Windows Subsystem')); // Filter empty and header lines

      for (const distro of distros) {
        // Clean the distro name thoroughly
        const cleanDistro = distro.replace(/[^\x20-\x7E]/g, '').trim();
        if (!cleanDistro) continue;

        shells.push({
          id: `wsl-${cleanDistro.toLowerCase().replace(/\s+/g, '-')}`,
          name: `WSL: ${cleanDistro}`,
          path: wslPath,
          args: ['-d', cleanDistro],
          icon: 'linux',
        });
      }
    } catch (err) {
      // WSL not available or error listing distributions
      console.log('WSL not available or error:', err);
    }

    return shells;
  }

  /**
   * Get Linux shells
   */
  private getLinuxShells(): LocalShellInfo[] {
    const shells: LocalShellInfo[] = [];

    // Read /etc/shells for available shells
    try {
      const shellsFile = fs.readFileSync('/etc/shells', 'utf-8');
      const shellPaths = shellsFile
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));

      // Prioritize common shells
      const priorityShells = ['/bin/bash', '/usr/bin/bash', '/bin/zsh', '/usr/bin/zsh'];
      const orderedPaths = [
        ...priorityShells.filter(p => shellPaths.includes(p)),
        ...shellPaths.filter(p => !priorityShells.includes(p)),
      ];

      for (const shellPath of orderedPaths) {
        if (fs.existsSync(shellPath)) {
          const name = path.basename(shellPath);
          const displayName = this.getShellDisplayName(name);

          shells.push({
            id: name,
            name: displayName,
            path: shellPath,
            icon: this.getShellIcon(name),
          });
        }
      }
    } catch (err) {
      // Fallback to common shells
      const defaultShells = ['/bin/bash', '/bin/sh'];
      for (const shellPath of defaultShells) {
        if (fs.existsSync(shellPath)) {
          const name = path.basename(shellPath);
          shells.push({
            id: name,
            name: this.getShellDisplayName(name),
            path: shellPath,
            icon: this.getShellIcon(name),
          });
        }
      }
    }

    return shells;
  }

  /**
   * Get macOS shells
   */
  private getMacOSShells(): LocalShellInfo[] {
    const shells: LocalShellInfo[] = [];

    // Common macOS shells
    const macShells = [
      { path: '/bin/zsh', name: 'Zsh' },
      { path: '/bin/bash', name: 'Bash' },
      { path: '/bin/sh', name: 'Shell' },
    ];

    for (const shell of macShells) {
      if (fs.existsSync(shell.path)) {
        shells.push({
          id: path.basename(shell.path),
          name: shell.name,
          path: shell.path,
          icon: this.getShellIcon(path.basename(shell.path)),
        });
      }
    }

    return shells;
  }

  /**
   * Get display name for a shell
   */
  private getShellDisplayName(name: string): string {
    const names: Record<string, string> = {
      bash: 'Bash',
      zsh: 'Zsh',
      sh: 'Shell',
      fish: 'Fish',
      ksh: 'Korn Shell',
      csh: 'C Shell',
      tcsh: 'TCSH',
      dash: 'Dash',
    };
    return names[name] || name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * Get icon identifier for a shell
   */
  private getShellIcon(name: string): string {
    const icons: Record<string, string> = {
      bash: 'bash',
      zsh: 'zsh',
      fish: 'fish',
      powershell: 'powershell',
      pwsh: 'powershell',
      cmd: 'cmd',
    };
    return icons[name] || 'terminal';
  }

  /**
   * Find gsudo executable - checks bundled location first, then PATH
   */
  private findGsudo(): string | null {
    if (this.platform !== 'win32') return null;

    // Check for bundled gsudo in app resources
    // In production: resources/gsudo/gsudo.exe
    // In development: packages/desktop/resources/gsudo/gsudo.exe
    const possiblePaths = [
      // Production path (packaged app)
      path.join(process.resourcesPath || '', 'gsudo', 'gsudo.exe'),
      // Development paths
      path.join(__dirname, '..', '..', 'resources', 'gsudo', 'gsudo.exe'),
      path.join(__dirname, '..', 'resources', 'gsudo', 'gsudo.exe'),
    ];

    for (const gsudoPath of possiblePaths) {
      if (fs.existsSync(gsudoPath)) {
        return gsudoPath;
      }
    }

    // Check if gsudo is in PATH
    try {
      const result = execSync('where gsudo', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      const gsudoPath = result.trim().split('\n')[0];
      if (gsudoPath && fs.existsSync(gsudoPath)) {
        return gsudoPath;
      }
    } catch {
      // gsudo not in PATH
    }

    return null;
  }

  /**
   * Spawn a new local shell session
   */
  spawn(shellInfo: LocalShellInfo): string {
    const sessionId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let shell = shellInfo.path;
    let args = shellInfo.args || [];

    // For elevated shells on Windows, use gsudo if available
    if (shellInfo.elevated && this.platform === 'win32') {
      const gsudoPath = this.findGsudo();
      const targetShell = shellInfo.path;
      const isCmd = targetShell.toLowerCase().includes('cmd');

      if (gsudoPath) {
        // Use gsudo to run elevated in-tab
        shell = gsudoPath;
        args = isCmd ? [targetShell, '/k'] : [targetShell];
      } else {
        // Fall back to PowerShell Start-Process (opens external window)
        shell = 'powershell.exe';
        args = [
          '-NoProfile',
          '-Command',
          `Write-Host 'gsudo not found. Launching elevated window via UAC...' -ForegroundColor Yellow; ` +
          `Write-Host 'To run admin shells in this tab, install gsudo: winget install gsudo' -ForegroundColor Gray; ` +
          `Write-Host ''; ` +
          `Start-Process "${targetShell}" -Verb RunAs; ` +
          `Start-Sleep -Seconds 2`
        ];
      }
    }

    // Get environment variables
    const env = { ...process.env };

    // Set TERM for proper terminal support
    env.TERM = 'xterm-256color';
    env.COLORTERM = 'truecolor';

    // Determine initial size
    const cols = 80;
    const rows = 24;

    // Determine home directory for cwd
    const cwd = os.homedir();

    try {
      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
        useConpty: this.platform === 'win32', // Use ConPTY on Windows
      });

      const session: LocalShellSession = {
        id: sessionId,
        shellInfo,
        ptyProcess,
      };

      // Handle data events
      ptyProcess.onData((data: string) => {
        this.eventCallback(sessionId, { type: 'data', data });
      });

      // Handle exit events
      ptyProcess.onExit(({ exitCode }) => {
        this.eventCallback(sessionId, { type: 'close', exitCode });
        this.sessions.delete(sessionId);
      });

      this.sessions.set(sessionId, session);

      return sessionId;
    } catch (err: any) {
      this.eventCallback(sessionId, {
        type: 'error',
        message: err.message || 'Failed to spawn shell',
      });
      throw err;
    }
  }

  /**
   * Write data to a shell session
   */
  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.ptyProcess.write(data);
    }
  }

  /**
   * Resize a shell session
   */
  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.ptyProcess.resize(cols, rows);
    }
  }

  /**
   * Kill a shell session
   */
  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.ptyProcess.kill();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Disconnect all sessions
   */
  disconnectAll(): void {
    for (const [sessionId, session] of this.sessions) {
      try {
        session.ptyProcess.kill();
      } catch (err) {
        console.error(`Failed to kill session ${sessionId}:`, err);
      }
    }
    this.sessions.clear();
  }

  /**
   * Get active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}
