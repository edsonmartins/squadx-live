/**
 * Shared configuration for the desktop app.
 *
 * API_BASE_URL always defaults to squadx.live.
 * Override with the SQUADX_API_URL env var to point at a different server
 * (e.g. SQUADX_API_URL=http://localhost:3000 for local development).
 */

export const APP_URL = 'https://squadx.live';

const raw = typeof process !== 'undefined' ? process.env.SQUADX_API_URL?.trim() : undefined;
const envOverride = raw !== '' ? raw : undefined;

export const API_BASE_URL = envOverride ?? APP_URL;
