'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Camera,
  History,
  Trash2,
  RotateCcw,
  X,
  Plus,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { WhiteboardSnapshot, ExcalidrawElement } from '../types';

interface SnapshotManagerProps {
  boardId: string;
  onCreateSnapshot: (label?: string) => Promise<WhiteboardSnapshot | null>;
  onLoadSnapshots: () => Promise<WhiteboardSnapshot[]>;
  onRestoreSnapshot: (snapshotId: string) => Promise<ExcalidrawElement[] | null>;
  onDeleteSnapshot: (snapshotId: string) => Promise<boolean>;
  onRestore: (elements: ExcalidrawElement[]) => void;
  className?: string;
}

/**
 * Snapshot management panel for whiteboard versioning
 */
export function SnapshotManager({
  boardId,
  onCreateSnapshot,
  onLoadSnapshots,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onRestore,
  className = '',
}: SnapshotManagerProps) {
  const [snapshots, setSnapshots] = useState<WhiteboardSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load snapshots on mount
  useEffect(() => {
    if (boardId) {
      loadSnapshots();
    }
  }, [boardId]);

  const loadSnapshots = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await onLoadSnapshots();
      setSnapshots(loaded.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (err) {
      setError('Falha ao carregar snapshots');
      console.error('Load snapshots error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [onLoadSnapshots]);

  const handleCreateSnapshot = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const snapshot = await onCreateSnapshot(snapshotLabel || undefined);
      if (snapshot) {
        setSnapshots((prev) => [snapshot, ...prev]);
        setShowCreateDialog(false);
        setSnapshotLabel('');
      } else {
        setError('Falha ao criar snapshot');
      }
    } catch (err) {
      setError('Falha ao criar snapshot');
      console.error('Create snapshot error:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    setRestoringId(snapshotId);
    setError(null);
    try {
      const elements = await onRestoreSnapshot(snapshotId);
      if (elements) {
        onRestore(elements);
      } else {
        setError('Falha ao restaurar snapshot');
      }
    } catch (err) {
      setError('Falha ao restaurar snapshot');
      console.error('Restore snapshot error:', err);
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    setDeletingId(snapshotId);
    setError(null);
    try {
      const success = await onDeleteSnapshot(snapshotId);
      if (success) {
        setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
        setConfirmDelete(null);
      } else {
        setError('Falha ao excluir snapshot');
      }
    } catch (err) {
      setError('Falha ao excluir snapshot');
      console.error('Delete snapshot error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}min atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days < 7) return `${days}d atrás`;

    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 ${className}`}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-indigo-500" />
          <span className="font-medium text-gray-900 dark:text-gray-100">
            Snapshots
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({snapshots.length})
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mb-3 p-2 bg-red-50 dark:bg-red-900/20 rounded">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto p-0.5 hover:bg-red-100 dark:hover:bg-red-900/40 rounded"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Create snapshot button */}
          {!showCreateDialog ? (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 mb-3 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-md transition-colors"
            >
              <Camera className="h-4 w-4" />
              <span>Criar Snapshot</span>
            </button>
          ) : (
            <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
              <input
                type="text"
                value={snapshotLabel}
                onChange={(e) => setSnapshotLabel(e.target.value)}
                placeholder="Nome do snapshot (opcional)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSnapshot();
                  if (e.key === 'Escape') {
                    setShowCreateDialog(false);
                    setSnapshotLabel('');
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateSnapshot}
                  disabled={isCreating}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-400 rounded-md transition-colors"
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span>{isCreating ? 'Salvando...' : 'Salvar'}</span>
                </button>
                <button
                  onClick={() => {
                    setShowCreateDialog(false);
                    setSnapshotLabel('');
                  }}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Snapshot list */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
              </div>
            ) : snapshots.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum snapshot salvo</p>
                <p className="text-xs mt-1">
                  Crie snapshots para salvar versões do seu board
                </p>
              </div>
            ) : (
              snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="group relative flex items-start gap-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  {/* Thumbnail or placeholder */}
                  {snapshot.thumbnailUrl ? (
                    <img
                      src={snapshot.thumbnailUrl}
                      alt={snapshot.label || 'Snapshot'}
                      className="w-12 h-12 rounded border border-gray-200 dark:border-gray-600 object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <Camera className="h-5 w-5 text-gray-400" />
                    </div>
                  )}

                  {/* Snapshot info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {snapshot.label || 'Snapshot sem nome'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(snapshot.createdAt)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {confirmDelete === snapshot.id ? (
                      <>
                        <button
                          onClick={() => handleDeleteSnapshot(snapshot.id)}
                          disabled={deletingId === snapshot.id}
                          className="p-1.5 text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
                          title="Confirmar exclusão"
                        >
                          {deletingId === snapshot.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                          title="Cancelar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleRestoreSnapshot(snapshot.id)}
                          disabled={restoringId === snapshot.id}
                          className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-md transition-colors"
                          title="Restaurar snapshot"
                        >
                          {restoringId === snapshot.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(snapshot.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                          title="Excluir snapshot"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Reload button */}
          {!isLoading && snapshots.length > 0 && (
            <button
              onClick={loadSnapshots}
              className="w-full mt-2 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
            >
              Atualizar lista
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default SnapshotManager;
