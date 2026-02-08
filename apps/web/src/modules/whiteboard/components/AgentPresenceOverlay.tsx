'use client';

import React from 'react';
import type { CollaboratorWithPermission } from '../hooks/useWhiteboardSync';
import type { AgentStatus } from '../types';

interface AgentPresenceOverlayProps {
  collaborators: CollaboratorWithPermission[];
  className?: string;
}

/**
 * Status configuration for visual display
 */
const STATUS_CONFIG: Record<AgentStatus, {
  label: string;
  bgColor: string;
  textColor: string;
  animate: boolean;
  pulseColor: string;
}> = {
  idle: {
    label: 'Aguardando',
    bgColor: 'bg-gray-500/90',
    textColor: 'text-gray-100',
    animate: false,
    pulseColor: 'bg-gray-400',
  },
  thinking: {
    label: 'Pensando...',
    bgColor: 'bg-blue-500/90',
    textColor: 'text-blue-100',
    animate: true,
    pulseColor: 'bg-blue-400',
  },
  drawing: {
    label: 'Desenhando',
    bgColor: 'bg-green-500/90',
    textColor: 'text-green-100',
    animate: true,
    pulseColor: 'bg-green-400',
  },
  selecting: {
    label: 'Selecionando',
    bgColor: 'bg-yellow-500/90',
    textColor: 'text-yellow-100',
    animate: false,
    pulseColor: 'bg-yellow-400',
  },
  requesting_permission: {
    label: 'Pedindo permissão',
    bgColor: 'bg-purple-500/90',
    textColor: 'text-purple-100',
    animate: true,
    pulseColor: 'bg-purple-400',
  },
};

/**
 * Robot cursor SVG for AI agents
 */
function RobotCursor({ color }: { color: string }) {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      className="drop-shadow-lg"
      style={{ marginLeft: -8, marginTop: -8 }}
    >
      {/* Cursor pointer with robot head */}
      <g>
        {/* Main cursor shape */}
        <path
          d="M6 4L6 20L10 16L14 24L18 22L14 14L20 14L6 4Z"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Robot head circle */}
        <circle
          cx="24"
          cy="8"
          r="6"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
        {/* Robot antenna */}
        <line
          x1="24"
          y1="2"
          x2="24"
          y2="-2"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="24" cy="-3" r="2" fill={color} stroke="white" strokeWidth="1" />
        {/* Robot eyes */}
        <circle cx="22" cy="7" r="1.5" fill="white" />
        <circle cx="26" cy="7" r="1.5" fill="white" />
        {/* Robot mouth */}
        <rect x="21" y="10" width="6" height="1.5" rx="0.75" fill="white" />
      </g>
    </svg>
  );
}

/**
 * Status indicator with pulse animation
 */
function StatusIndicator({ status, currentAction }: { status: AgentStatus; currentAction?: string | undefined }) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-1.5">
      {/* Pulse dot */}
      <div className="relative">
        <div
          className={`h-2 w-2 rounded-full ${config.bgColor.replace('/90', '')}`}
        />
        {config.animate && (
          <div
            className={`absolute inset-0 h-2 w-2 rounded-full ${config.pulseColor} animate-ping`}
          />
        )}
      </div>

      {/* Status text */}
      <span className={`text-[10px] font-medium ${config.textColor}`}>
        {currentAction || config.label}
      </span>
    </div>
  );
}

/**
 * Overlay component to display AI agent cursors with enhanced visuals
 * Shows robot cursor, status indicator, and current action
 */
export function AgentPresenceOverlay({ collaborators, className = '' }: AgentPresenceOverlayProps) {
  // Filter only AI agents
  const agents = collaborators.filter((c) => c.isAgent);

  if (agents.length === 0) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {agents.map((agent) => {
        if (!agent.cursor) return null;

        const { cursor, odName, odColor, clientId, agentStatus, currentAction, permission, permissionReason } = agent;
        const status = agentStatus || 'idle';
        const config = STATUS_CONFIG[status];

        return (
          <div
            key={clientId}
            className="absolute transition-all duration-100"
            style={{
              transform: `translate(${cursor.x}px, ${cursor.y}px)`,
            }}
          >
            {/* Robot cursor */}
            <RobotCursor color={odColor} />

            {/* Agent info card */}
            <div
              className="absolute left-5 top-5 rounded-lg shadow-xl backdrop-blur-sm"
              style={{
                backgroundColor: `${odColor}e6`, // 90% opacity
                minWidth: '120px',
              }}
            >
              {/* Header with name */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/20">
                <svg
                  className="h-3.5 w-3.5 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4" />
                  <line x1="8" y1="16" x2="8" y2="16" />
                  <line x1="16" y1="16" x2="16" y2="16" />
                </svg>
                <span className="text-xs font-semibold text-white truncate max-w-[100px]">
                  {odName}
                </span>
              </div>

              {/* Status */}
              <div className={`px-2.5 py-1 ${config.bgColor}`}>
                <StatusIndicator
                  status={status}
                  currentAction={currentAction}
                />
              </div>

              {/* Permission reason if requesting */}
              {permission === 'requested' && permissionReason && (
                <div className="px-2.5 py-1 bg-white/10 border-t border-white/20">
                  <span className="text-[9px] text-white/80 italic line-clamp-2">
                    &ldquo;{permissionReason}&rdquo;
                  </span>
                </div>
              )}
            </div>

            {/* Selection highlight if agent has elements selected */}
            {status === 'selecting' && (
              <div
                className="absolute -inset-2 border-2 border-dashed rounded-lg animate-pulse"
                style={{ borderColor: odColor }}
              />
            )}
          </div>
        );
      })}

      {/* Agent count badge in corner */}
      {agents.length > 0 && (
        <div className="absolute top-4 right-4 flex items-center gap-2 rounded-full bg-purple-600/90 backdrop-blur px-3 py-1.5 shadow-lg">
          <svg
            className="h-4 w-4 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4" />
            <line x1="8" y1="16" x2="8" y2="16" />
            <line x1="16" y1="16" x2="16" y2="16" />
          </svg>
          <span className="text-xs font-medium text-white">
            {agents.length} agente{agents.length !== 1 ? 's' : ''} ativo{agents.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

export default AgentPresenceOverlay;
