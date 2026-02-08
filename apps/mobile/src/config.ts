/**
 * Shared configuration for the mobile app.
 *
 * API_BASE_URL always defaults to squadx.live.
 * Override with the SQUADX_API_URL env var to point at a different server
 * (e.g. SQUADX_API_URL=http://localhost:3000 for local development).
 */
import Constants from 'expo-constants';

export const APP_URL = 'https://squadx.live';

const raw = Constants.expoConfig?.extra?.SQUADX_API_URL as string | undefined;
const trimmed = raw?.trim();
const envOverride = trimmed !== '' ? trimmed : undefined;

export const API_BASE_URL = envOverride ?? APP_URL;
