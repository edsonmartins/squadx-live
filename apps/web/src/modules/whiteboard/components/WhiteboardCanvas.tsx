'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type {
  WhiteboardCanvasProps,
  ExcalidrawElement,
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '../types';

// Import Excalidraw CSS - required for toolbar and UI to display correctly
import '@excalidraw/excalidraw/index.css';

// Dynamic import to avoid SSR issues with Excalidraw
const Excalidraw = dynamic(
  async () => {
    const mod = await import('@excalidraw/excalidraw');
    return mod.Excalidraw;
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-white dark:bg-gray-900">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Loading whiteboard...
          </span>
        </div>
      </div>
    ),
  }
);

interface WhiteboardCanvasInternalProps extends WhiteboardCanvasProps {
  onAPIReady?: (api: ExcalidrawImperativeAPI) => void;
}

export function WhiteboardCanvas({
  initialElements = [],
  initialAppState = {},
  initialFiles = {},
  onChange,
  onPointerUpdate,
  onAPIReady,
  viewModeEnabled = false,
  zenModeEnabled = false,
  gridModeEnabled = false,
  theme = 'light',
  className = '',
}: WhiteboardCanvasInternalProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      onChange?.(elements, appState, files);
    },
    [onChange]
  );

  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number };
      button: 'down' | 'up';
      pointersMap: Map<number, { x: number; y: number }>;
    }) => {
      onPointerUpdate?.(payload);
    },
    [onPointerUpdate]
  );

  if (!isClient) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-white dark:bg-gray-900 ${className}`}>
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Loading whiteboard...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full w-full ${className}`}>
      <Excalidraw
        initialData={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          elements: initialElements as any,
          appState: {
            ...initialAppState,
            theme,
            // Start with editing enabled - viewModeEnabled will be controlled via API
            viewModeEnabled: false,
            zenModeEnabled,
            gridModeEnabled,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          files: initialFiles as any,
        }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange={handleChange as any}
        onPointerUpdate={handlePointerUpdate}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        excalidrawAPI={(api: any) => onAPIReady?.(api as ExcalidrawImperativeAPI)}
        UIOptions={{
          canvasActions: {
            loadScene: true,
            export: { saveFileToDisk: true },
            saveAsImage: true,
            toggleTheme: true,
          },
          tools: {
            image: true,
          },
        }}
        langCode="en"
        renderTopRightUI={() => null}
      />
    </div>
  );
}

export default WhiteboardCanvas;
