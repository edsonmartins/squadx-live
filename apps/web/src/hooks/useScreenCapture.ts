import { useState, useCallback, useRef } from 'react';

export type CaptureState = 'idle' | 'requesting' | 'active' | 'error';
export type CaptureQuality = '720p' | '1080p' | '4k';
export type ShareType = 'window' | 'screen' | 'browser';

// Quality presets for video constraints
const QUALITY_PRESETS: Record<CaptureQuality, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
};

// Map share type to displaySurface constraint
const SHARE_TYPE_MAP: Record<ShareType, DisplayCaptureSurfaceType> = {
  window: 'window',
  screen: 'monitor',
  browser: 'browser',
};

// Check if running in Tauri desktop app
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

interface UseScreenCaptureOptions {
  onStreamStart?: (stream: MediaStream) => void;
  onStreamEnd?: () => void;
}

interface CaptureOptions {
  quality?: CaptureQuality;
  includeAudio?: boolean;
  shareType?: ShareType;
}

interface UseScreenCaptureReturn {
  stream: MediaStream | null;
  captureState: CaptureState;
  error: string | null;
  startCapture: (options?: CaptureOptions) => Promise<void>;
  stopCapture: () => Promise<void>;
}

export function useScreenCapture({
  onStreamStart,
  onStreamEnd,
}: UseScreenCaptureOptions = {}): UseScreenCaptureReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCapture = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    setStream(null);
    setCaptureState('idle');
    onStreamEnd?.();

    // Show window in screen capture again in Tauri desktop app
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('show_in_capture');
      } catch (err) {
        console.warn('[useScreenCapture] Failed to show Tauri window in capture:', err);
      }
    }
  }, [onStreamEnd]);

  const startCapture = useCallback(
    async (options: CaptureOptions = {}) => {
      const { quality = '1080p', includeAudio = true, shareType = 'window' } = options;

      // Check if getDisplayMedia is supported
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
        setError('Screen sharing is not supported in this browser');
        setCaptureState('error');
        return;
      }

      setCaptureState('requesting');
      setError(null);

      const preset = QUALITY_PRESETS[quality];
      const displaySurface = SHARE_TYPE_MAP[shareType];

      // Hide window from screen capture in Tauri desktop app (like Google Meet)
      // This makes the window invisible to screen recording while still visible to user
      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('hide_from_capture');
        } catch (err) {
          console.warn('[useScreenCapture] Failed to hide Tauri window from capture:', err);
        }
      }

      try {
        const mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface,
            width: { ideal: preset.width, max: preset.width },
            height: { ideal: preset.height, max: preset.height },
            frameRate: { ideal: 30, max: 60 },
          },
          audio: includeAudio
            ? {
                echoCancellation: true,
                noiseSuppression: true,
              }
            : false,
        });

        // Handle user stopping share via browser UI
        mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          stopCapture();
        });

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setCaptureState('active');
        onStreamStart?.(mediaStream);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start screen capture';

        // Handle specific error cases
        if (err instanceof DOMException) {
          switch (err.name) {
            case 'NotAllowedError':
              setError('Permission denied. Please allow screen sharing.');
              break;
            case 'NotFoundError':
              setError('No screen or window available for sharing.');
              break;
            case 'NotReadableError':
              setError('Unable to read from the selected source.');
              break;
            case 'AbortError':
              setError('Screen sharing was cancelled.');
              break;
            default:
              setError(errorMessage);
          }
        } else {
          setError(errorMessage);
        }

        setCaptureState('error');
      }
    },
    [onStreamStart, stopCapture]
  );

  return {
    stream,
    captureState,
    error,
    startCapture,
    stopCapture,
  };
}
