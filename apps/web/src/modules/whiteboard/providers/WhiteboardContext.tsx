'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type {
  WhiteboardContextValue,
  WhiteboardState,
  WhiteboardBoard,
  WhiteboardSnapshot,
  ExcalidrawElement,
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '../types';

const initialState: WhiteboardState = {
  board: null,
  isLoading: false,
  isSaving: false,
  error: null,
  elements: [],
  appState: {},
  files: {},
  collaborators: new Map(),
  isConnected: false,
  syncStatus: 'disconnected',
};

const WhiteboardContext = createContext<WhiteboardContextValue | null>(null);

export interface WhiteboardProviderProps {
  children: ReactNode;
  sessionId: string;
  participantId: string;
  participantName: string;
  participantColor?: string;
}

export function WhiteboardProvider({
  children,
  sessionId: _sessionId,
  participantId,
  participantName: _participantName,
  participantColor: _participantColor = '#6366f1',
}: WhiteboardProviderProps) {
  // Note: sessionId, participantName, and participantColor are reserved for
  // future use with Yjs collaboration (Week 2)
  const [state, setState] = useState<WhiteboardState>(initialState);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  const setExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI | null) => {
    excalidrawApiRef.current = api;
  }, []);

  const loadBoard = useCallback(async (boardId: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`/api/whiteboard/boards/${boardId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load board');
      }
      const result = await response.json() as { data?: WhiteboardBoard };
      const board = result.data;

      if (!board) {
        throw new Error('Board not found');
      }

      setState((prev) => ({
        ...prev,
        board,
        elements: board.elementsJson || [],
        isLoading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load board',
      }));
    }
  }, []);

  const createBoard = useCallback(
    async (sessionId: string, title?: string): Promise<WhiteboardBoard> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await fetch('/api/whiteboard/boards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            sessionId,
            title: title || 'Untitled Board',
            createdBy: participantId,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create board');
        }

        const result = await response.json() as { data?: WhiteboardBoard };
        const board = result.data;

        if (!board) {
          throw new Error('Failed to create board - no data returned');
        }

        setState((prev) => ({
          ...prev,
          board,
          elements: [],
          isLoading: false,
        }));

        return board;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to create board',
        }));
        throw error;
      }
    },
    [participantId]
  );

  const saveBoard = useCallback(async () => {
    if (!state.board) return;

    setState((prev) => ({ ...prev, isSaving: true }));

    try {
      const response = await fetch(`/api/whiteboard/boards/${state.board.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elementsJson: state.elements,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save board');
      }

      setState((prev) => ({ ...prev, isSaving: false }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isSaving: false,
        error: error instanceof Error ? error.message : 'Failed to save board',
      }));
    }
  }, [state.board, state.elements]);

  const updateElements = useCallback((elements: readonly ExcalidrawElement[]) => {
    setState((prev) => ({ ...prev, elements }));
  }, []);

  const updateAppState = useCallback((appState: Partial<AppState>) => {
    setState((prev) => ({
      ...prev,
      appState: { ...prev.appState, ...appState },
    }));
  }, []);

  const updateFiles = useCallback((files: BinaryFiles) => {
    setState((prev) => ({ ...prev, files }));
  }, []);

  const createSnapshot = useCallback(
    async (label?: string): Promise<WhiteboardSnapshot> => {
      if (!state.board) {
        throw new Error('No board loaded');
      }

      const response = await fetch(`/api/whiteboard/boards/${state.board.id}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elementsJson: state.elements,
          label,
          createdBy: participantId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create snapshot');
      }

      return response.json();
    },
    [state.board, state.elements, participantId]
  );

  const restoreSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!state.board) {
        throw new Error('No board loaded');
      }

      const response = await fetch(
        `/api/whiteboard/boards/${state.board.id}/snapshots/${snapshotId}`
      );

      if (!response.ok) {
        throw new Error('Failed to load snapshot');
      }

      const snapshot: WhiteboardSnapshot = await response.json();

      setState((prev) => ({
        ...prev,
        elements: snapshot.elementsJson,
      }));

      // Update Excalidraw canvas
      if (excalidrawApiRef.current) {
        excalidrawApiRef.current.updateScene({
          elements: snapshot.elementsJson,
        });
      }
    },
    [state.board]
  );

  // Note: Additional functions for Yjs collaboration will be added in Week 2
  // (setSyncStatus, setIsConnected, setCollaborators)

  const value: WhiteboardContextValue = {
    ...state,
    loadBoard,
    createBoard,
    saveBoard,
    updateElements,
    updateAppState,
    updateFiles,
    createSnapshot,
    restoreSnapshot,
    setExcalidrawAPI,
  };

  return (
    <WhiteboardContext.Provider value={value}>
      {children}
    </WhiteboardContext.Provider>
  );
}

export function useWhiteboard(): WhiteboardContextValue {
  const context = useContext(WhiteboardContext);
  if (!context) {
    throw new Error('useWhiteboard must be used within a WhiteboardProvider');
  }
  return context;
}

export { WhiteboardContext };
