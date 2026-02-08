/**
 * Write Tools for MCP Whiteboard Server
 * These tools allow AI agents to create and modify whiteboard elements
 */

import { z } from 'zod';
import type { YjsBridge } from '../lib/yjs-bridge.js';
import type { ExcalidrawElement, ToolResult } from '../types.js';
import { createElementFromRequest, createStickyNote } from '../lib/element-factory.js';

/**
 * Tool definitions for MCP
 */
export const WRITE_TOOL_DEFINITIONS = [
  {
    name: 'create_shapes',
    description:
      'Create one or more shapes on the whiteboard. Supports: rectangle, ellipse, diamond, text, line, arrow.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        shapes: {
          type: 'array',
          description: 'Array of shapes to create',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['rectangle', 'ellipse', 'diamond', 'text', 'line', 'arrow'],
                description: 'Type of shape to create',
              },
              x: {
                type: 'number',
                description: 'X coordinate (left edge)',
              },
              y: {
                type: 'number',
                description: 'Y coordinate (top edge)',
              },
              width: {
                type: 'number',
                description: 'Width (optional, default 100)',
              },
              height: {
                type: 'number',
                description: 'Height (optional, default 100)',
              },
              text: {
                type: 'string',
                description: 'Text content (for text elements)',
              },
              strokeColor: {
                type: 'string',
                description: 'Stroke/border color (hex, e.g. #1e1e1e)',
              },
              backgroundColor: {
                type: 'string',
                description: 'Fill color (hex or "transparent")',
              },
              fillStyle: {
                type: 'string',
                enum: ['hachure', 'solid', 'cross-hatch'],
                description: 'Fill pattern style',
              },
              points: {
                type: 'array',
                description: 'Points for line/arrow [[x1,y1], [x2,y2], ...]',
                items: {
                  type: 'array',
                  items: { type: 'number' },
                },
              },
            },
            required: ['type', 'x', 'y'],
          },
        },
      },
      required: ['shapes'],
    },
  },
  {
    name: 'update_shapes',
    description: 'Update properties of existing shapes by their IDs',
    inputSchema: {
      type: 'object' as const,
      properties: {
        updates: {
          type: 'array',
          description: 'Array of updates to apply',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'ID of the element to update',
              },
              x: { type: 'number', description: 'New X position' },
              y: { type: 'number', description: 'New Y position' },
              width: { type: 'number', description: 'New width' },
              height: { type: 'number', description: 'New height' },
              strokeColor: { type: 'string', description: 'New stroke color' },
              backgroundColor: { type: 'string', description: 'New background color' },
              text: { type: 'string', description: 'New text content (for text elements)' },
              locked: { type: 'boolean', description: 'Lock/unlock element' },
            },
            required: ['id'],
          },
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'delete_shapes',
    description: 'Delete shapes by their IDs (soft delete)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        shape_ids: {
          type: 'array',
          description: 'Array of element IDs to delete',
          items: { type: 'string' },
        },
      },
      required: ['shape_ids'],
    },
  },
  {
    name: 'add_annotation',
    description:
      'Add a sticky note annotation to the whiteboard. The note will be placed near an existing element if specified.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'Text content of the annotation',
        },
        near_element_id: {
          type: 'string',
          description: 'Optional: ID of element to place annotation near',
        },
        x: {
          type: 'number',
          description: 'X position (used if near_element_id not specified)',
        },
        y: {
          type: 'number',
          description: 'Y position (used if near_element_id not specified)',
        },
        color: {
          type: 'string',
          description: 'Background color of the note (default: #ffc9c9)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'move_shapes',
    description: 'Move shapes by a delta (relative movement)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        shape_ids: {
          type: 'array',
          description: 'IDs of elements to move',
          items: { type: 'string' },
        },
        delta_x: {
          type: 'number',
          description: 'Horizontal movement (positive = right)',
        },
        delta_y: {
          type: 'number',
          description: 'Vertical movement (positive = down)',
        },
      },
      required: ['shape_ids', 'delta_x', 'delta_y'],
    },
  },
  {
    name: 'group_shapes',
    description: 'Group multiple shapes together',
    inputSchema: {
      type: 'object' as const,
      properties: {
        shape_ids: {
          type: 'array',
          description: 'IDs of elements to group',
          items: { type: 'string' },
        },
      },
      required: ['shape_ids'],
    },
  },
];

/**
 * Input schemas for validation
 */
const CreateShapesSchema = z.object({
  shapes: z.array(
    z.object({
      type: z.enum(['rectangle', 'ellipse', 'diamond', 'text', 'line', 'arrow']),
      x: z.number(),
      y: z.number(),
      width: z.number().optional(),
      height: z.number().optional(),
      text: z.string().optional(),
      strokeColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      fillStyle: z.enum(['hachure', 'solid', 'cross-hatch']).optional(),
      strokeWidth: z.number().optional(),
      roughness: z.number().optional(),
      opacity: z.number().optional(),
      points: z.array(z.tuple([z.number(), z.number()])).optional(),
      startArrowhead: z.enum(['arrow', 'bar', 'dot', 'triangle']).nullable().optional(),
      endArrowhead: z.enum(['arrow', 'bar', 'dot', 'triangle']).nullable().optional(),
    })
  ),
});

const UpdateShapesSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      strokeColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      fillStyle: z.string().optional(),
      strokeWidth: z.number().optional(),
      roughness: z.number().optional(),
      opacity: z.number().optional(),
      text: z.string().optional(),
      locked: z.boolean().optional(),
    })
  ),
});

const DeleteShapesSchema = z.object({
  shape_ids: z.array(z.string()),
});

const AddAnnotationSchema = z.object({
  text: z.string(),
  near_element_id: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  color: z.string().optional(),
});

const MoveShapesSchema = z.object({
  shape_ids: z.array(z.string()),
  delta_x: z.number(),
  delta_y: z.number(),
});

const GroupShapesSchema = z.object({
  shape_ids: z.array(z.string()),
});

/**
 * Handle write tool calls
 */
export async function handleWriteTool(
  bridge: YjsBridge,
  toolName: string,
  args: unknown
): Promise<ToolResult> {
  try {
    // Update agent status
    bridge.updatePresence({ status: 'drawing', currentAction: toolName });

    const result = await executeWriteTool(bridge, toolName, args);

    // Reset agent status
    bridge.updatePresence({ status: 'idle', currentAction: undefined });

    return result;
  } catch (error) {
    bridge.updatePresence({ status: 'idle', currentAction: undefined });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function executeWriteTool(
  bridge: YjsBridge,
  toolName: string,
  args: unknown
): Promise<ToolResult> {
  switch (toolName) {
    case 'create_shapes': {
      const input = CreateShapesSchema.parse(args);
      const createdElements: ExcalidrawElement[] = [];

      for (const shape of input.shapes) {
        const element = createElementFromRequest(shape);
        if (Array.isArray(element)) {
          createdElements.push(...element);
        } else {
          createdElements.push(element);
        }
      }

      const addedIds = bridge.addElements(createdElements);

      return {
        success: true,
        data: {
          created_count: addedIds.length,
          created_ids: addedIds,
        },
      };
    }

    case 'update_shapes': {
      const input = UpdateShapesSchema.parse(args);
      const updates = input.updates.map((u) => ({
        id: u.id,
        changes: { ...u, id: undefined } as Partial<ExcalidrawElement>,
      }));

      const updatedIds = bridge.updateElements(updates);

      return {
        success: true,
        data: {
          updated_count: updatedIds.length,
          updated_ids: updatedIds,
        },
      };
    }

    case 'delete_shapes': {
      const input = DeleteShapesSchema.parse(args);
      const deletedCount = bridge.deleteElements(input.shape_ids);

      return {
        success: true,
        data: {
          deleted_count: deletedCount,
        },
      };
    }

    case 'add_annotation': {
      const input = AddAnnotationSchema.parse(args);
      let x = input.x ?? 0;
      let y = input.y ?? 0;

      // If near_element_id is specified, position relative to that element
      if (input.near_element_id) {
        const targetElement = bridge.getElementById(input.near_element_id);
        if (targetElement) {
          x = targetElement.x + targetElement.width + 20; // Place to the right
          y = targetElement.y;
        }
      }

      const noteElements = createStickyNote(x, y, input.text, {
        backgroundColor: input.color,
      });

      const addedIds = bridge.addElements(noteElements);

      return {
        success: true,
        data: {
          annotation_ids: addedIds,
        },
      };
    }

    case 'move_shapes': {
      const input = MoveShapesSchema.parse(args);
      const updates = input.shape_ids.map((id) => {
        const element = bridge.getElementById(id);
        if (!element) return null;
        return {
          id,
          changes: {
            x: element.x + input.delta_x,
            y: element.y + input.delta_y,
          } as Partial<ExcalidrawElement>,
        };
      }).filter((u): u is NonNullable<typeof u> => u !== null);

      const movedIds = bridge.updateElements(updates);

      return {
        success: true,
        data: {
          moved_count: movedIds.length,
          moved_ids: movedIds,
        },
      };
    }

    case 'group_shapes': {
      const input = GroupShapesSchema.parse(args);
      const groupId = `group-${Date.now()}`;

      const updates = input.shape_ids.map((id) => {
        const element = bridge.getElementById(id);
        if (!element) return null;
        return {
          id,
          changes: {
            groupIds: [...element.groupIds, groupId],
          } as Partial<ExcalidrawElement>,
        };
      }).filter((u): u is NonNullable<typeof u> => u !== null);

      const groupedIds = bridge.updateElements(updates);

      return {
        success: true,
        data: {
          group_id: groupId,
          grouped_count: groupedIds.length,
          grouped_ids: groupedIds,
        },
      };
    }

    default:
      return {
        success: false,
        error: `Unknown write tool: ${toolName}`,
      };
  }
}
