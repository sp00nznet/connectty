/**
 * Box Analyzer Service - "What Does This Box Do?"
 * Analyzes connected systems to determine their purpose, applications, and connections
 * Integrates with Datadog for enhanced monitoring
 */

import type { Client } from 'ssh2';
import type {
  SystemTheory,
  DetectedApplication,
  ConnectedSystem,
  SystemRole,
  TheoryConfidence,
  BoxAnalysisSettings,
} from '@connectty/shared';
import axios, { AxiosInstance } from 'axios';

interface AnalysisCache {
  theory: SystemTheory;
  lastUpdated: Date;
}

export class BoxAnalyzerService {
  private analysisCache = new Map<string, AnalysisCache>();
  private pollingIntervals = new Map<string, NodeJS.Timeout>();
  private datadogClient: AxiosInstance | null = null;
  private settings: BoxAnalysisSettings | null = null;

  /**
   * Initialize Datadog client with credentials
   */
  initializeDatadog(settings: BoxAnalysisSettings): void {
    this.settings = settings;

    if (settings.datadogEnabled && settings.datadogApiKey && settings.datadogAppKey) {
      const site = settings.datadogSite || 'datadoghq.com';
      this.datadogClient = axios.create({
        baseURL: `https://api.${site}/api/v1`,
        headers: {
          'DD-API-KEY': settings.datadogApiKey,
          'DD-APPLICATION-KEY': settings.datadogAppKey,
        },
        timeout: 30000,
      });
    } else {
      this.datadogClient = null;
    }
  }

  /**
   * Start analyzing a connection (one-time or with polling)
   */
  async startAnalysis(
    connectionId: string,
    connectionName: string,
    sshClient: Client,
    callback: (theory: SystemTheory) => void,
    enablePolling = false
  ): Promise<void> {
    // Run initial analysis
    const theory = await this.analyzeSystem(connectionId, connectionName, sshClient);
    this.analysisCache.set(connectionId, { theory, lastUpdated: new Date() });
    callback(theory);

    // Set up polling if enabled
    if (enablePolling && this.settings?.pollingEnabled) {
      this.stopPolling(connectionId); // Clear any existing interval

      const intervalMs = (this.settings.pollingInterval || 15) * 60 * 1000;
      const interval = setInterval(async () => {
        try {
          const updatedTheory = await this.analyzeSystem(connectionId, connectionName, sshClient);
          this.analysisCache.set(connectionId, { theory: updatedTheory, lastUpdated: new Date() });
          callback(updatedTheory);
        } catch (error) {
          console.error('Polling analysis failed:', error);
        }
      }, intervalMs);

      this.pollingIntervals.set(connectionId, interval);
    }
  }

  /**
   * Stop polling for a connection
   */
  stopPolling(connectionId: string): void {
    const interval = this.pollingIntervals.get(connectionId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(connectionId);
    }
  }

  /**
   * Get cached analysis for a connection
   */
  getCachedAnalysis(connectionId: string): SystemTheory | null {
    return this.analysisCache.get(connectionId)?.theory || null;
  }

  /**
   * Main analysis function - determines what the system does
   */
  private async analyzeSystem(
    connectionId: string,
    hostname: string,
    sshClient: Client
  ): Promise<SystemTheory> {
    const evidence: SystemTheory['evidence'] = [];
    const applications: DetectedApplication[] = [];
    const connectedSystems: ConnectedSystem[] = [];
    const insights: string[] = [];

    // Collect system data
    const [processes, services, ports, packages, osInfo] = await Promise.all([
      this.getRunningProcesses(sshClient),
      this.getServices(sshClient),
      this.getListeningPorts(sshClient),
      this.getInstalledPackages(sshClient),
      this.getOSInfo(sshClient),
    ]);

    // Detect applications from processes and packages
    const detectedApps = this.detectApplications(processes, packages, ports);
    applications.push(...detectedApps);

    // Identify connected systems from network connections
    const connections = await this.getNetworkConnections(sshClient);
    const connectedHosts = this.identifyConnectedSystems(connections);
    connectedSystems.push(...connectedHosts);

    // Build evidence
    if (processes.length > 0) {
      evidence.push({
        category: 'Running Processes',
        findings: processes.slice(0, 20).map(p => `${p.name} (PID: ${p.pid})`),
      });
    }

    if (services.length > 0) {
      evidence.push({
        category: 'Active Services',
        findings: services.slice(0, 15),
      });
    }

    if (ports.length > 0) {
      evidence.push({
        category: 'Listening Ports',
        findings: ports.map(p => `Port ${p.port}/${p.protocol} - ${p.process || 'unknown'}`),
      });
    }

    if (packages.length > 0) {
      evidence.push({
        category: 'Key Packages',
        findings: packages.slice(0, 20).map(pkg => `${pkg.name} ${pkg.version || ''}`),
      });
    }

    // Determine primary role
    const roleAnalysis = this.determineServerRole(processes, services, packages, ports);

    // Get Datadog metrics if enabled
    let datadogMetrics;
    if (this.datadogClient && this.settings?.datadogEnabled) {
      try {
        datadogMetrics = await this.getDatadogMetrics(hostname);
        if (datadogMetrics) {
          insights.push(
            `Datadog monitoring active with ${datadogMetrics.metrics.length} metrics`,
            `Tagged with: ${datadogMetrics.tags.join(', ')}`
          );
        }
      } catch (error) {
        console.error('Failed to fetch Datadog metrics:', error);
      }
    }

    // Generate insights
    insights.push(
      ...this.generateInsights(applications, connectedSystems, roleAnalysis.role, osInfo)
    );

    return {
      connectionId,
      timestamp: new Date(),
      primaryRole: roleAnalysis.role,
      confidence: roleAnalysis.confidence,
      evidence,
      applications,
      connectedSystems,
      insights,
      datadogMetrics,
    };
  }

