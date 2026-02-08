/**
 * Client-side Mermaid to Excalidraw converter
 * Simplified parser for browser use
 */

import type { ExcalidrawElement } from '../types';

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
  label?: string | undefined;
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
 * Generate random ID for elements
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Generate a random seed for Excalidraw
 */
function generateSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

/**
 * Parse Mermaid syntax
 */
function parseMermaid(mermaidCode: string): ParsedMermaid {
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

    const dirMatch = firstLine.match(/(?:flowchart|graph)\s+(TB|BT|LR|RL|TD)/i);
    if (dirMatch && dirMatch[1]) {
      const dir = dirMatch[1].toUpperCase();
      result.direction = (dir === 'TD' ? 'TB' : dir) as ParsedMermaid['direction'];
    }
  }

  // Parse nodes and edges
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('%%')) continue;
    if (line.startsWith('subgraph') || line === 'end' || line.startsWith('style') || line.startsWith('classDef')) {
      continue;
    }

    // Parse edges
    const edgeMatch = line.match(/^(\w+)\s*(-->|---|-\.->|==>|--)\s*(?:\|([^|]*)\|)?\s*(\w+)/);
    if (edgeMatch) {
      const from = edgeMatch[1] || '';
      const arrowType = edgeMatch[2] || '-->';
      const label = edgeMatch[3];
      const to = edgeMatch[4] || '';

      if (from && !nodeMap.has(from)) {
        nodeMap.set(from, { id: from, label: from, shape: 'rectangle' });
      }
      if (to && !nodeMap.has(to)) {
        nodeMap.set(to, { id: to, label: to, shape: 'rectangle' });
      }

      if (from && to) {
        result.edges.push({
          from,
          to,
          label: label?.trim(),
          type: arrowType === '---' ? 'line' : arrowType === '-.->' ? 'dotted' : 'arrow',
        });
      }
      continue;
    }

    // Parse node definitions
    const nodeMatch = line.match(/^(\w+)(\[([^\]]*)\]|\(([^)]*)\)|{([^}]*)}|\(\(([^)]*)\)\)|\(\[([^\]]*)\]\))?/);
    if (nodeMatch) {
      const id = nodeMatch[1];
      if (!id) continue;

      const rectLabel = nodeMatch[3];
      const roundLabel = nodeMatch[4];
      const diamondLabel = nodeMatch[5];
      const circleLabel = nodeMatch[6];
      const stadiumLabel = nodeMatch[7];

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
        const existing = nodeMap.get(id);
        if (existing) {
          existing.label = label;
          existing.shape = shape;
        }
      }
    }
  }

  result.nodes = Array.from(nodeMap.values());
  return result;
}

/**
 * Create base element properties
 */
function createBaseElement(overrides: Partial<ExcalidrawElement> = {}): Partial<ExcalidrawElement> {
  return {
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: '#a5d8ff',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: generateSeed(),
    version: 1,
    versionNonce: generateSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    ...overrides,
  };
}

