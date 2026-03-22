/**
 * Provider routes for cloud discovery
 */

import { Router } from 'express';
import type { DatabaseService } from '../services/database';
import type { ProviderDiscoveryService } from '../services/provider-discovery';

export function createProviderRoutes(db: DatabaseService, providerService: ProviderDiscoveryService): Router {
  const router = Router();

  // Resolve saved credentials into provider config (injects username/password)
  async function resolveProviderCredentials(userId: string, provider: { config: Record<string, unknown> }): Promise<void> {
    const credentialId = provider.config.credentialId as string | undefined;
    if (!credentialId) return;

    const credential = await db.getCredential(userId, credentialId);
    if (!credential) return;

    // Inject username/password from the saved credential
    provider.config.username = credential.domain
      ? `${credential.domain}\\${credential.username}`
      : credential.username;
    provider.config.password = credential.secret || credential.password;
  }

  // List providers (optionally including shared)
  router.get('/', async (req, res) => {
    try {
      const includeShared = req.query.includeShared === 'true';
      const providers = includeShared
        ? await db.getAllProvidersWithShared(req.userId!)
        : await db.getProviders(req.userId!);
      // Don't return sensitive config data in list
      const safeProviders = providers.map(p => ({
        ...p,
        config: { ...p.config, password: undefined, apiKey: undefined, secret: undefined },
      }));
      res.json({
        success: true,
        data: safeProviders,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get single provider
  router.get('/:id', async (req, res) => {
    try {
      const provider = await db.getProvider(req.userId!, req.params.id);

      if (!provider) {
        res.status(404).json({
          success: false,
          error: 'Provider not found',
        });
        return;
      }

      // Mask sensitive data
      const safeProvider = {
        ...provider,
        config: { ...provider.config, password: undefined, apiKey: undefined, secret: undefined },
      };

      res.json({
        success: true,
        data: safeProvider,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Create provider
  router.post('/', async (req, res) => {
    try {
      const { name, type, config, autoDiscover, discoverInterval } = req.body;

      if (!name || !type || !config) {
        res.status(400).json({
          success: false,
          error: 'Name, type, and config are required',
        });
        return;
      }

      // Validate provider type
      const validTypes = ['vmware', 'proxmox', 'aws', 'azure', 'gcp', 'bigfix'];
      if (!validTypes.includes(type)) {
        res.status(400).json({
          success: false,
          error: `Invalid provider type. Must be one of: ${validTypes.join(', ')}`,
        });
        return;
      }

      const provider = await db.createProvider(req.userId!, {
        name,
        type,
        config,
        autoDiscover: autoDiscover ?? false,
        discoverInterval: discoverInterval ?? 3600,
      });

      res.status(201).json({
        success: true,
        data: {
          ...provider,
          config: { ...provider.config, password: undefined, apiKey: undefined, secret: undefined },
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Update provider
  router.put('/:id', async (req, res) => {
    try {
      const provider = await db.updateProvider(req.userId!, req.params.id, req.body);

      if (!provider) {
        res.status(404).json({
          success: false,
          error: 'Provider not found',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          ...provider,
          config: { ...provider.config, password: undefined, apiKey: undefined, secret: undefined },
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Delete provider
  router.delete('/:id', async (req, res) => {
    try {
      const deleted = await db.deleteProvider(req.userId!, req.params.id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Provider not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Provider deleted',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Test provider connection
  router.post('/:id/test', async (req, res) => {
    try {
      const provider = await db.getProvider(req.userId!, req.params.id);

      if (!provider) {
        res.status(404).json({
          success: false,
          error: 'Provider not found',
        });
        return;
      }

      // Resolve saved credential into config if needed
      await resolveProviderCredentials(req.userId!, provider);

      const result = await providerService.testConnection(provider);

      res.json({
        success: result.success,
        message: result.message,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Discover hosts from provider
  router.post('/:id/discover', async (req, res) => {
    try {
      const provider = await db.getProvider(req.userId!, req.params.id);

      if (!provider) {
        res.status(404).json({
          success: false,
          error: 'Provider not found',
        });
        return;
      }

      // Resolve saved credential into config if needed
      await resolveProviderCredentials(req.userId!, provider);

      const hosts = await providerService.discover(provider);

      // Save discovered hosts to database
      await db.bulkUpsertDiscoveredHosts(req.userId!, provider.id, hosts);

      // Update provider last discovery time
      await db.updateProvider(req.userId!, provider.id, {
        lastDiscoveryAt: new Date(),
      });

      // Return discovered hosts
      const savedHosts = await db.getDiscoveredHosts(req.userId!, provider.id);

      res.json({
        success: true,
        data: savedHosts,
        count: savedHosts.length,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Sync provider (incremental discovery - compares with previous results)
  router.post('/:id/sync', async (req, res) => {
    try {
      const provider = await db.getProvider(req.userId!, req.params.id);

      if (!provider) {
        res.status(404).json({
          success: false,
          error: 'Provider not found',
        });
        return;
      }

      // Resolve saved credential into config if needed
      await resolveProviderCredentials(req.userId!, provider);

      // Get previously discovered hosts before re-discovering
      const previousHosts = await db.getDiscoveredHosts(req.userId!, provider.id);
      const previousMap = new Map(previousHosts.map(h => [h.providerHostId, h]));

      // Run fresh discovery
      const freshHosts = await providerService.discover(provider);

      // Save discovered hosts to database
      await db.bulkUpsertDiscoveredHosts(req.userId!, provider.id, freshHosts);

      // Update provider last discovery time
      await db.updateProvider(req.userId!, provider.id, {
        lastDiscoveryAt: new Date(),
      });

      // Compare results
      const freshMap = new Map(freshHosts.map(h => [h.providerHostId, h]));
      const newHosts: typeof previousHosts = [];
      const removedHosts: typeof previousHosts = [];
      const changedHosts: Array<{ host: typeof previousHosts[0]; previousState: string; currentState: string }> = [];
      const existingHosts: typeof previousHosts = [];

      // Find new and changed hosts
      const savedHosts = await db.getDiscoveredHosts(req.userId!, provider.id);
      const savedMap = new Map(savedHosts.map(h => [h.providerHostId, h]));

      for (const fresh of freshHosts) {
        const prev = previousMap.get(fresh.providerHostId);
        const saved = savedMap.get(fresh.providerHostId);
        if (!prev) {
          if (saved) newHosts.push(saved);
        } else if (prev.state !== fresh.state) {
          if (saved) changedHosts.push({ host: saved, previousState: prev.state || 'unknown', currentState: fresh.state || 'unknown' });
        } else {
          if (saved) existingHosts.push(saved);
        }
      }

      // Find removed hosts (were in previous, not in current)
      for (const prev of previousHosts) {
        if (!freshMap.has(prev.providerHostId)) {
          removedHosts.push(prev);
        }
      }

      const importedCount = savedHosts.filter(h => h.imported).length;

      res.json({
        success: true,
        data: {
          providerId: provider.id,
          providerName: provider.name,
          success: true,
          syncedAt: new Date(),
          newHosts,
          removedHosts,
          existingHosts,
          changedHosts,
          summary: {
            total: freshHosts.length,
            new: newHosts.length,
            removed: removedHosts.length,
            existing: existingHosts.length,
            changed: changedHosts.length,
            imported: importedCount,
          },
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get discovered hosts for provider
  router.get('/:id/hosts', async (req, res) => {
    try {
      const hosts = await db.getDiscoveredHosts(req.userId!, req.params.id);

      res.json({
        success: true,
        data: hosts,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Import discovered hosts as connections
  router.post('/:id/hosts/import', async (req, res) => {
    try {
      const { hostIds, credentialId, group, ipPreference } = req.body;

      if (!hostIds || !Array.isArray(hostIds) || hostIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'hostIds array is required',
        });
        return;
      }

      const imported: string[] = [];
      const errors: string[] = [];

      for (const hostId of hostIds) {
        try {
          const host = await db.getDiscoveredHost(req.userId!, hostId);
          if (!host) {
            errors.push(`Host ${hostId} not found`);
            continue;
          }

          // Determine hostname based on preference
          let hostname = host.hostname;
          if (ipPreference === 'private' && host.privateIp) {
            hostname = host.privateIp;
          } else if (ipPreference === 'public' && host.publicIp) {
            hostname = host.publicIp;
          } else if (!hostname) {
            hostname = host.privateIp || host.publicIp || '';
          }

          if (!hostname) {
            errors.push(`Host ${host.name} has no valid hostname or IP`);
            continue;
          }

          // Create connection
          const connection = await db.createConnection(req.userId!, {
            name: host.name,
            hostname,
            port: 22,
            connectionType: 'ssh',
            credentialId,
            tags: host.tags,
            group,
            description: `Imported from ${host.providerId}`,
          });

          // Mark host as imported
          await db.markDiscoveredHostImported(req.userId!, hostId, connection.id);

          imported.push(connection.id);
        } catch (err) {
          errors.push(`Failed to import host ${hostId}: ${(err as Error).message}`);
        }
      }

      res.json({
        success: true,
        data: {
          imported: imported.length,
          errors: errors.length,
          errorDetails: errors,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  return router;
}
