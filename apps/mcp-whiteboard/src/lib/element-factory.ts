/**
 * Element Factory for creating valid Excalidraw elements
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ExcalidrawElement,
  CreateShapeRequest,
  TextElement,
  LinearElement,
} from '../types.js';

/**
 * Default element properties
 */
const DEFAULT_PROPS = {
  angle: 0,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'hachure' as const,
  strokeWidth: 2,
  strokeStyle: 'solid' as const,
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  isDeleted: false,
  boundElements: null,
  link: null,
  locked: false,
};

/**
 * Generate a random seed for Excalidraw's rough.js rendering
 */
function generateSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

/**
 * Generate version nonce
 */
function generateVersionNonce(): number {
  return Math.floor(Math.random() * 2147483647);
}

/**
 * Create a base element with common properties
 */
function createBaseElement(
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  overrides: Partial<ExcalidrawElement> = {}
): ExcalidrawElement {
  return {
    id: uuidv4(),
    type,
    x,
    y,
    width,
    height,
    seed: generateSeed(),
    version: 1,
    versionNonce: generateVersionNonce(),
    updated: Date.now(),
    ...DEFAULT_PROPS,
    ...overrides,
  };
}

/**
 * Create a rectangle element
 */
export function createRectangle(
  x: number,
  y: number,
  width: number = 100,
  height: number = 100,
  options: Partial<ExcalidrawElement> = {}
): ExcalidrawElement {
  return createBaseElement('rectangle', x, y, width, height, {
    roundness: { type: 3 }, // Adaptive radius
    ...options,
  });
}

/**
 * Create an ellipse element
 */
export function createEllipse(
  x: number,
  y: number,
  width: number = 100,
  height: number = 100,
  options: Partial<ExcalidrawElement> = {}
): ExcalidrawElement {
  return createBaseElement('ellipse', x, y, width, height, options);
}

/**
 * Create a diamond element
 */
export function createDiamond(
  x: number,
  y: number,
  width: number = 100,
  height: number = 100,
  options: Partial<ExcalidrawElement> = {}
): ExcalidrawElement {
  return createBaseElement('diamond', x, y, width, height, options);
}

/**
 * Create a text element
 */
export function createText(
  x: number,
  y: number,
  text: string,
  options: Partial<TextElement> = {}
): TextElement {
  // Estimate dimensions based on text
  const fontSize = options.fontSize || 20;
  const lines = text.split('\n');
  const maxLineLength = Math.max(...lines.map((l) => l.length));
  const estimatedWidth = maxLineLength * fontSize * 0.6;
  const estimatedHeight = lines.length * fontSize * 1.2;

  return {
    id: uuidv4(),
    type: 'text',
    x,
    y,
    width: estimatedWidth,
    height: estimatedHeight,
    text,
    fontSize,
    fontFamily: options.fontFamily || 1, // 1 = Virgil (hand-drawn)
    textAlign: options.textAlign || 'left',
    verticalAlign: options.verticalAlign || 'top',
    baseline: estimatedHeight * 0.8,
    containerId: null,
    originalText: text,
    lineHeight: 1.25,
    seed: generateSeed(),
    version: 1,
    versionNonce: generateVersionNonce(),
    updated: Date.now(),
    ...DEFAULT_PROPS,
    strokeColor: options.strokeColor || '#1e1e1e',
    backgroundColor: 'transparent',
    ...options,
  } as TextElement;
}

/**
 * Create a line element
 */
export function createLine(
  points: Array<[number, number]>,
  options: Partial<LinearElement> = {}
): LinearElement {
  if (points.length < 2) {
    throw new Error('Line requires at least 2 points');
  }

  const [startX, startY] = points[0];

  // Normalize points relative to start
  const normalizedPoints = points.map(([px, py]) => [px - startX, py - startY] as [number, number]);

  // Calculate bounding box
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);

  return {
    id: uuidv4(),
    type: 'line',
    x: startX,
    y: startY,
    width,
    height,
    points: normalizedPoints,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
    seed: generateSeed(),
    version: 1,
    versionNonce: generateVersionNonce(),
    updated: Date.now(),
    ...DEFAULT_PROPS,
    roundness: { type: 2 }, // Proportional radius for lines
    ...options,
  } as LinearElement;
}

/**
 * Create an arrow element
 */
export function createArrow(
  points: Array<[number, number]>,
  options: Partial<LinearElement> = {}
): LinearElement {
  const line = createLine(points, options);
  return {
    ...line,
    type: 'arrow',
    endArrowhead: options.endArrowhead ?? 'arrow',
    startArrowhead: options.startArrowhead ?? null,
  } as LinearElement;
}

/**
 * Create a sticky note (rectangle with text)
 */
export function createStickyNote(
  x: number,
  y: number,
  text: string,
  options: {
    width?: number;
    height?: number;
    backgroundColor?: string;
  } = {}
): ExcalidrawElement[] {
  const width = options.width || 200;
  const height = options.height || 150;
  const bgColor = options.backgroundColor || '#ffc9c9'; // Light red/pink

  const groupId = uuidv4();

  const rect = createRectangle(x, y, width, height, {
    backgroundColor: bgColor,
    fillStyle: 'solid',
    strokeWidth: 1,
    roughness: 0,
    groupIds: [groupId],
  });

  const textEl = createText(x + 10, y + 10, text, {
    groupIds: [groupId],
    fontSize: 16,
  });

  // Adjust text width to fit
  textEl.width = Math.min(textEl.width, width - 20);

  return [rect, textEl];
}

/**
 * Create element from request
 */
export function createElementFromRequest(request: CreateShapeRequest): ExcalidrawElement | ExcalidrawElement[] {
  const options: Partial<ExcalidrawElement> = {};

  if (request.strokeColor) options.strokeColor = request.strokeColor;
  if (request.backgroundColor) options.backgroundColor = request.backgroundColor;
  if (request.fillStyle) options.fillStyle = request.fillStyle;
  if (request.strokeWidth) options.strokeWidth = request.strokeWidth;
  if (request.roughness !== undefined) options.roughness = request.roughness;
  if (request.opacity !== undefined) options.opacity = request.opacity;

  switch (request.type) {
    case 'rectangle':
      return createRectangle(
        request.x,
        request.y,
        request.width || 100,
        request.height || 100,
        options
      );

    case 'ellipse':
      return createEllipse(
        request.x,
        request.y,
        request.width || 100,
        request.height || 100,
        options
      );

    case 'diamond':
      return createDiamond(
        request.x,
        request.y,
        request.width || 100,
        request.height || 100,
        options
      );

    case 'text':
      return createText(request.x, request.y, request.text || '', options as Partial<TextElement>);

    case 'line':
      if (!request.points || request.points.length < 2) {
        // Default to horizontal line
        return createLine([
          [request.x, request.y],
          [request.x + (request.width || 100), request.y],
        ], options as Partial<LinearElement>);
      }
      return createLine(request.points, options as Partial<LinearElement>);

    case 'arrow':
      if (!request.points || request.points.length < 2) {
        // Default to horizontal arrow
        return createArrow([
          [request.x, request.y],
          [request.x + (request.width || 100), request.y],
        ], {
          ...options,
          startArrowhead: request.startArrowhead,
          endArrowhead: request.endArrowhead ?? 'arrow',
        } as Partial<LinearElement>);
      }
      return createArrow(request.points, {
        ...options,
        startArrowhead: request.startArrowhead,
        endArrowhead: request.endArrowhead ?? 'arrow',
      } as Partial<LinearElement>);

    default:
      throw new Error(`Unknown element type: ${request.type}`);
  }
}
