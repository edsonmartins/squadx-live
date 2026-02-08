'use client';

import React from 'react';
import { Maximize2, Columns, Layers } from 'lucide-react';
import type { WhiteboardDisplayMode } from '../types';

interface WhiteboardModeSelectorProps {
  mode: WhiteboardDisplayMode;
  onModeChange: (mode: WhiteboardDisplayMode) => void;
  className?: string;
}

const MODE_CONFIG: Record<
  WhiteboardDisplayMode,
  {
    icon: typeof Maximize2;
    label: string;
    description: string;
  }
> = {
  tab: {
    icon: Maximize2,
    label: 'Tab',
    description: 'Whiteboard em tela cheia',
  },
  split: {
    icon: Columns,
    label: 'Split',
    description: 'Dividir com Live View',
  },
  overlay: {
    icon: Layers,
    label: 'Overlay',
    description: 'Sobrepor no Live View',
  },
};

/**
 * Toggle component for switching between whiteboard display modes
 */
export function WhiteboardModeSelector({
  mode,
  onModeChange,
  className = '',
}: WhiteboardModeSelectorProps) {
  return (
    <div
      className={`flex items-center gap-1 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur p-1 shadow-lg border border-gray-200 dark:border-gray-700 ${className}`}
    >
      {(Object.keys(MODE_CONFIG) as WhiteboardDisplayMode[]).map((modeKey) => {
        const config = MODE_CONFIG[modeKey];
        const Icon = config.icon;
        const isActive = mode === modeKey;

        return (
          <button
            key={modeKey}
            onClick={() => onModeChange(modeKey)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isActive
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title={config.description}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default WhiteboardModeSelector;
