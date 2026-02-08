/**
 * Mermaid Parser for MCP Server
 * Converts Mermaid syntax to Excalidraw elements
 *
 * Note: This is a simplified parser for server-side use.
 * For full Mermaid support, use @excalidraw/mermaid-to-excalidraw in browser.
 */

import type { ExcalidrawElement, LinearElement } from '../types.js';
import {
  createRectangle,
  createDiamond,
  createEllipse,
  createText,
  createArrow,
} from './element-factory.js';

/**
 * Parsed node from Mermaid
 */
interface MermaidNode {
  id: string;
  label: string;
  shape: 'rectangle' | 'rounded' | 'diamond' | 'circle' | 'stadium';
}

/**
 * Parsed edge from Mermaid
 */
interface MermaidEdge {
  from: string;
  to: string;
  label?: string;
  type: 'arrow' | 'line' | 'dotted';
}

/**
 * Parsed Mermaid diagram
 */
interface ParsedMermaid {
  type: 'flowchart' | 'graph' | 'sequence' | 'class' | 'unknown';
  direction: 'TB' | 'BT' | 'LR' | 'RL';
  nodes: MermaidNode[];
  edges: MermaidEdge[];
}

/**
 * Layout result with positions
 */
interface LayoutResult {
  nodes: Map<string, { x: number; y: number; width: number; height: number }>;
}

/**
 * Parse Mermaid syntax
 */
export function parseMermaid(mermaidCode: string): ParsedMermaid {
  const lines = mermaidCode.trim().split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));

  const result: ParsedMermaid = {
    type: 'unknown',
    direction: 'TB',
    nodes: [],
    edges: [],
  };

  const nodeMap = new Map<string, MermaidNode>();

  // Detect diagram type and direction
  const firstLine = lines[0]?.toLowerCase() || '';
  if (firstLine.startsWith('flowchart') || firstLine.startsWith('graph')) {
    result.type = firstLine.startsWith('flowchart') ? 'flowchart' : 'graph';

    // Parse direction
    const dirMatch = firstLine.match(/(?:flowchart|graph)\s+(TB|BT|LR|RL|TD)/i);
    if (dirMatch) {
      result.direction = dirMatch[1].toUpperCase() as ParsedMermaid['direction'];
      if (result.direction === 'TD' as ParsedMermaid['direction']) {
        result.direction = 'TB';
      }
    }
  } else if (firstLine.startsWith('sequencediagram')) {
    result.type = 'sequence';
    result.direction = 'LR';
  } else if (firstLine.startsWith('classdiagram')) {
    result.type = 'class';
  }

  // Parse nodes and edges
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('%%')) continue;

    // Skip subgraph, end, style directives
    if (line.startsWith('subgraph') || line === 'end' || line.startsWith('style') || line.startsWith('classDef')) {
      continue;
    }

    // Parse edges with various arrow types
    // A --> B, A --- B, A -.-> B, A ==> B, A -->|label| B
    const edgeMatch = line.match(/^(\w+)\s*(-->|---|-\.->|==>|--)\s*(?:\|([^|]*)\|)?\s*(\w+)/);
    if (edgeMatch) {
      const [, from, arrowType, label, to] = edgeMatch;

      // Ensure nodes exist
      if (!nodeMap.has(from)) {
        nodeMap.set(from, { id: from, label: from, shape: 'rectangle' });
      }
      if (!nodeMap.has(to)) {
        nodeMap.set(to, { id: to, label: to, shape: 'rectangle' });
      }

      result.edges.push({
        from,
        to,
        label: label?.trim(),
        type: arrowType === '---' ? 'line' : arrowType === '-.->' ? 'dotted' : 'arrow',
      });
      continue;
    }

    // Parse node definitions
    // A[Rectangle], A(Rounded), A{Diamond}, A((Circle)), A([Stadium])
    const nodeMatch = line.match(/^(\w+)(\[([^\]]*)\]|\(([^)]*)\)|{([^}]*)}|\(\(([^)]*)\)\)|\(\[([^\]]*)\]\))?/);
    if (nodeMatch) {
      const [, id, , rectLabel, roundLabel, diamondLabel, circleLabel, stadiumLabel] = nodeMatch;

      let shape: MermaidNode['shape'] = 'rectangle';
      let label = id;

      if (rectLabel !== undefined) {
        shape = 'rectangle';
        label = rectLabel;
      } else if (roundLabel !== undefined) {
        shape = 'rounded';
        label = roundLabel;
      } else if (diamondLabel !== undefined) {
        shape = 'diamond';
        label = diamondLabel;
      } else if (circleLabel !== undefined) {
        shape = 'circle';
        label = circleLabel;
      } else if (stadiumLabel !== undefined) {
        shape = 'stadium';
        label = stadiumLabel;
      }

      if (!nodeMap.has(id)) {
        nodeMap.set(id, { id, label, shape });
      } else {
        // Update existing node with shape/label
        const existing = nodeMap.get(id)!;
        existing.label = label;
        existing.shape = shape;
      }
    }
  }

  result.nodes = Array.from(nodeMap.values());
  return result;
}

