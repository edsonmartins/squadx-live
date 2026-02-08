/**
 * Whiteboard MCP Server Types
 */

/**
 * Excalidraw element structure (simplified for MCP)
 */
export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number; value?: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: Array<{ id: string; type: string }> | null;
  updated: number;
  link: string | null;
  locked: boolean;
  [key: string]: unknown;
}

/**
 * Text element specific properties
 */
export interface TextElement extends ExcalidrawElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: number;
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  baseline: number;
  containerId: string | null;
  originalText: string;
  lineHeight: number;
}

/**
 * Rectangle element
 */
export interface RectangleElement extends ExcalidrawElement {
  type: 'rectangle';
}

/**
 * Ellipse element
 */
export interface EllipseElement extends ExcalidrawElement {
  type: 'ellipse';
}

/**
 * Diamond element
 */
export interface DiamondElement extends ExcalidrawElement {
  type: 'diamond';
}

/**
 * Line/Arrow element
 */
export interface LinearElement extends ExcalidrawElement {
  type: 'line' | 'arrow';
  points: Array<[number, number]>;
  startBinding: { elementId: string; focus: number; gap: number } | null;
  endBinding: { elementId: string; focus: number; gap: number } | null;
  startArrowhead: 'arrow' | 'bar' | 'dot' | 'triangle' | null;
  endArrowhead: 'arrow' | 'bar' | 'dot' | 'triangle' | null;
}

/**
 * Freedraw element
 */
export interface FreedrawElement extends ExcalidrawElement {
  type: 'freedraw';
  points: Array<[number, number]>;
  pressures: number[];
  simulatePressure: boolean;
}

/**
 * Shape creation request
 */
export interface CreateShapeRequest {
  type: 'rectangle' | 'ellipse' | 'diamond' | 'text' | 'line' | 'arrow';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: 'hachure' | 'solid' | 'cross-hatch';
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
  // For lines/arrows
  points?: Array<[number, number]>;
  startArrowhead?: 'arrow' | 'bar' | 'dot' | 'triangle' | null;
  endArrowhead?: 'arrow' | 'bar' | 'dot' | 'triangle' | null;
}

/**
 * Shape update request
 */
export interface UpdateShapeRequest {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
  text?: string;
  locked?: boolean;
}

/**
 * Board context summary for AI
 */
export interface BoardContextSummary {
  elementCount: number;
  elementTypes: Record<string, number>;
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  textContent: string[];
  connections: Array<{
    fromId: string;
    toId: string;
    type: 'arrow' | 'line';
  }>;
  groups: Array<{
    groupId: string;
    elementIds: string[];
  }>;
}

/**
 * Agent presence state
 */
export interface AgentPresence {
  odId: string;
  odName: string;
  odColor: string;
  cursor: {
    x: number;
    y: number;
  } | null;
  isAgent: true;
  agentId: string;
  status: 'idle' | 'thinking' | 'drawing' | 'selecting' | 'requesting_permission';
  currentAction?: string;
}

/**
 * Yjs bridge connection options
 */
export interface YjsBridgeOptions {
  websocketUrl: string;
  roomId: string;
  agentId: string;
  agentName: string;
  agentColor?: string;
}

/**
 * MCP Tool result
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
