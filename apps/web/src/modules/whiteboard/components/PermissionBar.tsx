'use client';

import React from 'react';
import { Hand, HandMetal, X, Check, Users, PenTool, Eye, Bot } from 'lucide-react';
import type { DrawPermission, CollaboratorWithPermission } from '../hooks/useWhiteboardSync';

interface PermissionBarProps {
  isHost: boolean;
  permission: DrawPermission;
  canDraw: boolean; // Reserved for future UI enhancements
  collaborators: CollaboratorWithPermission[];
  onRequestPermission: () => void;
  onReleasePermission: () => void;
  onGrantPermission: (clientId: number) => void;
  onRevokePermission: (clientId: number) => void;
  className?: string;
}

/**
 * Bar displaying permission status and controls for whiteboard
 * - Viewers: can raise/lower hand to request drawing permission
 * - Host: can see raised hands and grant/revoke permissions
 */
export function PermissionBar({
  isHost,
  permission,
  canDraw: _canDraw,
  collaborators,
  onRequestPermission,
  onReleasePermission,
  onGrantPermission,
  onRevokePermission,
  className = '',
}: PermissionBarProps) {
  // Count users with raised hands and with permission
  const raisedHands = collaborators.filter((c) => c.permission === 'requested');
  const withPermission = collaborators.filter((c) => c.permission === 'granted');

  // Separate agents from humans
  const humanRaisedHands = raisedHands.filter((c) => !c.isAgent);
  const agentRaisedHands = raisedHands.filter((c) => c.isAgent);
  const humanWithPermission = withPermission.filter((c) => !c.isAgent);
  const agentWithPermission = withPermission.filter((c) => c.isAgent);

  if (isHost) {
    return (
      <div
        className={`flex items-center gap-4 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur px-4 py-2 shadow-lg border border-gray-200 dark:border-gray-700 ${className}`}
      >
        {/* Host status */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <PenTool className="h-4 w-4 text-green-500" />
          <span>Você é o host</span>
        </div>

        <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

        {/* Participants summary */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <Users className="h-4 w-4" />
          <span>{collaborators.length} participante{collaborators.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Human raised hands */}
        {humanRaisedHands.length > 0 && (
          <>
            <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                <Hand className="h-4 w-4 animate-pulse" />
                <span>{humanRaisedHands.length} mão{humanRaisedHands.length !== 1 ? 's' : ''} levantada{humanRaisedHands.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Quick grant buttons for raised hands */}
              <div className="flex items-center gap-1 ml-2">
                {humanRaisedHands.slice(0, 3).map((c) => (
                  <button
                    key={c.clientId}
                    onClick={() => onGrantPermission(c.clientId)}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                    title={`Conceder permissão para ${c.odName}`}
                  >
                    <span className="max-w-[60px] truncate">{c.odName}</span>
                    <Check className="h-3 w-3" />
                  </button>
                ))}
                {humanRaisedHands.length > 3 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    +{humanRaisedHands.length - 3}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {/* Agent raised hands */}
        {agentRaisedHands.length > 0 && (
          <>
            <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-sm text-purple-600 dark:text-purple-400">
                <Bot className="h-4 w-4 animate-pulse" />
                <span>{agentRaisedHands.length} agente{agentRaisedHands.length !== 1 ? 's' : ''} solicitando</span>
              </div>

              {/* Quick grant buttons for agents */}
              <div className="flex items-center gap-1 ml-2">
                {agentRaisedHands.slice(0, 3).map((c) => (
                  <button
                    key={c.clientId}
                    onClick={() => onGrantPermission(c.clientId)}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                    title={`Conceder permissão para agente ${c.odName}`}
                  >
                    <Bot className="h-3 w-3" />
                    <span className="max-w-[60px] truncate">{c.odName}</span>
                    <Check className="h-3 w-3" />
                  </button>
                ))}
                {agentRaisedHands.length > 3 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    +{agentRaisedHands.length - 3}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {/* Humans with permission */}
        {humanWithPermission.length > 0 && (
          <>
            <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <PenTool className="h-4 w-4" />
                <span>{humanWithPermission.length} desenhando</span>
              </div>

              {/* Revoke buttons for humans */}
              <div className="flex items-center gap-1 ml-2">
                {humanWithPermission.slice(0, 3).map((c) => (
                  <button
                    key={c.clientId}
                    onClick={() => onRevokePermission(c.clientId)}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                    title={`Revogar permissão de ${c.odName}`}
                  >
                    <span className="max-w-[60px] truncate">{c.odName}</span>
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Agents with permission */}
        {agentWithPermission.length > 0 && (
          <>
            <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-sm text-purple-600 dark:text-purple-400">
                <Bot className="h-4 w-4" />
                <span>{agentWithPermission.length} agente{agentWithPermission.length !== 1 ? 's' : ''} desenhando</span>
              </div>

              {/* Revoke buttons for agents */}
              <div className="flex items-center gap-1 ml-2">
                {agentWithPermission.slice(0, 3).map((c) => (
                  <button
                    key={c.clientId}
                    onClick={() => onRevokePermission(c.clientId)}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                    title={`Revogar permissão do agente ${c.odName}`}
                  >
                    <Bot className="h-3 w-3" />
                    <span className="max-w-[60px] truncate">{c.odName}</span>
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Viewer UI
  return (
    <div
      className={`flex items-center gap-3 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur px-4 py-2 shadow-lg border border-gray-200 dark:border-gray-700 ${className}`}
    >
      {/* Permission status */}
      {permission === 'none' && (
        <>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Eye className="h-4 w-4" />
            <span>Modo visualização</span>
          </div>
          <button
            onClick={onRequestPermission}
            className="flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors"
          >
            <Hand className="h-4 w-4" />
            Levantar mão
          </button>
        </>
      )}

      {permission === 'requested' && (
        <>
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <HandMetal className="h-4 w-4 animate-bounce" />
            <span>Aguardando aprovação...</span>
          </div>
          <button
            onClick={onReleasePermission}
            className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>
        </>
      )}

      {permission === 'granted' && (
        <>
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <PenTool className="h-4 w-4" />
            <span>Permissão concedida</span>
          </div>
          <button
            onClick={onReleasePermission}
            className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
            Liberar permissão
          </button>
        </>
      )}
    </div>
  );
}

export default PermissionBar;
