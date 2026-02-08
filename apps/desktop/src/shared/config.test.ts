import { describe, it, expect, vi, afterEach } from 'vitest';

describe('shared config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('should export APP_URL as production URL', async () => {
    const { APP_URL } = await import('./config');
    expect(APP_URL).toBe('https://squadx.live');
  });

  it('should export API_BASE_URL as squadx.live by default', async () => {
    delete process.env.SQUADX_API_URL;
    const { API_BASE_URL } = await import('./config');
    expect(API_BASE_URL).toBe('https://squadx.live');
  });

  it('should export API_BASE_URL as squadx.live even in development mode', async () => {
    delete process.env.SQUADX_API_URL;
    process.env.NODE_ENV = 'development';
    const { API_BASE_URL } = await import('./config');
    expect(API_BASE_URL).toBe('https://squadx.live');
  });

  it('should allow overriding API_BASE_URL via SQUADX_API_URL env var', async () => {
    process.env.SQUADX_API_URL = 'http://localhost:3000';
    const { API_BASE_URL } = await import('./config');
    expect(API_BASE_URL).toBe('http://localhost:3000');
  });

  it('should ignore empty SQUADX_API_URL and fall back to APP_URL', async () => {
    process.env.SQUADX_API_URL = '';
    const { API_BASE_URL } = await import('./config');
    expect(API_BASE_URL).toBe('https://squadx.live');
  });
});
