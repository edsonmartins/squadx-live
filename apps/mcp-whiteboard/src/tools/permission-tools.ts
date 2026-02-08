/**
 * Permission tools for MCP Server
 * Allows agents to request and manage drawing permissions
 */

import { z } from 'zod';
import type { YjsBridge } from '../lib/yjs-bridge.js';

// Tool definitions
export const PERMISSION_TOOLS = {
  request_permission: {
    name: 'request_permission',
    description: `Request permission to draw on the whiteboard.
The agent must call this tool and wait for host approval before using any drawing tools.
This is like "raising your hand" - the host will see the request and can approve or deny it.`,
    inputSchema: z.object({
      reason: z.string().optional().describe('Optional reason for requesting permission (shown to host)'),
    }),
  },

  check_permission: {
    name: 'check_permission',
    description: `Check the current permission status.
Returns whether the agent has permission to draw, is waiting for approval, or has no permission.
Use this to verify permission status before attempting to draw.`,
    inputSchema: z.object({}),
  },

  release_permission: {
    name: 'release_permission',
    description: `Release drawing permission voluntarily.
Use this when done drawing to free up the whiteboard for others.
This is like "lowering your hand" or giving up your turn.`,
    inputSchema: z.object({}),
  },

  wait_for_permission: {
    name: 'wait_for_permission',
    description: `Request permission and wait for it to be granted.
This combines request_permission with waiting for approval.
Use this when you need permission before proceeding with drawing tasks.`,
    inputSchema: z.object({
      timeout_seconds: z.number().optional().default(30).describe('Maximum time to wait for approval (default: 30 seconds)'),
      reason: z.string().optional().describe('Optional reason for requesting permission'),
    }),
  },
} as const;

// Tool handlers
export function createPermissionToolHandlers(getBridge: () => YjsBridge | null) {
  return {
    request_permission: async (args: { reason?: string }) => {
      const bridge = getBridge();
      if (!bridge) {
        return {
          success: false,
          error: 'Not connected to whiteboard',
          permission: 'none',
        };
      }

      const result = bridge.requestPermission();

      // Update presence with reason if provided
      if (args.reason) {
        bridge.updatePresence({
          status: 'requesting_permission',
          permissionReason: args.reason,
        } as Record<string, unknown>);
      }

      return {
        success: result.success,
        message: result.message,
        permission: bridge.getPermission(),
        next_steps: result.success
          ? 'Wait for host to approve your request. Use check_permission to verify status.'
          : 'Try connecting to the whiteboard first.',
      };
    },

    check_permission: async () => {
      const bridge = getBridge();
      if (!bridge) {
        return {
          connected: false,
          permission: 'none',
          can_draw: false,
          message: 'Not connected to whiteboard',
        };
      }

      const permission = bridge.getPermission();
      const canDraw = bridge.hasPermission();

      const statusMessages = {
        none: 'No permission. Use request_permission to ask for drawing access.',
        requested: 'Permission requested. Waiting for host approval.',
        granted: 'Permission granted. You can now use drawing tools.',
      };

      return {
        connected: bridge.connected,
        permission,
        can_draw: canDraw,
        message: statusMessages[permission],
      };
    },

    release_permission: async () => {
      const bridge = getBridge();
      if (!bridge) {
        return {
          success: false,
          error: 'Not connected to whiteboard',
        };
      }

      const result = bridge.releasePermission();

      return {
        success: result.success,
        message: result.message,
        permission: bridge.getPermission(),
      };
    },

    wait_for_permission: async (args: { timeout_seconds?: number; reason?: string }) => {
      const bridge = getBridge();
      if (!bridge) {
        return {
          success: false,
          error: 'Not connected to whiteboard',
          permission: 'none',
        };
      }

      // Update presence with reason if provided
      if (args.reason) {
        bridge.updatePresence({
          status: 'requesting_permission',
          permissionReason: args.reason,
        } as Record<string, unknown>);
      }

      const timeoutMs = (args.timeout_seconds || 30) * 1000;
      const granted = await bridge.waitForPermission(timeoutMs);

      if (granted) {
        bridge.updatePresence({ status: 'drawing' });
        return {
          success: true,
          permission: 'granted',
          can_draw: true,
          message: 'Permission granted by host. You can now draw.',
        };
      } else {
        return {
          success: false,
          permission: bridge.getPermission(),
          can_draw: false,
          message: `Permission not granted within ${args.timeout_seconds || 30} seconds. The host may be unavailable or denied the request.`,
          suggestion: 'Try again later or use check_permission to see current status.',
        };
      }
    },
  };
}

export type PermissionToolHandlers = ReturnType<typeof createPermissionToolHandlers>;
