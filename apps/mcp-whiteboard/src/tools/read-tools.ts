/**
 * Read Tools for MCP Whiteboard Server
 * These tools allow AI agents to read and understand the whiteboard state
 */

import { z } from 'zod';
import type { YjsBridge } from '../lib/yjs-bridge.js';
import type { ExcalidrawElement, ToolResult } from '../types.js';

/**
 * Tool definitions for MCP
 */
export const READ_TOOL_DEFINITIONS = [
  {
    name: 'get_board_elements',
    description:
      'Get all elements from the whiteboard. Can optionally filter by element type (rectangle, ellipse, text, arrow, line, diamond, freedraw).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filter_type: {
          type: 'string',
          description: 'Optional filter by element type',
          enum: ['rectangle', 'ellipse', 'text', 'arrow', 'line', 'diamond', 'freedraw'],
        },
        include_deleted: {
          type: 'boolean',
          description: 'Include soft-deleted elements (default: false)',
        },
      },
    },
  },
  {
    name: 'get_element_by_id',
    description: 'Get a specific element by its ID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        element_id: {
          type: 'string',
          description: 'The ID of the element to retrieve',
        },
      },
      required: ['element_id'],
    },
  },
  {
    name: 'get_board_context',
    description:
      'Get a high-level summary of the whiteboard contents, including element counts, bounding box, text content, and connections between elements. Useful for understanding the overall structure.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_text_content',
    description: 'Get all text content from text elements on the whiteboard',
    inputSchema: {
      type: 'object' as const,
      properties: {
        include_positions: {
          type: 'boolean',
          description: 'Include x,y positions with each text (default: false)',
        },
      },
    },
  },
  {
    name: 'find_elements_in_area',
    description: 'Find all elements within a rectangular area',
    inputSchema: {
      type: 'object' as const,
      properties: {
        x: {
          type: 'number',
          description: 'Left edge X coordinate',
        },
        y: {
          type: 'number',
          description: 'Top edge Y coordinate',
        },
        width: {
          type: 'number',
          description: 'Width of the search area',
        },
        height: {
          type: 'number',
          description: 'Height of the search area',
        },
      },
      required: ['x', 'y', 'width', 'height'],
    },
  },
];

/**
 * Input schemas for validation
 */
const GetBoardElementsSchema = z.object({
  filter_type: z
    .enum(['rectangle', 'ellipse', 'text', 'arrow', 'line', 'diamond', 'freedraw'])
    .optional(),
  include_deleted: z.boolean().optional().default(false),
});

const GetElementByIdSchema = z.object({
  element_id: z.string(),
});

const GetTextContentSchema = z.object({
  include_positions: z.boolean().optional().default(false),
});

const FindElementsInAreaSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/**
 * Handle read tool calls
 */
export async function handleReadTool(
  bridge: YjsBridge,
  toolName: string,
  args: unknown
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'get_board_elements': {
        const input = GetBoardElementsSchema.parse(args);
        let elements = bridge.getElements();

        if (input.filter_type) {
          elements = elements.filter((el) => el.type === input.filter_type);
        }

        return {
          success: true,
          data: {
            count: elements.length,
            elements: elements.map(simplifyElement),
          },
        };
      }

      case 'get_element_by_id': {
        const input = GetElementByIdSchema.parse(args);
        const element = bridge.getElementById(input.element_id);

        if (!element) {
          return {
            success: false,
            error: `Element with ID ${input.element_id} not found`,
          };
        }

        return {
          success: true,
          data: simplifyElement(element),
        };
      }

      case 'get_board_context': {
        const context = bridge.getBoardContext();
        return {
          success: true,
          data: context,
        };
      }

      case 'get_text_content': {
        const input = GetTextContentSchema.parse(args);
        const textElements = bridge.getElementsByType('text');

        const textData = textElements.map((el) => {
          const text = (el as { text?: string }).text || '';
          if (input.include_positions) {
            return {
              id: el.id,
              text,
              x: el.x,
              y: el.y,
            };
          }
          return { id: el.id, text };
        });

        return {
          success: true,
          data: {
            count: textData.length,
            texts: textData,
          },
        };
      }

      case 'find_elements_in_area': {
        const input = FindElementsInAreaSchema.parse(args);
        const elements = bridge.getElements();

        const inArea = elements.filter((el) => {
          const elRight = el.x + el.width;
          const elBottom = el.y + el.height;
          const areaRight = input.x + input.width;
          const areaBottom = input.y + input.height;

          // Check if element overlaps with area
          return (
            el.x < areaRight &&
            elRight > input.x &&
            el.y < areaBottom &&
            elBottom > input.y
          );
        });

        return {
          success: true,
          data: {
            count: inArea.length,
            elements: inArea.map(simplifyElement),
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown read tool: ${toolName}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Simplify element for output (remove internal properties)
 */
function simplifyElement(el: ExcalidrawElement): Partial<ExcalidrawElement> {
  const simplified: Partial<ExcalidrawElement> = {
    id: el.id,
    type: el.type,
    x: Math.round(el.x),
    y: Math.round(el.y),
    width: Math.round(el.width),
    height: Math.round(el.height),
  };

  // Add type-specific properties
  if (el.type === 'text') {
    (simplified as { text?: string }).text = (el as { text?: string }).text;
  }

  if (el.type === 'arrow' || el.type === 'line') {
    (simplified as { points?: unknown }).points = (el as { points?: unknown }).points;
  }

  if (el.strokeColor !== '#1e1e1e') {
    simplified.strokeColor = el.strokeColor;
  }

  if (el.backgroundColor !== 'transparent') {
    simplified.backgroundColor = el.backgroundColor;
  }

  if (el.groupIds.length > 0) {
    simplified.groupIds = el.groupIds;
  }

  if (el.locked) {
    simplified.locked = true;
  }

  return simplified;
}
