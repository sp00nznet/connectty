/**
 * Cloud and Hypervisor Provider Services
 */

import type {
  Provider,
  ProviderType,
  DiscoveredHost,
  DiscoveryResult,
  OSType,
} from '@connectty/shared';
import { ESXiProvider } from './esxi';
import { ProxmoxProvider } from './proxmox';
import { AWSProvider } from './aws';
import { GCPProvider } from './gcp';
import { AzureProvider } from './azure';
import { BigFixProvider } from './bigfix';

export interface IProviderService {
  testConnection(provider: Provider): Promise<boolean>;
  discoverHosts(provider: Provider): Promise<DiscoveryResult>;
}

export function getProviderService(type: ProviderType): IProviderService {
  switch (type) {
    case 'esxi':
      return new ESXiProvider();
    case 'proxmox':
      return new ProxmoxProvider();
    case 'aws':
      return new AWSProvider();
    case 'gcp':
      return new GCPProvider();
    case 'azure':
      return new AzureProvider();
    case 'bigfix':
      return new BigFixProvider();
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Detect OS type from various hints
 */
export function detectOSType(
  osName?: string,
  guestId?: string,
  tags?: Record<string, string>
): OSType {
  const hints = [
    osName?.toLowerCase() || '',
    guestId?.toLowerCase() || '',
    Object.values(tags || {}).join(' ').toLowerCase(),
  ].join(' ');

  if (hints.includes('windows') || hints.includes('win32') || hints.includes('win64')) {
    return 'windows';
  }
  if (hints.includes('esxi') || hints.includes('vmkernel')) {
    return 'esxi';
  }
  if (hints.includes('ubuntu') || hints.includes('debian') || hints.includes('centos') ||
      hints.includes('rhel') || hints.includes('fedora') || hints.includes('linux') ||
      hints.includes('amazon linux') || hints.includes('suse')) {
    return 'linux';
  }
  if (hints.includes('freebsd') || hints.includes('openbsd') || hints.includes('solaris') ||
      hints.includes('aix') || hints.includes('unix')) {
    return 'unix';
  }

  return 'unknown';
}

export { ESXiProvider } from './esxi';
export { ProxmoxProvider } from './proxmox';
export { AWSProvider } from './aws';
export { GCPProvider } from './gcp';
export { AzureProvider } from './azure';
export { BigFixProvider } from './bigfix';
