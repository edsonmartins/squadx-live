'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { WhiteboardCanvas } from './WhiteboardCanvas';
import { CursorOverlay } from './CursorOverlay';
import { AgentPresenceOverlay } from './AgentPresenceOverlay';
import { PermissionBar } from './PermissionBar';
import { BoardSidebar } from './BoardSidebar';
import { WhiteboardProvider, useWhiteboard, YjsProvider, useYjs } from '../providers';
import { useWhiteboardSync } from '../hooks/useWhiteboardSync';
import { useBoardPersistence } from '../hooks/useBoardPersistence';
import type {
  WhiteboardPanelProps,
  ExcalidrawElement,
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  WhiteboardBoard,
} from '../types';
import {
  PenTool,
  Plus,
  Loader2,
  AlertCircle,
  Check,
  Folder,
  Wifi,
  WifiOff,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

interface WhiteboardContentProps {
  sessionId: string;
  boardId?: string | undefined;
  isHost?: boolean | undefined;
  participantId: string;
  participantName: string;
  participantColor: string;
  onBoardChange?: ((boardId: string) => void) | undefined;
}

function WhiteboardContentWithSync({
  sessionId,
  boardId,
  isHost = false,
  participantId,
  participantName,
  participantColor,
  onBoardChange,
}: WhiteboardContentProps) {
  const {
    board,
    elements,
    isLoading,
    isSaving,
    error,
    loadBoard,
    createBoard,
    updateElements,
    updateAppState,
    updateFiles,
    setExcalidrawAPI,
  } = useWhiteboard();

  const { doc, awareness, syncStatus: _syncStatus, isConnected } = useYjs();

  const [boards, setBoards] = useState<WhiteboardBoard[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [excalidrawAPI, setLocalExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  // Board persistence with debounced auto-save
  const {
    isSaving: isPersisting,
    lastSavedAt,
    triggerAutoSave,
  } = useBoardPersistence({
    boardId: boardId || '',
    debounceMs: 3000, // Auto-save after 3 seconds of inactivity
  });

  // Whiteboard sync hook with permissions
  const {
    isSynced: _isSynced,
    permission,
    canDraw,
    collaborators,
    requestPermission,
    releasePermission,
    grantPermission,
    revokePermission,
    syncToRemote,
  } = useWhiteboardSync({
    doc,
    awareness,
    excalidrawAPI,
    isHost,
    participantId,
    participantName,
    participantColor,
  });

  // Detect system theme
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setTheme(mediaQuery.matches ? 'dark' : 'light');

    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Load board list for session
  useEffect(() => {
    async function fetchBoards() {
      try {
        const response = await fetch(`/api/whiteboard/boards?sessionId=${sessionId}`, {
          credentials: 'include',
        });
        if (response.ok) {
          const result = await response.json() as { data?: { boards?: WhiteboardBoard[] } };
          setBoards(result.data?.boards || []);
        }
      } catch (err) {
        console.error('Failed to fetch boards:', err);
      }
    }

    fetchBoards();
  }, [sessionId]);

  // Load specific board if boardId provided
  useEffect(() => {
    if (boardId) {
      loadBoard(boardId);
    }
  }, [boardId, loadBoard]);

  // Handle canvas changes - sync to Yjs if allowed
  const handleChange = useCallback(
    (
      newElements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      // Always update local state
      updateElements(newElements);
      updateAppState(appState);
      updateFiles(files);

      // Sync to remote if we have permission
      if (canDraw) {
        syncToRemote(newElements, appState, files);
        // Trigger debounced auto-save to database
        triggerAutoSave(newElements, files);
      }
    },
    [updateElements, updateAppState, updateFiles, canDraw, syncToRemote, triggerAutoSave]
  );

  // Handle restoring a snapshot
  const handleRestoreSnapshot = useCallback(
    (snapshotElements: unknown[]) => {
      if (!excalidrawAPI) return;
      excalidrawAPI.updateScene({
        elements: snapshotElements as readonly ExcalidrawElement[],
      });
    },
    [excalidrawAPI]
  );

  // Handle cursor/pointer updates for awareness
  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number };
      button: 'down' | 'up';
      pointersMap: Map<number, { x: number; y: number }>;
    }) => {
      if (!awareness) return;

      const currentState = awareness.getLocalState();
      const currentUser = currentState?.user || {};

      awareness.setLocalStateField('user', {
        ...currentUser,
        cursor: {
          x: payload.pointer.x,
          y: payload.pointer.y,
        },
      });
    },
    [awareness]
  );

  const handleAPIReady = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      setExcalidrawAPI(api);
      setLocalExcalidrawAPI(api);
    },
    [setExcalidrawAPI]
  );

  const handleCreateBoard = async () => {
    try {
      const newBoard = await createBoard(sessionId);
      setBoards((prev) => [...prev, newBoard]);
      onBoardChange?.(newBoard.id);
    } catch (err) {
      console.error('Failed to create board:', err);
    }
  };

  const handleSelectBoard = (selectedBoardId: string) => {
    onBoardChange?.(selectedBoardId);
  };

  // Show board selection if no board is loaded
  if (!board && !isLoading && !boardId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-gray-50 dark:bg-gray-900 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <PenTool className="h-12 w-12 text-indigo-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            SquadX Whiteboard
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
            Colabore visualmente com sua equipe. Desenhe diagramas, esboce ideias e faça brainstorm juntos em tempo real.
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          {isHost && (
            <button
              onClick={handleCreateBoard}
              className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Criar Novo Quadro
            </button>
          )}

          {boards.length > 0 && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-gray-50 dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">
                    Ou selecione existente
                  </span>
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {boards.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleSelectBoard(b.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Folder className="h-4 w-4 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white truncate">
                        {b.title}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Atualizado {new Date(b.updatedAt).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {!isHost && boards.length === 0 && (
            <div className="text-center text-sm text-gray-500 dark:text-gray-400">
              Aguardando o host criar um quadro branco...
            </div>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Carregando whiteboard...
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <span className="text-sm text-gray-900 dark:text-white font-medium">
            Falha ao carregar whiteboard
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {error}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full flex">
      {/* Sidebar */}
      {showSidebar && (
        <BoardSidebar
          sessionId={sessionId}
          currentBoardId={boardId}
          isHost={isHost}
          onSelectBoard={handleSelectBoard}
          onCreateBoard={isHost ? handleCreateBoard : undefined}
          onRestoreSnapshot={handleRestoreSnapshot}
          className="w-64 flex-shrink-0"
        />
      )}

      {/* Main canvas area */}
      <div className="relative flex-1 h-full">
        {/* Top status bar */}
        <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between gap-2">
          {/* Left: Sidebar toggle + Board info + connection status */}
          <div className="flex items-center gap-2">
            {/* Sidebar toggle */}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur shadow-sm border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              title={showSidebar ? 'Ocultar painel' : 'Mostrar painel'}
            >
              {showSidebar ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </button>

            {board && (
              <div className="flex items-center gap-2 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur px-3 py-1.5 text-xs shadow-sm border border-gray-200 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400">{board.title}</span>
                {isSaving || isPersisting ? (
                  <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                ) : (
                  <span title={lastSavedAt ? `Salvo às ${lastSavedAt.toLocaleTimeString('pt-BR')}` : 'Salvo'}>
                    <Check className="h-3 w-3 text-green-500" />
                  </span>
                )}
              </div>
            )}

          {/* Connection status */}
          <div
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium backdrop-blur ${
              isConnected
                ? 'bg-green-100/90 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100/90 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3" />
                <span>Sincronizado</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Desconectado</span>
              </>
            )}
          </div>
        </div>

          {/* Right: Collaborators count */}
          {collaborators.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur px-2 py-1 text-xs shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex -space-x-1">
                {collaborators.slice(0, 3).map((c) => (
                  <div
                    key={c.clientId}
                    className="h-5 w-5 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-[10px] font-medium text-white"
                    style={{ backgroundColor: c.odColor }}
                    title={c.odName}
                  >
                    {c.odName.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              {collaborators.length > 3 && (
                <span className="text-gray-500 dark:text-gray-400 ml-1">
                  +{collaborators.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Bottom permission bar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <PermissionBar
            isHost={isHost}
            permission={permission}
            canDraw={canDraw}
            collaborators={collaborators}
            onRequestPermission={requestPermission}
            onReleasePermission={releasePermission}
            onGrantPermission={grantPermission}
            onRevokePermission={revokePermission}
          />
        </div>

        {/* Cursor overlay for remote cursors (humans) */}
        <CursorOverlay collaborators={collaborators.filter(c => !c.isAgent)} />

        {/* Agent presence overlay (AI agents with enhanced visuals) */}
        <AgentPresenceOverlay collaborators={collaborators} />

        {/* Canvas */}
        <WhiteboardCanvas
          initialElements={elements}
          onChange={handleChange}
          onPointerUpdate={handlePointerUpdate}
          onAPIReady={handleAPIReady}
          viewModeEnabled={!canDraw}
          theme={theme}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}

function WhiteboardContentWrapper(props: WhiteboardContentProps) {
  // Only render sync content if we have a boardId (connected to a board)
  return <WhiteboardContentWithSync {...props} />;
}

export function WhiteboardPanel({
  sessionId,
  boardId,
  participantId,
  participantName,
  participantColor = '#6366f1',
  isHost = false,
  className = '',
  onBoardChange,
}: WhiteboardPanelProps) {
  // Generate room ID from session + board
  const roomId = boardId ? `${sessionId}-${boardId}` : sessionId;

  return (
    <div className={`h-full w-full ${className}`}>
      <WhiteboardProvider
        sessionId={sessionId}
        participantId={participantId}
        participantName={participantName}
        participantColor={participantColor}
      >
        <YjsProvider
          roomId={roomId}
          user={{
            odId: participantId,
            odName: participantName,
            odColor: participantColor,
          }}
        >
          <WhiteboardContentWrapper
            sessionId={sessionId}
            boardId={boardId}
            isHost={isHost}
            participantId={participantId}
            participantName={participantName}
            participantColor={participantColor}
            onBoardChange={onBoardChange}
          />
        </YjsProvider>
      </WhiteboardProvider>
    </div>
  );
}

export default WhiteboardPanel;
