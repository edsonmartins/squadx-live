'use client';

import { useState, useCallback, useMemo } from 'react';
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawElement,
  AppState,
  BinaryFiles,
  Collaborator,
  UseExcalidrawAPIReturn,
} from '../types';

/**
 * Hook to manage the Excalidraw imperative API
 * Provides a clean interface for interacting with the canvas
 */
export function useExcalidrawAPI(): UseExcalidrawAPIReturn {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

  const getElements = useCallback((): readonly ExcalidrawElement[] => {
    if (!api) return [];
    return api.getSceneElements();
  }, [api]);

  const getAppState = useCallback((): AppState | null => {
    if (!api) return null;
    return api.getAppState();
  }, [api]);

  const getFiles = useCallback((): BinaryFiles => {
    if (!api) return {};
    return api.getFiles();
  }, [api]);

  const updateScene = useCallback(
    (scene: {
      elements?: readonly ExcalidrawElement[];
      appState?: Partial<AppState>;
      collaborators?: Map<string, Collaborator>;
    }) => {
      if (!api) return;
      api.updateScene(scene);
    },
    [api]
  );

  const scrollToContent = useCallback(
    (opts?: { fitToContent?: boolean; animate?: boolean }) => {
      if (!api) return;
      api.scrollToContent(undefined, opts);
    },
    [api]
  );

  const resetScene = useCallback(() => {
    if (!api) return;
    api.resetScene();
  }, [api]);

  const exportToBlob = useCallback(
    async (opts?: {
      mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
      quality?: number;
      exportPadding?: number;
    }): Promise<Blob | null> => {
      if (!api) return null;

      const { exportToBlob: exportFn } = await import('@excalidraw/excalidraw');

      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();

      return exportFn({
        elements,
        appState: {
          ...appState,
          exportWithDarkMode: appState.theme === 'dark',
        },
        files,
        mimeType: opts?.mimeType || 'image/png',
        quality: opts?.quality,
        getDimensions: () => ({
          width: 1920,
          height: 1080,
          scale: 1,
        }),
      });
    },
    [api]
  );

  const exportToSvg = useCallback(
    async (opts?: { exportPadding?: number }): Promise<SVGSVGElement | null> => {
      if (!api) return null;

      const { exportToSvg: exportFn } = await import('@excalidraw/excalidraw');

      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();

      return exportFn({
        elements,
        appState: {
          ...appState,
          exportWithDarkMode: appState.theme === 'dark',
        },
        files,
        exportPadding: opts?.exportPadding,
      });
    },
    [api]
  );

  return useMemo(
    () => ({
      api,
      setApi,
      getElements,
      getAppState,
      getFiles,
      updateScene,
      scrollToContent,
      resetScene,
      exportToBlob,
      exportToSvg,
    }),
    [
      api,
      getElements,
      getAppState,
      getFiles,
      updateScene,
      scrollToContent,
      resetScene,
      exportToBlob,
      exportToSvg,
    ]
  );
}
