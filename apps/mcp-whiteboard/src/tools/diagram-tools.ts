/**
 * Diagram Tools for MCP Whiteboard Server
 * Tools for creating diagrams from Mermaid and generating architecture proposals
 */

import { z } from 'zod';
import type { YjsBridge } from '../lib/yjs-bridge.js';
import type { ToolResult } from '../types.js';
import {
  mermaidToExcalidraw,
  DIAGRAM_TEMPLATES,
  type DiagramTemplate,
} from '../lib/mermaid-parser.js';
import { getTemplateById, cloneTemplateElements } from '../lib/templates.js';

/**
 * Tool definitions for diagrams
 */
export const DIAGRAM_TOOL_DEFINITIONS = [
  {
    name: 'create_diagram_mermaid',
    description: `Create a diagram on the whiteboard from Mermaid syntax. Supports flowcharts and graphs.
Example Mermaid code:
\`\`\`
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do Something]
    B -->|No| D[Do Other]
    C --> E[End]
    D --> E
\`\`\``,
    inputSchema: {
      type: 'object' as const,
      properties: {
        mermaid_code: {
          type: 'string',
          description: 'Mermaid diagram code',
        },
        x: {
          type: 'number',
          description: 'X position for the diagram (default: 100)',
        },
        y: {
          type: 'number',
          description: 'Y position for the diagram (default: 100)',
        },
        stroke_color: {
          type: 'string',
          description: 'Stroke color for shapes (default: #1e1e1e)',
        },
        background_color: {
          type: 'string',
          description: 'Background color for shapes (default: #a5d8ff)',
        },
      },
      required: ['mermaid_code'],
    },
  },
  {
    name: 'propose_architecture',
    description: `Generate a software architecture diagram based on a description or template.
Available templates: c4-context, c4-container, microservices, event-driven, three-tier.
You can also provide a custom description to generate a diagram.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        template: {
          type: 'string',
          enum: ['c4-context', 'c4-container', 'microservices', 'event-driven', 'three-tier', 'custom'],
          description: 'Architecture pattern template to use',
        },
        description: {
          type: 'string',
          description: 'Description of the architecture (used with custom template or to customize a template)',
        },
        components: {
          type: 'array',
          description: 'List of components/services to include',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Component name' },
              type: {
                type: 'string',
                enum: ['service', 'database', 'queue', 'gateway', 'client', 'external'],
                description: 'Component type',
              },
            },
            required: ['name', 'type'],
          },
        },
        connections: {
          type: 'array',
          description: 'Connections between components',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Source component name' },
              to: { type: 'string', description: 'Target component name' },
              label: { type: 'string', description: 'Connection label' },
            },
            required: ['from', 'to'],
          },
        },
        x: {
          type: 'number',
          description: 'X position for the diagram (default: 100)',
        },
        y: {
          type: 'number',
          description: 'Y position for the diagram (default: 100)',
        },
      },
      required: ['template'],
    },
  },
  {
    name: 'create_flowchart',
    description: 'Create a simple flowchart from a list of steps',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Flowchart title',
        },
        steps: {
          type: 'array',
          description: 'List of steps in order',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Step text' },
              type: {
                type: 'string',
                enum: ['process', 'decision', 'start', 'end'],
                description: 'Step type (affects shape)',
              },
              branches: {
                type: 'array',
                description: 'For decisions: branch labels',
                items: { type: 'string' },
              },
            },
            required: ['text', 'type'],
          },
        },
        direction: {
          type: 'string',
          enum: ['TB', 'LR'],
          description: 'Flow direction: TB (top-bottom) or LR (left-right)',
        },
        x: {
          type: 'number',
          description: 'X position for the flowchart',
        },
        y: {
          type: 'number',
          description: 'Y position for the flowchart',
        },
      },
      required: ['steps'],
    },
  },
  {
    name: 'apply_template',
    description: `Apply a predefined template to the whiteboard. Available templates:
- c4-context: C4 Context Diagram showing users and external systems
- erd: Entity Relationship Diagram for data modeling
- sprint-board: Kanban board with To Do, In Progress, Done columns
- flowchart: Basic flowchart with start, process, decision, and end shapes
- user-story-map: User story map for product planning with activities, tasks, and releases
- sequence-diagram: Sequence diagram showing interactions between Client, Server, and Database`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        template_id: {
          type: 'string',
          enum: ['c4-context', 'erd', 'sprint-board', 'flowchart', 'user-story-map', 'sequence-diagram'],
          description: 'ID of the template to apply',
        },
        x: {
          type: 'number',
          description: 'X offset for the template (default: 0)',
        },
        y: {
          type: 'number',
          description: 'Y offset for the template (default: 0)',
        },
      },
      required: ['template_id'],
    },
  },
];

/**
 * Input schemas
 */
const CreateDiagramMermaidSchema = z.object({
  mermaid_code: z.string(),
  x: z.number().optional().default(100),
  y: z.number().optional().default(100),
  stroke_color: z.string().optional(),
  background_color: z.string().optional(),
});

const ProposeArchitectureSchema = z.object({
  template: z.enum(['c4-context', 'c4-container', 'microservices', 'event-driven', 'three-tier', 'custom']),
  description: z.string().optional(),
  components: z.array(z.object({
    name: z.string(),
    type: z.enum(['service', 'database', 'queue', 'gateway', 'client', 'external']),
  })).optional(),
  connections: z.array(z.object({
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
  })).optional(),
  x: z.number().optional().default(100),
  y: z.number().optional().default(100),
});

const CreateFlowchartSchema = z.object({
  title: z.string().optional(),
  steps: z.array(z.object({
    text: z.string(),
    type: z.enum(['process', 'decision', 'start', 'end']),
    branches: z.array(z.string()).optional(),
  })),
  direction: z.enum(['TB', 'LR']).optional().default('TB'),
  x: z.number().optional().default(100),
  y: z.number().optional().default(100),
});

const ApplyTemplateSchema = z.object({
  template_id: z.enum(['c4-context', 'erd', 'sprint-board', 'flowchart', 'user-story-map', 'sequence-diagram']),
  x: z.number().optional().default(0),
  y: z.number().optional().default(0),
});

/**
 * Generate Mermaid code from components
 */
function generateMermaidFromComponents(
  components: Array<{ name: string; type: string }>,
  connections: Array<{ from: string; to: string; label?: string }>
): string {
  const lines = ['flowchart TB'];

  // Map component types to shapes
  const typeToShape: Record<string, string> = {
    service: '[]',
    database: '[()]',
    queue: '[[]]',
    gateway: '{{}}',
    client: '()',
    external: '([])',
  };

  // Add component definitions
  for (const comp of components) {
    const shape = typeToShape[comp.type] || '[]';
    const name = comp.name.replace(/\s+/g, '_');
    const label = comp.name;

    if (shape === '[]') {
      lines.push(`    ${name}[${label}]`);
    } else if (shape === '[()]') {
      lines.push(`    ${name}[(${label})]`);
    } else if (shape === '[[]]') {
      lines.push(`    ${name}[[${label}]]`);
    } else if (shape === '{{}}') {
      lines.push(`    ${name}{${label}}`);
    } else if (shape === '()') {
      lines.push(`    ${name}(${label})`);
    } else if (shape === '([])') {
      lines.push(`    ${name}([${label}])`);
    }
  }

  lines.push('');

  // Add connections
  for (const conn of connections) {
    const from = conn.from.replace(/\s+/g, '_');
    const to = conn.to.replace(/\s+/g, '_');
    if (conn.label) {
      lines.push(`    ${from} -->|${conn.label}| ${to}`);
    } else {
      lines.push(`    ${from} --> ${to}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate Mermaid code from flowchart steps
 */
function generateFlowchartMermaid(
  steps: Array<{ text: string; type: string; branches?: string[] }>,
  direction: string
): string {
  const lines = [`flowchart ${direction}`];

  // Generate node IDs
  const nodeIds: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    nodeIds.push(`step${i}`);
  }

  // Add step definitions
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const id = nodeIds[i];
    const text = step.text;

    switch (step.type) {
      case 'start':
        lines.push(`    ${id}([${text}])`);
        break;
      case 'end':
        lines.push(`    ${id}([${text}])`);
        break;
      case 'decision':
        lines.push(`    ${id}{${text}}`);
        break;
      case 'process':
      default:
        lines.push(`    ${id}[${text}]`);
        break;
    }
  }

  lines.push('');

  // Add connections
  for (let i = 0; i < steps.length - 1; i++) {
    const step = steps[i];
    const fromId = nodeIds[i];

    if (step.type === 'decision' && step.branches && step.branches.length >= 2) {
      // Decision with branches - connect to next two nodes if available
      lines.push(`    ${fromId} -->|${step.branches[0]}| ${nodeIds[i + 1]}`);
      if (i + 2 < steps.length) {
        lines.push(`    ${fromId} -->|${step.branches[1]}| ${nodeIds[i + 2]}`);
      }
    } else {
      lines.push(`    ${fromId} --> ${nodeIds[i + 1]}`);
    }
  }

  return lines.join('\n');
}

