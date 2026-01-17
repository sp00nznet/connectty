/**
 * Plugin service for collecting host statistics and other plugin functionality
 */

import type { Client } from 'ssh2';
import type { HostStats } from '@connectty/shared';

export class PluginService {
  // Active stat collection intervals per connection
  private statIntervals = new Map<string, NodeJS.Timeout>();

  /**
   * Start collecting host stats for a connection
   */
  startStatsCollection(
    connectionId: string,
    sshClient: Client,
    callback: (stats: HostStats) => void,
    intervalMs = 3000
  ): void {
    // Clear any existing interval
    this.stopStatsCollection(connectionId);

    // Collect initial stats immediately
    this.collectStats(connectionId, sshClient, callback);

    // Then collect on interval
    const interval = setInterval(() => {
      this.collectStats(connectionId, sshClient, callback);
    }, intervalMs);

    this.statIntervals.set(connectionId, interval);
  }

  /**
   * Stop collecting stats for a connection
   */
  stopStatsCollection(connectionId: string): void {
    const interval = this.statIntervals.get(connectionId);
    if (interval) {
      clearInterval(interval);
      this.statIntervals.delete(connectionId);
    }
  }

  /**
   * Collect current stats from a host via SSH
   */
  private async collectStats(
    connectionId: string,
    sshClient: Client,
    callback: (stats: HostStats) => void
  ): Promise<void> {
    try {
      // Determine OS type to use appropriate commands
      const osType = await this.detectOSType(sshClient);

      let stats: HostStats;

      if (osType === 'windows') {
        stats = await this.collectWindowsStats(connectionId, sshClient);
      } else {
        stats = await this.collectLinuxStats(connectionId, sshClient);
      }

      callback(stats);
    } catch (error) {
      // Silently fail - connection might be closed or command failed
      console.error('Failed to collect stats:', error);
    }
  }

  /**
   * Detect OS type via SSH
   */
  private async detectOSType(sshClient: Client): Promise<'linux' | 'windows'> {
    return new Promise((resolve) => {
      sshClient.exec('uname', (err) => {
        // If uname command exists, it's Linux/Unix
        // If it doesn't, assume Windows
        resolve(err ? 'windows' : 'linux');
      });
    });
  }

  /**
   * Collect stats from Linux/Unix host
   */
  private async collectLinuxStats(
    connectionId: string,
    sshClient: Client
  ): Promise<HostStats> {
    // Combined command to gather all stats in one execution
    const command = `
      # CPU usage
      top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print 100 - $1}'

      # CPU cores
      nproc

      # Load average
      cat /proc/loadavg | awk '{print $1,$2,$3}'

      # Memory stats (in KB)
      free | grep Mem | awk '{print $2,$3,$4}'

      # Disk stats
      df -k / | tail -1 | awk '{print $2,$3,$4}'

      # Network stats
      cat /proc/net/dev | grep -E "eth0|ens|wlan" | head -1 | awk '{print $1,$2,$10}'
    `.trim();

    const output = await this.executeCommand(sshClient, command);
    const lines = output.trim().split('\n');

    const cpuUsage = parseFloat(lines[0]) || 0;
    const cpuCores = parseInt(lines[1]) || 1;
    const loadAvg = lines[2].split(' ').map(parseFloat);

    const [memTotal, memUsed, memFree] = lines[3].split(' ').map(v => parseInt(v) * 1024);
    const memUsage = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

    const [diskTotal, diskUsed, diskFree] = lines[4].split(' ').map(v => parseInt(v) * 1024);
    const diskUsage = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

    const netParts = lines[5]?.split(' ') || [];
    const netInterface = netParts[0]?.replace(':', '') || 'eth0';
    const netRx = parseInt(netParts[1]) || 0;
    const netTx = parseInt(netParts[2]) || 0;

    return {
      connectionId,
      timestamp: new Date(),
      cpu: {
        usage: Math.round(cpuUsage * 10) / 10,
        cores: cpuCores,
        loadAverage: loadAvg.length === 3 ? loadAvg : undefined,
      },
      memory: {
        total: memTotal,
        used: memUsed,
        free: memFree,
        usage: Math.round(memUsage * 10) / 10,
      },
      disk: [
        {
          total: diskTotal,
          used: diskUsed,
          free: diskFree,
          usage: Math.round(diskUsage * 10) / 10,
        },
      ],
      network: [
        {
          interface: netInterface,
          bytesReceived: netRx,
          bytesSent: netTx,
          packetsReceived: 0,
          packetsSent: 0,
        },
      ],
    };
  }

  /**
   * Collect stats from Windows host
   */
  private async collectWindowsStats(
    connectionId: string,
    sshClient: Client
  ): Promise<HostStats> {
    // PowerShell command to gather stats
    const command = `
      powershell -Command "
        $cpu = Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select -ExpandProperty Average;
        $cores = (Get-WmiObject Win32_Processor).NumberOfLogicalProcessors;
        $mem = Get-WmiObject Win32_OperatingSystem;
        $disk = Get-WmiObject Win32_LogicalDisk -Filter 'DeviceID=\\"C:\\"';
        $net = Get-WmiObject Win32_PerfFormattedData_Tcpip_NetworkInterface | Select -First 1;
        Write-Host \\\"$cpu|$cores|$($mem.TotalVisibleMemorySize)|$($mem.FreePhysicalMemory)|$($disk.Size)|$($disk.FreeSpace)|$($net.BytesReceivedPersec)|$($net.BytesSentPersec)\\\"
      "
    `.trim();

    const output = await this.executeCommand(sshClient, command);
    const parts = output.trim().split('|');

    const cpuUsage = parseFloat(parts[0]) || 0;
    const cpuCores = parseInt(parts[1]) || 1;
    const memTotal = parseInt(parts[2]) * 1024 || 0;
    const memFree = parseInt(parts[3]) * 1024 || 0;
    const memUsed = memTotal - memFree;
    const memUsage = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

    const diskTotal = parseInt(parts[4]) || 0;
    const diskFree = parseInt(parts[5]) || 0;
    const diskUsed = diskTotal - diskFree;
    const diskUsage = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

    const netRx = parseInt(parts[6]) || 0;
    const netTx = parseInt(parts[7]) || 0;

    return {
      connectionId,
      timestamp: new Date(),
      cpu: {
        usage: Math.round(cpuUsage * 10) / 10,
        cores: cpuCores,
      },
      memory: {
        total: memTotal,
        used: memUsed,
        free: memFree,
        usage: Math.round(memUsage * 10) / 10,
      },
      disk: [
        {
          total: diskTotal,
          used: diskUsed,
          free: diskFree,
          usage: Math.round(diskUsage * 10) / 10,
        },
      ],
      network: [
        {
          interface: 'Network',
          bytesReceived: netRx,
          bytesSent: netTx,
          packetsReceived: 0,
          packetsSent: 0,
        },
      ],
    };
  }

  /**
   * Execute a command via SSH and return output
   */
  private executeCommand(sshClient: Client, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      sshClient.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let output = '';
        let errorOutput = '';

        stream.on('data', (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr?.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

        stream.on('close', (code: number) => {
          if (code !== 0 && errorOutput) {
            reject(new Error(errorOutput));
          } else {
            resolve(output);
          }
        });
      });
    });
  }

  /**
   * Cleanup all intervals
   */
  cleanup(): void {
    for (const [connectionId] of this.statIntervals) {
      this.stopStatsCollection(connectionId);
    }
  }
}
