/**
 * Datadog Health Monitoring Plugin
 * Polls Datadog for server metrics and calculates overall health status
 */

import axios from 'axios';
import type {
  DatadogHealthConfig,
  ConnectionHealthStatus,
  HealthStatus,
  ServerConnection,
} from '@connectty/shared';
import type { DatabaseService } from './database';

interface DatadogMetric {
  metric: string;
  points: Array<[number, number]>; // [timestamp, value]
}

interface DatadogQueryResponse {
  series: DatadogMetric[];
}

export class DatadogHealthService {
  private pollingIntervalId: NodeJS.Timeout | null = null;
  private healthCache: Map<string, ConnectionHealthStatus> = new Map();
  private eventCallbacks: Set<(status: ConnectionHealthStatus) => void> = new Set();

  private defaultConfig: DatadogHealthConfig = {
    enabled: false,
    apiKey: '',
    appKey: '',
    site: 'datadoghq.com',
    pollInterval: 15, // minutes
    thresholds: {
      cpu: { yellow: 70, red: 90 },
      memory: { yellow: 75, red: 90 },
      disk: { yellow: 80, red: 95 },
    },
  };

  constructor(private db: DatabaseService) {}

  /**
   * Start health monitoring with given configuration
   */
  start(config: DatadogHealthConfig): boolean {
    if (!config.apiKey || !config.appKey) {
      console.error('Datadog API keys not configured');
      return false;
    }

    if (this.pollingIntervalId) {
      this.stop();
    }

    // Validate config
    const validatedConfig = this.validateConfig(config);

    // Start polling
    console.log(`Starting Datadog health monitoring (polling every ${validatedConfig.pollInterval} minutes)`);

    // Immediate first poll
    this.pollAllConnections(validatedConfig).catch(err =>
      console.error('Failed to poll Datadog:', err)
    );

    // Set up interval
    const intervalMs = validatedConfig.pollInterval * 60 * 1000;
    this.pollingIntervalId = setInterval(() => {
      this.pollAllConnections(validatedConfig).catch(err =>
        console.error('Failed to poll Datadog:', err)
      );
    }, intervalMs);

    return true;
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
      console.log('Stopped Datadog health monitoring');
    }
  }

  /**
   * Validate and normalize configuration
   */
  validateConfig(config: Partial<DatadogHealthConfig>): DatadogHealthConfig {
    return {
      enabled: config.enabled ?? this.defaultConfig.enabled,
      apiKey: config.apiKey || this.defaultConfig.apiKey,
      appKey: config.appKey || this.defaultConfig.appKey,
      site: config.site || this.defaultConfig.site,
      pollInterval: Math.max(1, Math.min(60, config.pollInterval ?? this.defaultConfig.pollInterval)),
      thresholds: {
        cpu: {
          yellow: config.thresholds?.cpu?.yellow ?? this.defaultConfig.thresholds.cpu.yellow,
          red: config.thresholds?.cpu?.red ?? this.defaultConfig.thresholds.cpu.red,
        },
        memory: {
          yellow: config.thresholds?.memory?.yellow ?? this.defaultConfig.thresholds.memory.yellow,
          red: config.thresholds?.memory?.red ?? this.defaultConfig.thresholds.memory.red,
        },
        disk: {
          yellow: config.thresholds?.disk?.yellow ?? this.defaultConfig.thresholds.disk.yellow,
          red: config.thresholds?.disk?.red ?? this.defaultConfig.thresholds.disk.red,
        },
      },
    };
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): DatadogHealthConfig {
    return { ...this.defaultConfig };
  }

  /**
   * Poll all connections for health status
   */
  private async pollAllConnections(config: DatadogHealthConfig): Promise<void> {
    const connections = this.db.getConnections();

    console.log(`Polling Datadog for ${connections.length} connections...`);

    // Poll connections in parallel (with concurrency limit)
    const batchSize = 5;
    for (let i = 0; i < connections.length; i += batchSize) {
      const batch = connections.slice(i, i + batchSize);
      await Promise.all(
        batch.map(conn => this.pollConnection(conn, config).catch(err => {
          console.error(`Failed to poll ${conn.hostname}:`, err.message);
        }))
      );
    }
  }

  /**
   * Poll single connection for health status
   */
  private async pollConnection(
    connection: ServerConnection,
    config: DatadogHealthConfig
  ): Promise<void> {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    try {
      // Query Datadog for CPU, memory, and disk metrics
      const [cpuData, memoryData, diskData] = await Promise.all([
        this.queryMetric(config, connection.hostname, 'system.cpu.user', fiveMinutesAgo, now),
        this.queryMetric(config, connection.hostname, 'system.mem.pct_usable', fiveMinutesAgo, now),
        this.queryMetric(config, connection.hostname, 'system.disk.in_use', fiveMinutesAgo, now),
      ]);

      // Calculate average values
      const cpuUsage = this.calculateAverage(cpuData);
      const memoryAvg = this.calculateAverage(memoryData);
      const memoryUsage = memoryAvg !== undefined ? 100 - memoryAvg : undefined;
      const diskUsage = this.calculateAverage(diskData);

      // Determine overall health status
      const healthStatus = this.calculateHealthStatus(
        { cpu: cpuUsage, memory: memoryUsage, disk: diskUsage },
        config.thresholds
      );

      // Build issues list
      const issues: string[] = [];
      if (cpuUsage !== undefined && cpuUsage >= config.thresholds.cpu.yellow) {
        issues.push(`High CPU usage: ${cpuUsage.toFixed(1)}%`);
      }
      if (memoryUsage !== undefined && memoryUsage >= config.thresholds.memory.yellow) {
        issues.push(`High memory usage: ${memoryUsage.toFixed(1)}%`);
      }
      if (diskUsage !== undefined && diskUsage >= config.thresholds.disk.yellow) {
        issues.push(`High disk usage: ${diskUsage.toFixed(1)}%`);
      }

      // Create health status object
      const status: ConnectionHealthStatus = {
        connectionId: connection.id,
        hostname: connection.hostname,
        status: healthStatus.status,
        lastChecked: new Date(),
        metrics: {
          cpu: cpuUsage,
          memory: memoryUsage,
          disk: diskUsage,
        },
        issues: issues.length > 0 ? issues : undefined,
      };

      // Update cache
      const previousStatus = this.healthCache.get(connection.id);
      this.healthCache.set(connection.id, status);

      // Update database with health status
      this.db.updateConnection(connection.id, {
        healthStatus: status.status,
        healthLastChecked: status.lastChecked,
      });

      // Emit event if status changed
      if (!previousStatus || previousStatus.status !== status.status) {
        this.emitHealthUpdate(status);
      }

      console.log(
        `[${connection.hostname}] Health: ${status.status.toUpperCase()} ` +
        `(CPU: ${cpuUsage?.toFixed(1) ?? 'N/A'}%, ` +
        `MEM: ${memoryUsage?.toFixed(1) ?? 'N/A'}%, ` +
        `DISK: ${diskUsage?.toFixed(1) ?? 'N/A'}%)`
      );

    } catch (error) {
      // If we can't get metrics, mark as unknown
      const status: ConnectionHealthStatus = {
        connectionId: connection.id,
        hostname: connection.hostname,
        status: 'unknown',
        lastChecked: new Date(),
        issues: [`Unable to fetch metrics: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };

      this.healthCache.set(connection.id, status);

      this.db.updateConnection(connection.id, {
        healthStatus: 'unknown',
        healthLastChecked: status.lastChecked,
      });

      console.warn(`[${connection.hostname}] Failed to get health status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Query Datadog metric API
   */
  private async queryMetric(
    config: DatadogHealthConfig,
    hostname: string,
    metric: string,
    from: number,
    to: number
  ): Promise<number[] | undefined> {
    const url = `https://api.${config.site}/api/v1/query`;

    try {
      const response = await axios.get<DatadogQueryResponse>(url, {
        params: {
          query: `avg:${metric}{host:${hostname}}`,
          from: Math.floor(from / 1000),
          to: Math.floor(to / 1000),
        },
        headers: {
          'DD-API-KEY': config.apiKey,
          'DD-APPLICATION-KEY': config.appKey,
        },
        timeout: 10000,
      });

      if (response.data.series && response.data.series.length > 0) {
        // Extract values from points
        const values = response.data.series[0].points.map((point: [number, number]) => point[1]);
        return values.filter((v: number) => v !== null && !isNaN(v));
      }

      return undefined;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // Host not found in Datadog
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Calculate average of metric values
   */
  private calculateAverage(values: number[] | undefined): number | undefined {
    if (!values || values.length === 0) {
      return undefined;
    }

    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  /**
   * Calculate overall health status based on metrics and thresholds
   */
  private calculateHealthStatus(
    metrics: {
      cpu?: number;
      memory?: number;
      disk?: number;
    },
    thresholds: DatadogHealthConfig['thresholds']
  ): { status: HealthStatus; reason?: string } {
    const issues: Array<{ severity: 'red' | 'yellow'; message: string }> = [];

    // Check CPU
    if (metrics.cpu !== undefined) {
      if (metrics.cpu >= thresholds.cpu.red) {
        issues.push({ severity: 'red', message: 'Critical CPU usage' });
      } else if (metrics.cpu >= thresholds.cpu.yellow) {
        issues.push({ severity: 'yellow', message: 'High CPU usage' });
      }
    }

    // Check memory
    if (metrics.memory !== undefined) {
      if (metrics.memory >= thresholds.memory.red) {
        issues.push({ severity: 'red', message: 'Critical memory usage' });
      } else if (metrics.memory >= thresholds.memory.yellow) {
        issues.push({ severity: 'yellow', message: 'High memory usage' });
      }
    }

    // Check disk
    if (metrics.disk !== undefined) {
      if (metrics.disk >= thresholds.disk.red) {
        issues.push({ severity: 'red', message: 'Critical disk usage' });
      } else if (metrics.disk >= thresholds.disk.yellow) {
        issues.push({ severity: 'yellow', message: 'High disk usage' });
      }
    }

    // Determine overall status (worst case)
    if (issues.some(i => i.severity === 'red')) {
      return { status: 'red', reason: issues.find(i => i.severity === 'red')?.message };
    }

    if (issues.some(i => i.severity === 'yellow')) {
      return { status: 'yellow', reason: issues.find(i => i.severity === 'yellow')?.message };
    }

    // All metrics available and good
    if (metrics.cpu !== undefined || metrics.memory !== undefined || metrics.disk !== undefined) {
      return { status: 'green' };
    }

    // No metrics available
    return { status: 'unknown', reason: 'No metrics available' };
  }

  /**
   * Get cached health status for a connection
   */
  getHealthStatus(connectionId: string): ConnectionHealthStatus | undefined {
    return this.healthCache.get(connectionId);
  }

  /**
   * Get all cached health statuses
   */
  getAllHealthStatuses(): ConnectionHealthStatus[] {
    return Array.from(this.healthCache.values());
  }

  /**
   * Register callback for health status updates
   */
  onHealthUpdate(callback: (status: ConnectionHealthStatus) => void): () => void {
    this.eventCallbacks.add(callback);
    return () => {
      this.eventCallbacks.delete(callback);
    };
  }

  /**
   * Emit health status update to all registered callbacks
   */
  private emitHealthUpdate(status: ConnectionHealthStatus): void {
    this.eventCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Error in health update callback:', error);
      }
    });
  }

  /**
   * Force immediate poll of all connections
   */
  async forcePoll(config: DatadogHealthConfig): Promise<void> {
    await this.pollAllConnections(config);
  }

  /**
   * Clear all cached health statuses
   */
  clearCache(): void {
    this.healthCache.clear();
  }
}
