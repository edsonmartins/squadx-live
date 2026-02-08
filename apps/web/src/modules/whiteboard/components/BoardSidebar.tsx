'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  Plus,
  Clock,
  ChevronRight,
  ChevronDown,
  Archive,
  Camera,
  RotateCcw,
  Trash2,
  Edit3,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import type { WhiteboardBoard, WhiteboardSnapshot } from '../types';

interface BoardSidebarProps {
  sessionId: string;
  currentBoardId?: string | undefined;
  isHost: boolean;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard?: (() => void) | (() => Promise<void>) | undefined;
  onRestoreSnapshot?: ((elements: unknown[]) => void) | undefined;
  className?: string | undefined;
}

/**
 * Sidebar component for managing whiteboard boards and snapshots
 */
export function BoardSidebar({
  sessionId,
  currentBoardId,
  isHost,
  onSelectBoard,
  onCreateBoard,
  onRestoreSnapshot,
  className = '',
}: BoardSidebarProps) {
  const [boards, setBoards] = useState<WhiteboardBoard[]>([]);
  const [snapshots, setSnapshots] = useState<WhiteboardSnapshot[]>([]);
  const [isLoadingBoards, setIsLoadingBoards] = useState(true);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [expandedSections, setExpandedSections] = useState<{
    boards: boolean;
    snapshots: boolean;
  }>({
    boards: true,
    snapshots: true,
  });

  // Board editing state
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Snapshot creation state
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');

  // Load boards for session
  const loadBoards = useCallback(async () => {
    try {
      setIsLoadingBoards(true);
      const response = await fetch(`/api/whiteboard/boards?sessionId=${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setBoards(data.data?.boards || []);
      }
    } catch (err) {
      console.error('Failed to load boards:', err);
    } finally {
      setIsLoadingBoards(false);
    }
  }, [sessionId]);

  // Load snapshots for current board
  const loadSnapshots = useCallback(async () => {
    if (!currentBoardId) {
      setSnapshots([]);
      return;
    }

    try {
      setIsLoadingSnapshots(true);
      const response = await fetch(
        `/api/whiteboard/boards/${currentBoardId}/snapshots`
      );
      if (response.ok) {
        const data = await response.json();
        setSnapshots(data.data?.snapshots || []);
      }
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, [currentBoardId]);

  // Initial load
  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  // Toggle section expansion
  const toggleSection = (section: 'boards' | 'snapshots') => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Rename board
  const handleRenameBoard = async (boardId: string) => {
    if (!editingTitle.trim()) {
      setEditingBoardId(null);
      return;
    }

    try {
      const response = await fetch(`/api/whiteboard/boards/${boardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingTitle }),
      });

      if (response.ok) {
        setBoards((prev) =>
          prev.map((b) =>
            b.id === boardId ? { ...b, title: editingTitle } : b
          )
        );
      }
    } catch (err) {
      console.error('Failed to rename board:', err);
    } finally {
      setEditingBoardId(null);
      setEditingTitle('');
    }
  };

  // Archive board
  const handleArchiveBoard = async (boardId: string) => {
    if (!confirm('Arquivar este quadro?')) return;

    try {
      const response = await fetch(`/api/whiteboard/boards/${boardId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setBoards((prev) => prev.filter((b) => b.id !== boardId));
        if (currentBoardId === boardId && boards.length > 1) {
          const nextBoard = boards.find((b) => b.id !== boardId);
          if (nextBoard) {
            onSelectBoard(nextBoard.id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to archive board:', err);
    }
  };

  // Create snapshot
  const handleCreateSnapshot = async () => {
    if (!currentBoardId) return;

    try {
      setIsCreatingSnapshot(true);
      const response = await fetch(
        `/api/whiteboard/boards/${currentBoardId}/snapshots`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: snapshotLabel || undefined,
          }),
        }
      );

      if (response.ok) {
        await loadSnapshots();
        setSnapshotLabel('');
      }
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  // Restore snapshot
  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!currentBoardId || !onRestoreSnapshot) return;

    try {
      const response = await fetch(
        `/api/whiteboard/boards/${currentBoardId}/snapshots/${snapshotId}`
      );

      if (response.ok) {
        const data = await response.json();
        const elements = data.data?.elementsJson;
        if (elements) {
          onRestoreSnapshot(elements);
        }
      }
    } catch (err) {
      console.error('Failed to restore snapshot:', err);
    }
  };

  // Delete snapshot
  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!currentBoardId) return;
    if (!confirm('Excluir este snapshot?')) return;

    try {
      const response = await fetch(
        `/api/whiteboard/boards/${currentBoardId}/snapshots/${snapshotId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
      }
    } catch (err) {
      console.error('Failed to delete snapshot:', err);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className={`flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Whiteboard
        </h2>
        {isHost && onCreateBoard && (
          <button
            onClick={onCreateBoard}
            className="flex items-center justify-center h-7 w-7 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Criar novo quadro"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Boards Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => toggleSection('boards')}
            className="flex items-center justify-between w-full px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              <span>Quadros</span>
              <span className="text-xs text-gray-400">({boards.length})</span>
            </div>
            {expandedSections.boards ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          {expandedSections.boards && (
            <div className="pb-2">
              {isLoadingBoards ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              ) : boards.length === 0 ? (
                <div className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
                  Nenhum quadro criado
                </div>
              ) : (
                <div className="space-y-0.5 px-2">
                  {boards.map((board) => (
                    <div
                      key={board.id}
                      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                        board.id === currentBoardId
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {editingBoardId === board.id ? (
                        // Edit mode
                        <div className="flex items-center gap-1 flex-1">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRenameBoard(board.id);
                              } else if (e.key === 'Escape') {
                                setEditingBoardId(null);
                              }
                            }}
                            className="flex-1 px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRenameBoard(board.id)}
                            className="p-0.5 text-green-600 hover:text-green-700"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setEditingBoardId(null)}
                            className="p-0.5 text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        // View mode
                        <>
                          <div
                            className="flex-1 min-w-0"
                            onClick={() => onSelectBoard(board.id)}
                          >
                            <div className="text-xs font-medium truncate">
                              {board.title}
                            </div>
                            <div className="text-[10px] text-gray-400 dark:text-gray-500">
                              {formatDate(board.updatedAt)}
                            </div>
                          </div>
                          {isHost && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingBoardId(board.id);
                                  setEditingTitle(board.title);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                title="Renomear"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleArchiveBoard(board.id);
                                }}
                                className="p-1 text-gray-400 hover:text-red-500"
                                title="Arquivar"
                              >
                                <Archive className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Snapshots Section */}
        {currentBoardId && (
          <div>
            <button
              onClick={() => toggleSection('snapshots')}
              className="flex items-center justify-between w-full px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Snapshots</span>
                <span className="text-xs text-gray-400">({snapshots.length})</span>
              </div>
              {expandedSections.snapshots ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {expandedSections.snapshots && (
              <div className="pb-2">
                {/* Create snapshot button */}
                {isHost && (
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={snapshotLabel}
                        onChange={(e) => setSnapshotLabel(e.target.value)}
                        placeholder="Nome do snapshot"
                        className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        onClick={handleCreateSnapshot}
                        disabled={isCreatingSnapshot}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {isCreatingSnapshot ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Camera className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {isLoadingSnapshots ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                ) : snapshots.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
                    Nenhum snapshot salvo
                  </div>
                ) : (
                  <div className="space-y-0.5 px-2">
                    {snapshots.map((snapshot) => (
                      <div
                        key={snapshot.id}
                        className="group flex items-center gap-2 px-2 py-1.5 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">
                            {snapshot.label || 'Sem nome'}
                          </div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500">
                            {formatDate(snapshot.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {onRestoreSnapshot && (
                            <button
                              onClick={() => handleRestoreSnapshot(snapshot.id)}
                              className="p-1 text-gray-400 hover:text-indigo-500"
                              title="Restaurar"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          )}
                          {isHost && (
                            <button
                              onClick={() => handleDeleteSnapshot(snapshot.id)}
                              className="p-1 text-gray-400 hover:text-red-500"
                              title="Excluir"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default BoardSidebar;
