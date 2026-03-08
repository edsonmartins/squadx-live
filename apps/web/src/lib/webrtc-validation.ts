/**
 * WebRTC Message Validation
 *
 * Validates incoming data channel messages to prevent malformed data attacks.
 * Uses strict schemas to ensure messages conform to expected formats.
 */
import { z } from 'zod';

// Control message schemas
const controlGrantSchema = z.object({
  type: z.literal('control-grant'),
  participantId: z.string().min(1).max(100),
  timestamp: z.number().int().positive(),
});

const controlRevokeSchema = z.object({
  type: z.literal('control-revoke'),
  participantId: z.string().min(1).max(100),
  timestamp: z.number().int().positive(),
});

const controlRequestSchema = z.object({
  type: z.literal('control-request'),
  participantId: z.string().min(1).max(100),
  timestamp: z.number().int().positive(),
});

// Cursor position schema
const cursorPositionSchema = z.object({
  type: z.literal('cursor'),
  x: z.number().min(0).max(10000),
  y: z.number().min(0).max(10000),
  visible: z.boolean(),
  timestamp: z.number().int().positive(),
});

// Kick message schema
const kickMessageSchema = z.object({
  type: z.literal('kick'),
  reason: z.string().max(200).optional(),
  timestamp: z.number().int().positive(),
});

// Mute message schema
const muteMessageSchema = z.object({
  type: z.literal('mute'),
  participantId: z.string().min(1).max(100),
  muted: z.boolean(),
  timestamp: z.number().int().positive(),
});

// Input event schemas
const mouseEventSchema = z.object({
  type: z.enum(['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu']),
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  button: z.number().int().min(0).max(4).optional(),
});

const wheelEventSchema = z.object({
  type: z.literal('wheel'),
  deltaX: z.number().min(-10000).max(10000),
  deltaY: z.number().min(-10000).max(10000),
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
});

const keyEventSchema = z.object({
  type: z.enum(['keydown', 'keyup']),
  key: z.string().max(50),
  code: z.string().max(50),
  ctrlKey: z.boolean().optional(),
  altKey: z.boolean().optional(),
  shiftKey: z.boolean().optional(),
  metaKey: z.boolean().optional(),
});

const inputEventSchema = z.discriminatedUnion('type', [
  mouseEventSchema,
  wheelEventSchema,
  keyEventSchema,
]);

const inputMessageSchema = z.object({
  type: z.literal('input'),
  timestamp: z.number().int().positive(),
  sequence: z.number().int().min(0),
  event: inputEventSchema,
});

// Presentation message schemas
const presentationRequestSchema = z.object({
  type: z.literal('presentation-request'),
  participantId: z.string().min(1).max(100),
  participantName: z.string().min(1).max(100),
  timestamp: z.number().int().positive(),
});

const presentationGrantSchema = z.object({
  type: z.literal('presentation-grant'),
  participantId: z.string().min(1).max(100),
  timestamp: z.number().int().positive(),
});

const presentationRevokeSchema = z.object({
  type: z.literal('presentation-revoke'),
  reason: z.enum(['host-revoked', 'new-presenter', 'self-stopped']).optional(),
  timestamp: z.number().int().positive(),
});

const presentationDenySchema = z.object({
  type: z.literal('presentation-deny'),
  participantId: z.string().min(1).max(100),
  timestamp: z.number().int().positive(),
});

// Combined schemas for different contexts
export const viewerMessageSchema = z.discriminatedUnion('type', [
  controlGrantSchema,
  controlRevokeSchema,
  cursorPositionSchema,
  kickMessageSchema,
  muteMessageSchema,
  presentationGrantSchema,
  presentationRevokeSchema,
  presentationDenySchema,
]);

export const hostMessageSchema = z.discriminatedUnion('type', [
  controlRequestSchema,
  controlRevokeSchema,
  inputMessageSchema,
  cursorPositionSchema,
  presentationRequestSchema,
  presentationRevokeSchema,
]);

// Type exports
export type ValidViewerMessage = z.infer<typeof viewerMessageSchema>;
export type ValidHostMessage = z.infer<typeof hostMessageSchema>;

/**
 * Validate a message received by a viewer from the host
 */
export function validateViewerMessage(data: string): ValidViewerMessage | null {
  try {
    const parsed: unknown = JSON.parse(data);
    const result = viewerMessageSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    console.warn('[WebRTC] Invalid viewer message:', result.error.message);
    return null;
  } catch {
    console.warn('[WebRTC] Failed to parse viewer message');
    return null;
  }
}

/**
 * Validate a message received by the host from a viewer
 */
export function validateHostMessage(data: string): ValidHostMessage | null {
  try {
    const parsed: unknown = JSON.parse(data);
    const result = hostMessageSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    console.warn('[WebRTC] Invalid host message:', result.error.message);
    return null;
  } catch {
    console.warn('[WebRTC] Failed to parse host message');
    return null;
  }
}