/**
 * Convert Mermaid code to Excalidraw elements
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
  const elements: ExcalidrawElement[] = [];

  const NODE_WIDTH = 120;
  const NODE_HEIGHT = 60;
  const H_SPACING = 80;
  const V_SPACING = 100;

  const offsetX = options.startX ?? 100;
  const offsetY = options.startY ?? 100;
  const strokeColor = options.strokeColor ?? '#1e1e1e';
  const bgColor = options.backgroundColor ?? '#a5d8ff';

  // Layout nodes
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

  const roots = parsed.nodes.filter(n => (parents.get(n.id)?.length ?? 0) === 0);
  if (roots.length === 0 && parsed.nodes.length > 0) {
    const firstNode = parsed.nodes[0];
    if (firstNode) {
      roots.push(firstNode);
    }
  }

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

  const nodesByLevel = new Map<number, string[]>();
  for (const [nodeId, level] of levels) {
    if (!nodesByLevel.has(level)) {
      nodesByLevel.set(level, []);
    }
    nodesByLevel.get(level)!.push(nodeId);
  }

  const isHorizontal = parsed.direction === 'LR' || parsed.direction === 'RL';
  const isReversed = parsed.direction === 'BT' || parsed.direction === 'RL';

  const nodePositions = new Map<string, { x: number; y: number; width: number; height: number }>();
  const nodeElements = new Map<string, ExcalidrawElement>();

  // Position and create nodes
  for (const [level, nodeIds] of nodesByLevel) {
    const effectiveLevel = isReversed ? (nodesByLevel.size - 1 - level) : level;

    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i];
      if (!nodeId) continue;
      const node = parsed.nodes.find(n => n.id === nodeId);
      if (!node) continue;
      const offset = (i - (nodeIds.length - 1) / 2);

      let x: number, y: number;
      if (isHorizontal) {
        x = effectiveLevel * (NODE_WIDTH + H_SPACING) + offsetX;
        y = offset * (NODE_HEIGHT + V_SPACING) + offsetY;
      } else {
        x = offset * (NODE_WIDTH + H_SPACING) + offsetX;
        y = effectiveLevel * (NODE_HEIGHT + V_SPACING) + offsetY;
      }

      nodePositions.set(nodeId, { x, y, width: NODE_WIDTH, height: NODE_HEIGHT });

      // Create shape element
      let shapeType = 'rectangle';
      let roundness: { type: number; value?: number } | null = null;

      if (node.shape === 'diamond') {
        shapeType = 'diamond';
      } else if (node.shape === 'circle') {
        shapeType = 'ellipse';
      } else if (node.shape === 'rounded' || node.shape === 'stadium') {
        roundness = { type: 3, value: 20 };
      }

      const shapeEl: ExcalidrawElement = {
        id: generateId(),
        type: shapeType,
        x,
        y,
        width: node.shape === 'circle' ? NODE_WIDTH : NODE_WIDTH,
        height: node.shape === 'circle' ? NODE_WIDTH : NODE_HEIGHT,
        ...createBaseElement({
          strokeColor,
          backgroundColor: bgColor,
          roundness,
        }),
      } as ExcalidrawElement;

      elements.push(shapeEl);
      nodeElements.set(nodeId, shapeEl);

      // Create text label
      const textEl: ExcalidrawElement = {
        id: generateId(),
        type: 'text',
        x: x + NODE_WIDTH / 2 - (node.label.length * 4),
        y: y + NODE_HEIGHT / 2 - 10,
        width: node.label.length * 8,
        height: 20,
        text: node.label,
        fontSize: 16,
        fontFamily: 1,
        textAlign: 'center',
        verticalAlign: 'middle',
        baseline: 16,
        containerId: null,
        originalText: node.label,
        lineHeight: 1.25,
        ...createBaseElement({
          strokeColor,
          backgroundColor: 'transparent',
        }),
      } as ExcalidrawElement;

      elements.push(textEl);
    }
  }

  // Create edges
  for (const edge of parsed.edges) {
    const fromEl = nodeElements.get(edge.from);
    const toEl = nodeElements.get(edge.to);
    if (!fromEl || !toEl) continue;

    const fromCenterX = fromEl.x + fromEl.width / 2;
    const fromCenterY = fromEl.y + fromEl.height / 2;
    const toCenterX = toEl.x + toEl.width / 2;
    const toCenterY = toEl.y + toEl.height / 2;

    let fromX: number, fromY: number, toX: number, toY: number;

    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;

    if (Math.abs(dx) > Math.abs(dy)) {
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

    const arrowEl: ExcalidrawElement = {
      id: generateId(),
      type: 'arrow',
      x: fromX,
      y: fromY,
      width: Math.abs(toX - fromX),
      height: Math.abs(toY - fromY),
      points: [[0, 0], [toX - fromX, toY - fromY]],
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: edge.type === 'line' ? null : 'arrow',
      ...createBaseElement({
        strokeColor,
        backgroundColor: 'transparent',
        strokeStyle: edge.type === 'dotted' ? 'dashed' : 'solid',
        roundness: { type: 2 },
      }),
    } as ExcalidrawElement;

    elements.push(arrowEl);

    // Add edge label
    if (edge.label) {
      const labelEl: ExcalidrawElement = {
        id: generateId(),
        type: 'text',
        x: (fromX + toX) / 2 - (edge.label.length * 3),
        y: (fromY + toY) / 2 - 20,
        width: edge.label.length * 6,
        height: 14,
        text: edge.label,
        fontSize: 12,
        fontFamily: 1,
        textAlign: 'center',
        verticalAlign: 'middle',
        baseline: 12,
        containerId: null,
        originalText: edge.label,
        lineHeight: 1.25,
        ...createBaseElement({
          strokeColor,
          backgroundColor: 'transparent',
        }),
      } as ExcalidrawElement;

      elements.push(labelEl);
    }
  }

  return elements;
}

export default mermaidToExcalidraw;
