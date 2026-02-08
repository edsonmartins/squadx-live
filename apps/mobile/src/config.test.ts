import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should export APP_URL as production URL', async () => {
    const { APP_URL } = await import('./config');
    expect(APP_URL).toBe('https://squadx.live');
  });

  it('should default API_BASE_URL to squadx.live when no extra config', async () => {
    const { API_BASE_URL } = await import('./config');
    expect(API_BASE_URL).toBe('https://squadx.live');
  });

  it('should use SQUADX_API_URL from expo config extra when set', async () => {
    vi.doMock('expo-constants', () => ({
      default: {
        expoConfig: {
          extra: { SQUADX_API_URL: 'http://localhost:3000' },
        },
      },
    }));

    const { API_BASE_URL } = await import('./config');
    expect(API_BASE_URL).toBe('http://localhost:3000');
  });

  it('should ignore empty SQUADX_API_URL and fall back to APP_URL', async () => {
    vi.doMock('expo-constants', () => ({
      default: {
        expoConfig: {
          extra: { SQUADX_API_URL: '  ' },
        },
      },
    }));

    const { API_BASE_URL } = await import('./config');
    expect(API_BASE_URL).toBe('https://squadx.live');
  });
});
