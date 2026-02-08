'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import type {
  ExcalidrawElement,
  BinaryFiles,
  WhiteboardSnapshot,
  UseBoardPersistenceOptions,
} from '../types';

const DEFAULT_DEBOUNCE_MS = 2000; // 2 seconds debounce

/**
 * Return type for useBoardPersistence hook
 */
export interface UseBoardPersistenceReturn {
  // State
  isSaving: boolean;
  lastSavedAt: Date | null;
  error: string | null;

  // Auto-save trigger (call this on changes)
  triggerAutoSave: (
    elements: readonly ExcalidrawElement[],
    files: BinaryFiles
  ) => void;

  // Manual save (immediate)
  saveNow: (
    elements: readonly ExcalidrawElement[],
    files: BinaryFiles
  ) => Promise<void>;

  // Snapshot management
  createSnapshot: (
    elements: readonly ExcalidrawElement[],
    label?: string
  ) => Promise<WhiteboardSnapshot | null>;

  loadSnapshots: () => Promise<WhiteboardSnapshot[]>;
  restoreSnapshot: (snapshotId: string) => Promise<ExcalidrawElement[] | null>;
  deleteSnapshot: (snapshotId: string) => Promise<boolean>;

  // Cancel pending saves
  cancelPendingSave: () => void;
}

/**
 * Hook for persisting whiteboard state to the database
 * Includes debounced auto-save and snapshot management
 */
export function useBoardPersistence({
  boardId,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onSaveStart,
  onSaveComplete,
  onSaveError,
}: UseBoardPersistenceOptions): UseBoardPersistenceReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for debounce management
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDataRef = useRef<{
    elements: readonly ExcalidrawElement[];
    files: BinaryFiles;
  } | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Save elements to the API
   */
  const saveToApi = useCallback(
    async (elements: readonly ExcalidrawElement[], _files: BinaryFiles): Promise<void> => {
      if (!boardId) return;

      try {
        setIsSaving(true);
        setError(null);
        onSaveStart?.();

        const response = await fetch(`/api/whiteboard/boards/${boardId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            elementsJson: elements,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to save board');
        }

        if (isMountedRef.current) {
          setLastSavedAt(new Date());
          setError(null);
          onSaveComplete?.();
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Save failed';
        if (isMountedRef.current) {
          setError(errorMessage);
          onSaveError?.(err instanceof Error ? err : new Error(errorMessage));
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setIsSaving(false);
        }
      }
    },
    [boardId, onSaveStart, onSaveComplete, onSaveError]
  );

  /**
   * Trigger auto-save with debounce
   */
  const triggerAutoSave = useCallback(
    (elements: readonly ExcalidrawElement[], files: BinaryFiles) => {
      // Store the latest data
      pendingDataRef.current = { elements, files };

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout
      saveTimeoutRef.current = setTimeout(async () => {
        const data = pendingDataRef.current;
        if (data) {
          pendingDataRef.current = null;
          try {
            await saveToApi(data.elements, data.files);
          } catch {
            // Error already handled in saveToApi
          }
        }
      }, debounceMs);
    },
    [debounceMs, saveToApi]
  );

  /**
   * Save immediately (bypass debounce)
   */
  const saveNow = useCallback(
    async (elements: readonly ExcalidrawElement[], files: BinaryFiles) => {
      // Cancel pending debounced save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      pendingDataRef.current = null;

      await saveToApi(elements, files);
    },
    [saveToApi]
  );

  /**
   * Cancel any pending save
   */
  const cancelPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingDataRef.current = null;
  }, []);

  /**
   * Create a named snapshot
   */
  const createSnapshot = useCallback(
    async (
      elements: readonly ExcalidrawElement[],
      label?: string
    ): Promise<WhiteboardSnapshot | null> => {
      if (!boardId) return null;

      try {
        const response = await fetch(
          `/api/whiteboard/boards/${boardId}/snapshots`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              elementsJson: elements,
              label,
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to create snapshot');
        }

        const data = await response.json();
        return data.data as WhiteboardSnapshot;
      } catch (err) {
        console.error('Create snapshot error:', err);
        return null;
      }
    },
    [boardId]
  );

  /**
   * Load all snapshots for the board
   */
  const loadSnapshots = useCallback(async (): Promise<WhiteboardSnapshot[]> => {
    if (!boardId) return [];

    try {
      const response = await fetch(
        `/api/whiteboard/boards/${boardId}/snapshots`
      );

      if (!response.ok) {
        throw new Error('Failed to load snapshots');
      }

      const data = await response.json();
      return data.data?.snapshots || [];
    } catch (err) {
      console.error('Load snapshots error:', err);
      return [];
    }
  }, [boardId]);

  /**
   * Restore a snapshot (get its elements)
   */
  const restoreSnapshot = useCallback(
    async (snapshotId: string): Promise<ExcalidrawElement[] | null> => {
      if (!boardId) return null;

      try {
        const response = await fetch(
          `/api/whiteboard/boards/${boardId}/snapshots/${snapshotId}`
        );

        if (!response.ok) {
          throw new Error('Failed to load snapshot');
        }

        const data = await response.json();
        return data.data?.elementsJson || null;
      } catch (err) {
        console.error('Restore snapshot error:', err);
        return null;
      }
    },
    [boardId]
  );

  /**
   * Delete a snapshot
   */
  const deleteSnapshot = useCallback(
    async (snapshotId: string): Promise<boolean> => {
      if (!boardId) return false;

      try {
        const response = await fetch(
          `/api/whiteboard/boards/${boardId}/snapshots/${snapshotId}`,
          {
            method: 'DELETE',
          }
        );

        return response.ok;
      } catch (err) {
        console.error('Delete snapshot error:', err);
        return false;
      }
    },
    [boardId]
  );

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      // Save any pending data before unmount
      const data = pendingDataRef.current;
      if (data && boardId) {
        // Use navigator.sendBeacon for reliable unmount save
        const blob = new Blob(
          [JSON.stringify({ elementsJson: data.elements })],
          { type: 'application/json' }
        );
        navigator.sendBeacon(`/api/whiteboard/boards/${boardId}`, blob);
      }
    };
  }, [boardId]);

  return {
    isSaving,
    lastSavedAt,
    error,
    triggerAutoSave,
    saveNow,
    createSnapshot,
    loadSnapshots,
    restoreSnapshot,
    deleteSnapshot,
    cancelPendingSave,
  };
}

export default useBoardPersistence;