/**
 * Layout nodes using simple grid/tree algorithm
 */
function layoutNodes(parsed: ParsedMermaid): LayoutResult {
  const result: LayoutResult = { nodes: new Map() };

  const NODE_WIDTH = 120;
  const NODE_HEIGHT = 60;
  const H_SPACING = 80;
  const V_SPACING = 100;

  // Build adjacency list
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();

  for (const node of parsed.nodes) {
    children.set(node.id, []);
    parents.set(node.id, []);
  }

  for (const edge of parsed.edges) {
    children.get(edge.from)?.push(edge.to);
    parents.get(edge.to)?.push(edge.from);
  }

  // Find root nodes (no parents)
  const roots = parsed.nodes.filter(n => (parents.get(n.id)?.length ?? 0) === 0);
  if (roots.length === 0 && parsed.nodes.length > 0) {
    roots.push(parsed.nodes[0]);
  }

  // BFS to assign levels
  const levels = new Map<string, number>();
  const queue: string[] = roots.map(r => r.id);
  for (const root of roots) {
    levels.set(root.id, 0);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current) ?? 0;

    for (const child of children.get(current) ?? []) {
      if (!levels.has(child)) {
        levels.set(child, currentLevel + 1);
        queue.push(child);
      }
    }
  }

  // Group nodes by level
  const nodesByLevel = new Map<number, string[]>();
  for (const [nodeId, level] of levels) {
    if (!nodesByLevel.has(level)) {
      nodesByLevel.set(level, []);
    }
    nodesByLevel.get(level)!.push(nodeId);
  }

  // Position nodes
  const isHorizontal = parsed.direction === 'LR' || parsed.direction === 'RL';
  const isReversed = parsed.direction === 'BT' || parsed.direction === 'RL';

  for (const [level, nodeIds] of nodesByLevel) {
    const effectiveLevel = isReversed ? (nodesByLevel.size - 1 - level) : level;

    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i];
      const offset = (i - (nodeIds.length - 1) / 2);

      let x: number, y: number;
      if (isHorizontal) {
        x = effectiveLevel * (NODE_WIDTH + H_SPACING);
        y = offset * (NODE_HEIGHT + V_SPACING);
      } else {
        x = offset * (NODE_WIDTH + H_SPACING);
        y = effectiveLevel * (NODE_HEIGHT + V_SPACING);
      }

      result.nodes.set(nodeId, {
        x: x + 100, // Offset from origin
        y: y + 100,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    }
  }

  // Handle nodes not in levels (disconnected)
  let disconnectedY = (nodesByLevel.size + 1) * (NODE_HEIGHT + V_SPACING) + 100;
  for (const node of parsed.nodes) {
    if (!result.nodes.has(node.id)) {
      result.nodes.set(node.id, {
        x: 100,
        y: disconnectedY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
      disconnectedY += NODE_HEIGHT + V_SPACING;
    }
  }

  return result;
}

/**
 * Convert parsed Mermaid to Excalidraw elements
 */
export function mermaidToExcalidraw(
  mermaidCode: string,
  options: {
    startX?: number;
    startY?: number;
    strokeColor?: string;
    backgroundColor?: string;
  } = {}
): ExcalidrawElement[] {
  const parsed = parseMermaid(mermaidCode);
  const layout = layoutNodes(parsed);

  const elements: ExcalidrawElement[] = [];
  const nodeElements = new Map<string, ExcalidrawElement>();

  const offsetX = options.startX ?? 0;
  const offsetY = options.startY ?? 0;
  const strokeColor = options.strokeColor ?? '#1e1e1e';
  const bgColor = options.backgroundColor ?? '#a5d8ff';

  // Create node shapes
  for (const node of parsed.nodes) {
    const pos = layout.nodes.get(node.id);
    if (!pos) continue;

    const x = pos.x + offsetX;
    const y = pos.y + offsetY;

    let shapeEl: ExcalidrawElement;

    switch (node.shape) {
      case 'diamond':
        shapeEl = createDiamond(x, y, pos.width, pos.height, {
          strokeColor,
          backgroundColor: bgColor,
          fillStyle: 'solid',
        });
        break;
      case 'circle':
        shapeEl = createEllipse(x, y, pos.width, pos.width, {
          strokeColor,
          backgroundColor: bgColor,
          fillStyle: 'solid',
        });
        break;
      case 'rounded':
      case 'stadium':
        shapeEl = createRectangle(x, y, pos.width, pos.height, {
          strokeColor,
          backgroundColor: bgColor,
          fillStyle: 'solid',
          roundness: { type: 3, value: 20 },
        });
        break;
      default:
        shapeEl = createRectangle(x, y, pos.width, pos.height, {
          strokeColor,
          backgroundColor: bgColor,
          fillStyle: 'solid',
        });
    }

    elements.push(shapeEl);
    nodeElements.set(node.id, shapeEl);

    // Add label
    const textEl = createText(
      x + pos.width / 2 - (node.label.length * 4),
      y + pos.height / 2 - 10,
      node.label,
      {
        fontSize: 16,
        textAlign: 'center',
      }
    );
    elements.push(textEl as ExcalidrawElement);
  }

  // Create edges
  for (const edge of parsed.edges) {
    const fromEl = nodeElements.get(edge.from);
    const toEl = nodeElements.get(edge.to);

    if (!fromEl || !toEl) continue;

    // Calculate connection points
    const fromCenterX = fromEl.x + fromEl.width / 2;
    const fromCenterY = fromEl.y + fromEl.height / 2;
    const toCenterX = toEl.x + toEl.width / 2;
    const toCenterY = toEl.y + toEl.height / 2;

    // Determine best connection points based on relative position
    let fromX: number, fromY: number, toX: number, toY: number;

    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal connection
      if (dx > 0) {
        fromX = fromEl.x + fromEl.width;
        fromY = fromCenterY;
        toX = toEl.x;
        toY = toCenterY;
      } else {
        fromX = fromEl.x;
        fromY = fromCenterY;
        toX = toEl.x + toEl.width;
        toY = toCenterY;
      }
    } else {
      // Vertical connection
      if (dy > 0) {
        fromX = fromCenterX;
        fromY = fromEl.y + fromEl.height;
        toX = toCenterX;
        toY = toEl.y;
      } else {
        fromX = fromCenterX;
        fromY = fromEl.y;
        toX = toCenterX;
        toY = toEl.y + toEl.height;
      }
    }

    const arrowEl = createArrow(
      [[fromX, fromY], [toX, toY]],
      {
        strokeColor,
        strokeStyle: edge.type === 'dotted' ? 'dashed' : 'solid',
        endArrowhead: edge.type === 'line' ? null : 'arrow',
      }
    ) as LinearElement;

    elements.push(arrowEl as ExcalidrawElement);

    // Add edge label if present
    if (edge.label) {
      const labelX = (fromX + toX) / 2 - (edge.label.length * 3);
      const labelY = (fromY + toY) / 2 - 20;

      const labelEl = createText(labelX, labelY, edge.label, {
        fontSize: 12,
      });
      elements.push(labelEl as ExcalidrawElement);
    }
  }

  return elements;
}