  /**
   * Get running processes from the system
   */
  private async getRunningProcesses(sshClient: Client): Promise<Array<{ name: string; pid: number; cpu?: number }>> {
    const command = `ps aux --sort=-%cpu | head -30 | awk '{print $2","$3","$11}'`;
    const output = await this.executeCommand(sshClient, command);

    return output
      .split('\n')
      .slice(1) // Skip header
      .map(line => {
        const [pid, cpu, name] = line.split(',');
        return {
          pid: parseInt(pid) || 0,
          cpu: parseFloat(cpu) || 0,
          name: name?.trim() || '',
        };
      })
      .filter(p => p.name);
  }

  /**
   * Get active services
   */
  private async getServices(sshClient: Client): Promise<string[]> {
    const command = `systemctl list-units --type=service --state=running --no-pager --plain | awk '{print $1}' | grep .service`;
    try {
      const output = await this.executeCommand(sshClient, command);
      return output.split('\n').filter(s => s.trim());
    } catch {
      return [];
    }
  }

  /**
   * Get listening ports
   */
  private async getListeningPorts(sshClient: Client): Promise<Array<{ port: number; protocol: string; process?: string }>> {
    const command = `ss -tulnp | grep LISTEN | awk '{print $5,$7}' | sort -u`;
    try {
      const output = await this.executeCommand(sshClient, command);
      return output.split('\n').map(line => {
        const [addr, processInfo] = line.split(' ');
        const port = parseInt(addr?.split(':').pop() || '0');
        const process = processInfo?.match(/users:\(\("([^"]+)"/)?.[1];
        return {
          port,
          protocol: 'tcp',
          process,
        };
      }).filter(p => p.port > 0);
    } catch {
      return [];
    }
  }

  /**
   * Get installed packages
   */
  private async getInstalledPackages(sshClient: Client): Promise<Array<{ name: string; version?: string }>> {
    // Try dpkg first (Debian/Ubuntu)
    let command = `dpkg -l | awk '/^ii/ {print $2","$3}' | head -100`;
    try {
      const output = await this.executeCommand(sshClient, command);
      if (output.trim()) {
        return output.split('\n').map(line => {
          const [name, version] = line.split(',');
          return { name: name?.trim() || '', version: version?.trim() };
        }).filter(p => p.name);
      }
    } catch {
      // Try rpm (RedHat/CentOS)
      command = `rpm -qa --qf '%{NAME},%{VERSION}\\n' | head -100`;
      try {
        const output = await this.executeCommand(sshClient, command);
        return output.split('\n').map(line => {
          const [name, version] = line.split(',');
          return { name: name?.trim() || '', version: version?.trim() };
        }).filter(p => p.name);
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Get OS information
   */
  private async getOSInfo(sshClient: Client): Promise<string> {
    try {
      const output = await this.executeCommand(sshClient, 'cat /etc/os-release | grep PRETTY_NAME');
      return output.split('=')[1]?.replace(/"/g, '').trim() || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Get network connections
   */
  private async getNetworkConnections(sshClient: Client): Promise<Array<{ local: string; remote: string; state: string }>> {
    const command = `ss -tan | grep ESTAB | awk '{print $4,$5}'`;
    try {
      const output = await this.executeCommand(sshClient, command);
      return output.split('\n').map(line => {
        const [local, remote] = line.split(' ');
        return { local: local || '', remote: remote || '', state: 'ESTABLISHED' };
      }).filter(c => c.remote);
    } catch {
      return [];
    }
  }

  /**
   * Detect applications from processes and packages
   */
  private detectApplications(
    processes: Array<{ name: string }>,
    packages: Array<{ name: string; version?: string }>,
    ports: Array<{ port: number; process?: string }>
  ): DetectedApplication[] {
    const applications: DetectedApplication[] = [];
    const processNames = processes.map(p => p.name.toLowerCase());
    const packageMap = new Map(packages.map(p => [p.name.toLowerCase(), p.version]));

    // Application detection patterns (based on whatdoesthisboxdo patterns)
    const appPatterns: Record<string, { keywords: string[]; commonPorts?: number[] }> = {
      'nginx': { keywords: ['nginx'], commonPorts: [80, 443] },
      'Apache': { keywords: ['apache', 'httpd'], commonPorts: [80, 443] },
      'PostgreSQL': { keywords: ['postgres'], commonPorts: [5432] },
      'MySQL': { keywords: ['mysql', 'mysqld'], commonPorts: [3306] },
      'MongoDB': { keywords: ['mongod'], commonPorts: [27017] },
      'Redis': { keywords: ['redis-server'], commonPorts: [6379] },
      'Docker': { keywords: ['dockerd', 'containerd'] },
      'Kubernetes': { keywords: ['kubelet', 'kube-proxy', 'kube-apiserver'] },
      'Elasticsearch': { keywords: ['elasticsearch'], commonPorts: [9200, 9300] },
      'RabbitMQ': { keywords: ['rabbitmq'], commonPorts: [5672, 15672] },
      'Jenkins': { keywords: ['jenkins'], commonPorts: [8080] },
      'Prometheus': { keywords: ['prometheus'], commonPorts: [9090] },
      'Grafana': { keywords: ['grafana'], commonPorts: [3000] },
    };

    for (const [appName, pattern] of Object.entries(appPatterns)) {
      const evidence: string[] = [];
      let confidence: TheoryConfidence = 'low';

      // Check processes
      const processMatch = pattern.keywords.some(kw =>
        processNames.some(name => name.includes(kw))
      );

      if (processMatch) {
        evidence.push('Running process detected');
        confidence = 'medium';
      }

      // Check packages
      const packageMatch = pattern.keywords.some(kw => packageMap.has(kw));
      const version = pattern.keywords.map(kw => packageMap.get(kw)).find(v => v);

      if (packageMatch) {
        evidence.push('Package installed');
        if (confidence === 'medium') confidence = 'high';
        else if (confidence === 'low') confidence = 'medium';
      }

      // Check ports
      if (pattern.commonPorts) {
        const portMatch = pattern.commonPorts.some(port =>
          ports.some(p => p.port === port)
        );
        if (portMatch) {
          evidence.push(`Listening on port ${pattern.commonPorts.join(', ')}`);
          if (confidence === 'medium' || confidence === 'high') confidence = 'high';
        }
      }

      if (evidence.length > 0) {
        applications.push({
          name: appName,
          version,
          confidence,
          evidence,
        });
      }
    }

    return applications;
  }

  /**
   * Identify connected systems from network connections
   */
  private identifyConnectedSystems(
    connections: Array<{ local: string; remote: string }>
  ): ConnectedSystem[] {
    const systems = new Map<string, ConnectedSystem>();

    for (const conn of connections) {
      const [ip, port] = conn.remote.split(':');
      if (!ip || ip.startsWith('127.') || ip.startsWith('::1')) continue;

      const key = `${ip}:${port}`;
      if (!systems.has(key)) {
        systems.set(key, {
          ip,
          port: parseInt(port) || 0,
          protocol: 'tcp',
          connectionType: 'outbound',
          confidence: 'low',
        });
      }
    }

    return Array.from(systems.values());
  }

  /**
   * Determine server role based on collected data
   */
  private determineServerRole(
    processes: Array<{ name: string }>,
    services: string[],
    packages: Array<{ name: string }>,
    ports: Array<{ port: number }>
  ): { role: SystemRole; confidence: TheoryConfidence } {
    const processNames = processes.map(p => p.name.toLowerCase()).join(' ');
    const serviceNames = services.join(' ').toLowerCase();
    const packageNames = packages.map(p => p.name.toLowerCase()).join(' ');
    const openPorts = ports.map(p => p.port);

    // Role detection patterns (simplified version from whatdoesthisboxdo)
    const rolePatterns: Array<{
      role: SystemRole;
      keywords: string[];
      ports?: number[];
      minMatches: number;
    }> = [
      { role: 'web-server', keywords: ['nginx', 'apache', 'httpd'], ports: [80, 443], minMatches: 1 },
      { role: 'database', keywords: ['postgres', 'mysql', 'mongodb', 'redis', 'mariadb'], minMatches: 1 },
      { role: 'container-host', keywords: ['docker', 'containerd', 'podman'], minMatches: 1 },
      { role: 'kubernetes-node', keywords: ['kubelet', 'kube-proxy'], minMatches: 2 },
      { role: 'cache', keywords: ['redis', 'memcache', 'varnish'], minMatches: 1 },
      { role: 'message-queue', keywords: ['rabbitmq', 'kafka', 'activemq'], minMatches: 1 },
      { role: 'load-balancer', keywords: ['haproxy', 'nginx'], ports: [80, 443], minMatches: 1 },
      { role: 'monitoring', keywords: ['prometheus', 'grafana', 'nagios', 'zabbix'], minMatches: 1 },
      { role: 'ci-cd', keywords: ['jenkins', 'gitlab-runner', 'teamcity'], minMatches: 1 },
    ];

    for (const pattern of rolePatterns) {
      let matches = 0;
      const allData = `${processNames} ${serviceNames} ${packageNames}`;

      for (const keyword of pattern.keywords) {
        if (allData.includes(keyword)) matches++;
      }

      if (pattern.ports) {
        const portMatch = pattern.ports.some(p => openPorts.includes(p));
        if (portMatch) matches++;
      }

      if (matches >= pattern.minMatches) {
        const confidence: TheoryConfidence = matches >= 3 ? 'high' : matches === 2 ? 'medium' : 'low';
        return { role: pattern.role, confidence };
      }
    }

    return { role: 'unknown', confidence: 'low' };
  }

  /**
   * Generate insights based on analysis
   */
  private generateInsights(
    applications: DetectedApplication[],
    connectedSystems: ConnectedSystem[],
    role: SystemRole,
    osInfo: string
  ): string[] {
    const insights: string[] = [];

    insights.push(`Operating System: ${osInfo}`);
    insights.push(`Detected as: ${role.replace(/-/g, ' ')}`);

    if (applications.length > 0) {
      const highConfApps = applications.filter(a => a.confidence === 'high' || a.confidence === 'certain');
      if (highConfApps.length > 0) {
        insights.push(`Primary applications: ${highConfApps.map(a => a.name).join(', ')}`);
      }
    }

    if (connectedSystems.length > 0) {
      insights.push(`Connected to ${connectedSystems.length} external systems`);

      // Group by port to identify common connection types
      const portGroups = new Map<number, number>();
      connectedSystems.forEach(sys => {
        portGroups.set(sys.port, (portGroups.get(sys.port) || 0) + 1);
      });

      const commonPorts = Array.from(portGroups.entries())
        .filter(([_, count]) => count > 2)
        .map(([port]) => port);

      if (commonPorts.includes(3306)) insights.push('Multiple MySQL database connections detected');
      if (commonPorts.includes(5432)) insights.push('Multiple PostgreSQL database connections detected');
      if (commonPorts.includes(443)) insights.push('Multiple HTTPS connections detected');
    }

    return insights;
  }

  /**
   * Get Datadog metrics for a host
   */
  private async getDatadogMetrics(hostname: string): Promise<SystemTheory['datadogMetrics']> {
    if (!this.datadogClient) return undefined;

    const now = Math.floor(Date.now() / 1000);
    const from = now - 3600; // Last hour

    try {
      // Get host tags
      const tagsResponse = await this.datadogClient.get(`/tags/hosts/${hostname}`);
      const tags = tagsResponse.data?.tags || [];

      // Get key metrics
      const metricQueries = [
        'system.cpu.user',
        'system.mem.pct_usable',
        'system.disk.in_use',
        'system.net.bytes_rcvd',
      ];

      const metrics: Record<string, number> = {};

      for (const metric of metricQueries) {
        try {
          const response = await this.datadogClient.get('/query', {
            params: {
              query: `${metric}{host:${hostname}}`,
              from,
              to: now,
            },
          });

          if (response.data?.series?.[0]?.pointlist?.length > 0) {
            const points = response.data.series[0].pointlist;
            const lastPoint = points[points.length - 1];
            metrics[metric] = lastPoint[1];
          }
        } catch (error) {
          console.error(`Failed to fetch metric ${metric}:`, error);
        }
      }

      return {
        tags,
        metrics,
        lastUpdated: new Date(),
      };
    } catch (error) {
      console.error('Failed to fetch Datadog data:', error);
      return undefined;
    }
  }

  /**
   * Execute a command via SSH
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
    for (const [connectionId] of this.pollingIntervals) {
      this.stopPolling(connectionId);
    }
    this.analysisCache.clear();
  }
}
