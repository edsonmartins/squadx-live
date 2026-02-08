#!/usr/bin/env node

/**
 * MCP Whiteboard Server
 * Allows AI agents to interact with SquadX Whiteboard in real-time
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { createYjsBridge, YjsBridge } from './lib/yjs-bridge.js';
import { READ_TOOL_DEFINITIONS, handleReadTool } from './tools/read-tools.js';
import { WRITE_TOOL_DEFINITIONS, handleWriteTool } from './tools/write-tools.js';
import { DIAGRAM_TOOL_DEFINITIONS, handleDiagramTool } from './tools/diagram-tools.js';
import { PERMISSION_TOOLS, createPermissionToolHandlers } from './tools/permission-tools.js';

// Configuration from environment
const CONFIG = {
  websocketUrl: process.env.YJS_WEBSOCKET_URL || 'wss://demos.yjs.dev',
  roomId: process.env.WHITEBOARD_ROOM_ID || 'default-room',
  agentId: process.env.AGENT_ID || 'mcp-agent',
  agentName: process.env.AGENT_NAME || 'AI Assistant',
  agentColor: process.env.AGENT_COLOR || '#8b5cf6',
};

// Convert permission tool definitions to MCP format
const PERMISSION_TOOL_DEFINITIONS = Object.values(PERMISSION_TOOLS).map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: {
    type: 'object' as const,
    properties: Object.fromEntries(
      Object.entries(tool.inputSchema.shape || {}).map(([key, schema]) => [
        key,
        { type: 'string', description: (schema as { description?: string }).description },
      ])
    ),
  },
}));

// All tool definitions
const ALL_TOOLS = [
  ...READ_TOOL_DEFINITIONS,
  ...WRITE_TOOL_DEFINITIONS,
  ...DIAGRAM_TOOL_DEFINITIONS,
  ...PERMISSION_TOOL_DEFINITIONS,
];

// Tool names for routing
const READ_TOOLS = new Set(READ_TOOL_DEFINITIONS.map((t) => t.name));
const WRITE_TOOLS = new Set(WRITE_TOOL_DEFINITIONS.map((t) => t.name));
const DIAGRAM_TOOLS = new Set(DIAGRAM_TOOL_DEFINITIONS.map((t) => t.name));
const PERMISSION_TOOL_NAMES: Set<string> = new Set(PERMISSION_TOOL_DEFINITIONS.map((t) => t.name));

/**
 * Main server class
 */
class WhiteboardMCPServer {
  private server: Server;
  private bridge: YjsBridge | null = null;
  private permissionHandlers: ReturnType<typeof createPermissionToolHandlers>;

  constructor() {
    this.server = new Server(
      {
        name: 'squadx-whiteboard',
        version: '0.5.3',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Create permission handlers with access to bridge
    this.permissionHandlers = createPermissionToolHandlers(() => this.bridge);

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: ALL_TOOLS,
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Permission tools can work even when not connected (to check status)
      if (PERMISSION_TOOL_NAMES.has(name)) {
        type PermissionToolName = keyof typeof this.permissionHandlers;
        const toolName = name as PermissionToolName;
        const handler = this.permissionHandlers[toolName];
        if (handler) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (handler as (args: any) => Promise<unknown>)(args || {});
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }
      }

      // Ensure bridge is connected for other tools
      if (!this.bridge?.connected) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Not connected to whiteboard. Use connect_board resource first.',
              }),
            },
          ],
        };
      }

      let result;

      try {
        if (READ_TOOLS.has(name)) {
          result = await handleReadTool(this.bridge, name, args);
        } else if (WRITE_TOOLS.has(name)) {
          result = await handleWriteTool(this.bridge, name, args);
        } else if (DIAGRAM_TOOLS.has(name)) {
          result = await handleDiagramTool(this.bridge, name, args);
        } else {
          result = {
            success: false,
            error: `Unknown tool: ${name}`,
          };
        }
      } catch (error) {
        // Handle permission errors gracefully
        if (error instanceof Error && error.message.includes('Permission denied')) {
          result = {
            success: false,
            error: error.message,
            suggestion: 'Use request_permission or wait_for_permission tool first to get drawing access.',
            current_permission: this.bridge.getPermission(),
          };
        } else {
          throw error;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'board://status',
            name: 'Connection Status',
            description: 'Current connection status to the whiteboard',
            mimeType: 'application/json',
          },
          {
            uri: 'board://context',
            name: 'Board Context',
            description: 'High-level summary of the current board state',
            mimeType: 'application/json',
          },
          {
            uri: `board://connect/${CONFIG.roomId}`,
            name: 'Connect to Board',
            description: 'Connect to the whiteboard room',
            mimeType: 'application/json',
          },
        ],
      };
    });

    // Read resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'board://status') {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                connected: this.bridge?.connected ?? false,
                roomId: CONFIG.roomId,
                agentId: CONFIG.agentId,
                agentName: CONFIG.agentName,
                permission: this.bridge?.getPermission() ?? 'none',
                can_draw: this.bridge?.hasPermission() ?? false,
              }),
            },
          ],
        };
      }

      if (uri === 'board://context') {
        if (!this.bridge?.connected) {
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({ error: 'Not connected' }),
              },
            ],
          };
        }

        const context = this.bridge.getBoardContext();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(context, null, 2),
            },
          ],
        };
      }

      if (uri.startsWith('board://connect/')) {
        const roomId = uri.replace('board://connect/', '');
        await this.connectToBoard(roomId);

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                success: true,
                connected: true,
                roomId,
              }),
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  private async connectToBoard(roomId: string): Promise<void> {
    // Disconnect existing connection
    if (this.bridge) {
      this.bridge.disconnect();
    }

    // Create new bridge
    this.bridge = createYjsBridge({
      websocketUrl: CONFIG.websocketUrl,
      roomId,
      agentId: CONFIG.agentId,
      agentName: CONFIG.agentName,
      agentColor: CONFIG.agentColor,
    });

    await this.bridge.connect();
    console.error(`Connected to whiteboard room: ${roomId}`);
  }

  async start(): Promise<void> {
    // Auto-connect if room ID is provided
    if (CONFIG.roomId && CONFIG.roomId !== 'default-room') {
      try {
        await this.connectToBoard(CONFIG.roomId);
      } catch (error) {
        console.error('Failed to auto-connect:', error);
      }
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('SquadX Whiteboard MCP Server running');
  }

  async stop(): Promise<void> {
    if (this.bridge) {
      this.bridge.disconnect();
    }
    await this.server.close();
  }
}

// Main entry point
const server = new WhiteboardMCPServer();

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});

server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