/**
 * Diagram templates for common architecture patterns
 */
export const DIAGRAM_TEMPLATES = {
  'c4-context': `
flowchart TB
    User[User/Actor]
    System[System Name]
    External[External System]

    User --> System
    System --> External
  `,

  'c4-container': `
flowchart TB
    subgraph System
        WebApp[Web Application]
        API[API Server]
        DB[(Database)]
    end

    User[User] --> WebApp
    WebApp --> API
    API --> DB
  `,

  'microservices': `
flowchart LR
    Gateway[API Gateway]
    Auth[Auth Service]
    Users[User Service]
    Orders[Order Service]
    DB1[(User DB)]
    DB2[(Order DB)]

    Gateway --> Auth
    Gateway --> Users
    Gateway --> Orders
    Users --> DB1
    Orders --> DB2
  `,

  'event-driven': `
flowchart TB
    Producer[Producer]
    Queue[Message Queue]
    Consumer1[Consumer 1]
    Consumer2[Consumer 2]

    Producer --> Queue
    Queue --> Consumer1
    Queue --> Consumer2
  `,

  'three-tier': `
flowchart TB
    Presentation[Presentation Layer]
    Business[Business Logic]
    Data[Data Layer]
    DB[(Database)]

    Presentation --> Business
    Business --> Data
    Data --> DB
  `,
};

export type DiagramTemplate = keyof typeof DIAGRAM_TEMPLATES;
