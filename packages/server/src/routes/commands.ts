/**
 * Commands routes for bulk command execution
 */

import { Router } from 'express';
import type { DatabaseService } from '../services/database';
import type { BulkCommandService } from '../services/bulk-commands';

export function createCommandRoutes(db: DatabaseService, commandService: BulkCommandService): Router {
  const router = Router();

  // List saved commands
  router.get('/saved', async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const commands = await db.getSavedCommands(req.userId!, category);
      res.json({
        success: true,
        data: commands,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get single saved command
  router.get('/saved/:id', async (req, res) => {
    try {
      const command = await db.getSavedCommand(req.userId!, req.params.id);

      if (!command) {
        res.status(404).json({
          success: false,
          error: 'Command not found',
        });
        return;
      }

      res.json({
        success: true,
        data: command,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Create saved command
  router.post('/saved', async (req, res) => {
    try {
      const { name, description, command, targetOs, category, tags } = req.body;

      if (!name || !command) {
        res.status(400).json({
          success: false,
          error: 'Name and command are required',
        });
        return;
      }

      const savedCommand = await db.createSavedCommand(req.userId!, {
        name,
        description,
        command,
        targetOs: targetOs || 'all',
        category,
        tags: tags || [],
      });

      res.status(201).json({
        success: true,
        data: savedCommand,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Update saved command
  router.put('/saved/:id', async (req, res) => {
    try {
      const command = await db.updateSavedCommand(req.userId!, req.params.id, req.body);

      if (!command) {
        res.status(404).json({
          success: false,
          error: 'Command not found',
        });
        return;
      }

      res.json({
        success: true,
        data: command,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Delete saved command
  router.delete('/saved/:id', async (req, res) => {
    try {
      const deleted = await db.deleteSavedCommand(req.userId!, req.params.id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Command not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Command deleted',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Execute command on multiple connections
  router.post('/execute', async (req, res) => {
    try {
      const { command, commandId, connectionIds, maxParallel = 10 } = req.body;

      if (!connectionIds || !Array.isArray(connectionIds) || connectionIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'connectionIds array is required',
        });
        return;
      }

      let commandText = command;
      let commandName = 'Ad-hoc command';

      // If using a saved command, get its details
      if (commandId) {
        const savedCommand = await db.getSavedCommand(req.userId!, commandId);
        if (!savedCommand) {
          res.status(404).json({
            success: false,
            error: 'Saved command not found',
          });
          return;
        }
        commandText = savedCommand.command;
        commandName = savedCommand.name;
      }

      if (!commandText) {
        res.status(400).json({
          success: false,
          error: 'Either command or commandId is required',
        });
        return;
      }

      // Create execution record
      const execution = await db.createCommandExecution(req.userId!, {
        commandId,
        commandName,
        command: commandText,
        connectionIds,
      });

      // Get connection details
      const connections = await Promise.all(
        connectionIds.map(id => db.getConnection(req.userId!, id))
      );

      const validConnections = connections.filter(c => c !== null);

      if (validConnections.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No valid connections found',
        });
        return;
      }

      // Create result records
      for (const conn of validConnections) {
        await db.createCommandResult(execution.id, {
          connectionId: conn!.id,
          connectionName: conn!.name,
          hostname: conn!.hostname,
        });
      }

      // Start execution in background
      commandService.execute(execution.id, req.userId!, commandText, validConnections as NonNullable<typeof validConnections[0]>[], maxParallel)
        .catch(err => console.error('Bulk command execution error:', err));

      // Return execution ID immediately
      res.status(202).json({
        success: true,
        data: {
          executionId: execution.id,
          connectionCount: validConnections.length,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // List command executions
  router.get('/executions', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const executions = await db.getCommandExecutions(req.userId!, limit);
      res.json({
        success: true,
        data: executions,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Get execution details with results
  router.get('/executions/:id', async (req, res) => {
    try {
      const execution = await db.getCommandExecution(req.userId!, req.params.id);

      if (!execution) {
        res.status(404).json({
          success: false,
          error: 'Execution not found',
        });
        return;
      }

      const results = await db.getCommandResults(execution.id);

      res.json({
        success: true,
        data: {
          ...execution,
          results,
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