/**
 * Handle diagram tool calls
 */
export async function handleDiagramTool(
  bridge: YjsBridge,
  toolName: string,
  args: unknown
): Promise<ToolResult> {
  try {
    bridge.updatePresence({ status: 'drawing', currentAction: toolName });

    const result = await executeDiagramTool(bridge, toolName, args);

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

async function executeDiagramTool(
  bridge: YjsBridge,
  toolName: string,
  args: unknown
): Promise<ToolResult> {
  switch (toolName) {
    case 'create_diagram_mermaid': {
      const input = CreateDiagramMermaidSchema.parse(args);

      const elements = mermaidToExcalidraw(input.mermaid_code, {
        startX: input.x,
        startY: input.y,
        strokeColor: input.stroke_color,
        backgroundColor: input.background_color,
      });

      const addedIds = bridge.addElements(elements);

      return {
        success: true,
        data: {
          created_count: addedIds.length,
          created_ids: addedIds,
          message: `Created diagram with ${addedIds.length} elements`,
        },
      };
    }

    case 'propose_architecture': {
      const input = ProposeArchitectureSchema.parse(args);

      let mermaidCode: string;

      if (input.template === 'custom' && input.components && input.connections) {
        // Generate from components
        mermaidCode = generateMermaidFromComponents(input.components, input.connections);
      } else if (input.template !== 'custom') {
        // Use template
        mermaidCode = DIAGRAM_TEMPLATES[input.template as DiagramTemplate];

        // If components provided, enhance the template
        if (input.components && input.connections) {
          mermaidCode = generateMermaidFromComponents(input.components, input.connections);
        }
      } else {
        return {
          success: false,
          error: 'Custom template requires components and connections',
        };
      }

      const elements = mermaidToExcalidraw(mermaidCode, {
        startX: input.x,
        startY: input.y,
      });

      const addedIds = bridge.addElements(elements);

      return {
        success: true,
        data: {
          created_count: addedIds.length,
          created_ids: addedIds,
          template_used: input.template,
          mermaid_code: mermaidCode,
          message: `Created ${input.template} architecture diagram with ${addedIds.length} elements`,
        },
      };
    }

    case 'create_flowchart': {
      const input = CreateFlowchartSchema.parse(args);

      const mermaidCode = generateFlowchartMermaid(input.steps, input.direction);

      const elements = mermaidToExcalidraw(mermaidCode, {
        startX: input.x,
        startY: input.y,
      });

      // Add title if provided
      if (input.title) {
        const { createText } = await import('../lib/element-factory.js');
        const titleEl = createText(input.x, input.y - 40, input.title, {
          fontSize: 24,
        });
        elements.unshift(titleEl);
      }

      const addedIds = bridge.addElements(elements);

      return {
        success: true,
        data: {
          created_count: addedIds.length,
          created_ids: addedIds,
          mermaid_code: mermaidCode,
          message: `Created flowchart with ${input.steps.length} steps`,
        },
      };
    }

    case 'apply_template': {
      const input = ApplyTemplateSchema.parse(args);

      const template = getTemplateById(input.template_id);
      if (!template) {
        return {
          success: false,
          error: `Template not found: ${input.template_id}`,
        };
      }

      const elements = cloneTemplateElements(template, input.x, input.y);
      const addedIds = bridge.addElements(elements);

      return {
        success: true,
        data: {
          created_count: addedIds.length,
          created_ids: addedIds,
          template_id: input.template_id,
          template_name: template.name,
          template_description: template.description,
          message: `Applied template "${template.name}" with ${addedIds.length} elements`,
        },
      };
    }

    default:
      return {
        success: false,
        error: `Unknown diagram tool: ${toolName}`,
      };
  }
}
