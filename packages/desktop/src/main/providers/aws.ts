/**
 * AWS EC2 Provider
 * Uses AWS SDK to discover EC2 instances
 */

import type {
  Provider,
  DiscoveredHost,
  DiscoveryResult,
  AWSConfig,
} from '@connectty/shared';
import { generateId } from '@connectty/shared';
import { IProviderService, detectOSType } from './index';

// Dynamic import of AWS SDK (optional dependency)
let EC2Client: any;
let DescribeInstancesCommand: any;

async function loadAWSSdk() {
  if (!EC2Client) {
    try {
      const ec2Module = await import('@aws-sdk/client-ec2');
      EC2Client = ec2Module.EC2Client;
      DescribeInstancesCommand = ec2Module.DescribeInstancesCommand;
    } catch {
      throw new Error('AWS SDK not installed. Run: npm install @aws-sdk/client-ec2');
    }
  }
}

export class AWSProvider implements IProviderService {
  async testConnection(provider: Provider): Promise<boolean> {
    const config = provider.config as AWSConfig;
    try {
      await loadAWSSdk();
      const client = this.createClient(config);
      await client.send(new DescribeInstancesCommand({ MaxResults: 5 }));
      return true;
    } catch {
      return false;
    }
  }

  async discoverHosts(provider: Provider): Promise<DiscoveryResult> {
    const config = provider.config as AWSConfig;
    const hosts: DiscoveredHost[] = [];

    try {
      await loadAWSSdk();

      const regions = [config.region, ...(config.regions || [])];
      const uniqueRegions = [...new Set(regions)];

      for (const region of uniqueRegions) {
        const client = this.createClient(config, region);
        let nextToken: string | undefined;

        do {
          const command = new DescribeInstancesCommand({
            NextToken: nextToken,
            MaxResults: 100,
          });

          const response = await client.send(command);
          nextToken = response.NextToken;

          for (const reservation of response.Reservations || []) {
            for (const instance of reservation.Instances || []) {
              const name = instance.Tags?.find((t: any) => t.Key === 'Name')?.Value || instance.InstanceId;
              const osType = detectOSType(
                instance.PlatformDetails,
                instance.ImageId,
                this.tagsToRecord(instance.Tags)
              );

              hosts.push({
                id: generateId(),
                providerId: provider.id,
                providerHostId: instance.InstanceId,
                name,
                hostname: instance.PublicDnsName || instance.PrivateDnsName,
                privateIp: instance.PrivateIpAddress,
                publicIp: instance.PublicIpAddress,
                osType,
                osName: instance.PlatformDetails,
                state: this.mapState(instance.State?.Name),
                metadata: {
                  instanceId: instance.InstanceId,
                  instanceType: instance.InstanceType,
                  region,
                  availabilityZone: instance.Placement?.AvailabilityZone || '',
                  vpcId: instance.VpcId || '',
                  subnetId: instance.SubnetId || '',
                  keyName: instance.KeyName || '',
                  imageId: instance.ImageId || '',
                },
                tags: this.tagsToRecord(instance.Tags),
                discoveredAt: new Date(),
                lastSeenAt: new Date(),
                imported: false,
              });
            }
          }
        } while (nextToken);
      }

      return {
        providerId: provider.id,
        providerName: provider.name,
        success: true,
        hosts,
        discoveredAt: new Date(),
      };
    } catch (error) {
      return {
        providerId: provider.id,
        providerName: provider.name,
        success: false,
        error: (error as Error).message,
        hosts: [],
        discoveredAt: new Date(),
      };
    }
  }

  private createClient(config: AWSConfig, region?: string): any {
    const clientConfig: any = {
      region: region || config.region,
    };

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    return new EC2Client(clientConfig);
  }

  private mapState(state?: string): 'running' | 'stopped' | 'suspended' | 'unknown' {
    switch (state) {
      case 'running':
        return 'running';
      case 'stopped':
        return 'stopped';
      case 'stopping':
      case 'pending':
      case 'shutting-down':
        return 'suspended';
      default:
        return 'unknown';
    }
  }

  private tagsToRecord(tags?: Array<{ Key?: string; Value?: string }>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const tag of tags || []) {
      if (tag.Key) {
        result[tag.Key] = tag.Value || '';
      }
    }
    return result;
  }
}
