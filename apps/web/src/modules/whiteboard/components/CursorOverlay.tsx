'use client';

import React from 'react';
import type { CollaboratorWithPermission } from '../hooks/useWhiteboardSync';
import { Bot, Hand } from 'lucide-react';

interface CursorOverlayProps {
  collaborators: CollaboratorWithPermission[];
  className?: string;
}

/**
 * Overlay component to display remote user cursors and names
 */
export function CursorOverlay({ collaborators, className = '' }: CursorOverlayProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {collaborators.map((collaborator) => {
        if (!collaborator.cursor) return null;

        const { cursor, odName, odColor, isAgent, permission, clientId } = collaborator;

        return (
          <div
            key={clientId}
            className="absolute transition-transform duration-75"
            style={{
              transform: `translate(${cursor.x}px, ${cursor.y}px)`,
            }}
          >
            {/* Cursor pointer */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="drop-shadow-md"
              style={{ marginLeft: -4, marginTop: -2 }}
            >
              <path
                d="M5.65376 12.4561L4.08394 3.38779C3.95627 2.67571 4.71257 2.10857 5.35838 2.42478L20.1967 9.56645C20.8746 9.89912 20.8027 10.8934 20.0817 11.1208L13.1647 13.2968C12.9179 13.3749 12.7056 13.5344 12.5617 13.7503L9.01285 19.1383C8.5939 19.7667 7.67082 19.5902 7.49942 18.8555L5.65376 12.4561Z"
                fill={odColor}
                stroke="white"
                strokeWidth="1.5"
              />
            </svg>

            {/* Name label */}
            <div
              className="absolute left-4 top-4 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white shadow-lg whitespace-nowrap"
              style={{ backgroundColor: odColor }}
            >
              {isAgent && <Bot className="h-3 w-3" />}
              {permission === 'requested' && <Hand className="h-3 w-3 animate-pulse" />}
              <span className="max-w-[100px] truncate">{odName}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CursorOverlay;
