'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';
import type { SyncStatus, WhiteboardPresence } from '../types';

export interface YjsContextValue {
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  awareness: Awareness | null;
  syncStatus: SyncStatus;
  isConnected: boolean;
  collaborators: Map<number, WhiteboardPresence>;
  updateLocalPresence: (presence: Partial<WhiteboardPresence>) => void;
}

const YjsContext = createContext<YjsContextValue | null>(null);

export interface YjsProviderProps {
  children: ReactNode;
  roomId: string;
  websocketUrl?: string;
  user: {
    odId: string;
    odName: string;
    odColor: string;
    isAgent?: boolean;
    agentId?: string;
  };
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSynced?: () => void;
  onError?: (error: Error) => void;
}

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_YJS_WEBSOCKET_URL || 'wss://demos.yjs.dev';

export function YjsProvider({
  children,
  roomId,
  websocketUrl = DEFAULT_WS_URL,
  user,
  onConnect,
  onDisconnect,
  onSynced,
  onError,
}: YjsProviderProps) {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [awareness, setAwareness] = useState<Awareness | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const [collaborators, setCollaborators] = useState<Map<number, WhiteboardPresence>>(new Map());

  const providerRef = useRef<WebsocketProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);

  // Initialize Yjs document and WebSocket provider
  useEffect(() => {
    // Create Yjs document
    const yDoc = new Y.Doc();
    docRef.current = yDoc;
    setDoc(yDoc);

    // Create WebSocket provider
    // Room name includes session/board ID for isolation
    const wsProvider = new WebsocketProvider(
      websocketUrl,
      `squadx-whiteboard-${roomId}`,
      yDoc,
      {
        connect: true,
        // Reconnect automatically
        maxBackoffTime: 2500,
      }
    );
    providerRef.current = wsProvider;
    setProvider(wsProvider);
    setAwareness(wsProvider.awareness);

    // Set initial local state for awareness
    wsProvider.awareness.setLocalStateField('user', {
      odId: user.odId,
      odName: user.odName,
      odColor: user.odColor,
      isAgent: user.isAgent || false,
      agentId: user.agentId,
      cursor: null,
      selectedElementIds: [],
    });

    // Connection status handlers
    const handleStatus = ({ status }: { status: string }) => {
      if (status === 'connected') {
        setSyncStatus('connected');
        setIsConnected(true);
        onConnect?.();
      } else if (status === 'disconnected') {
        setSyncStatus('disconnected');
        setIsConnected(false);
        onDisconnect?.();
      }
    };

    const handleSync = (isSynced: boolean) => {
      if (isSynced) {
        setSyncStatus('synced');
        onSynced?.();
      }
    };

    const handleConnectionError = (event: Event) => {
      setSyncStatus('error');
      onError?.(new Error('WebSocket connection error'));
      console.error('Yjs WebSocket error:', event);
    };

    // Awareness change handler
    const handleAwarenessChange = () => {
      const states = wsProvider.awareness.getStates();
      const newCollaborators = new Map<number, WhiteboardPresence>();

      states.forEach((state, clientId) => {
        if (state.user && clientId !== wsProvider.awareness.clientID) {
          newCollaborators.set(clientId, state.user as WhiteboardPresence);
        }
      });

      setCollaborators(newCollaborators);
    };

    // Subscribe to events
    wsProvider.on('status', handleStatus);
    wsProvider.on('sync', handleSync);
    wsProvider.on('connection-error', handleConnectionError);
    wsProvider.awareness.on('change', handleAwarenessChange);

    // Initial status check
    if (wsProvider.wsconnected) {
      setSyncStatus('connected');
      setIsConnected(true);
    } else {
      setSyncStatus('connecting');
    }

    // Cleanup
    return () => {
      wsProvider.off('status', handleStatus);
      wsProvider.off('sync', handleSync);
      wsProvider.off('connection-error', handleConnectionError);
      wsProvider.awareness.off('change', handleAwarenessChange);

      // Destroy provider and document
      wsProvider.destroy();
      yDoc.destroy();

      providerRef.current = null;
      docRef.current = null;
    };
  }, [roomId, websocketUrl, user.odId, user.odName, user.odColor, user.isAgent, user.agentId, onConnect, onDisconnect, onSynced, onError]);

  // Update local presence (cursor, selection, etc.)
  const updateLocalPresence = useCallback(
    (presence: Partial<WhiteboardPresence>) => {
      if (!providerRef.current?.awareness) return;

      const currentState = providerRef.current.awareness.getLocalState();
      const currentUser = currentState?.user || {};

      providerRef.current.awareness.setLocalStateField('user', {
        ...currentUser,
        ...presence,
      });
    },
    []
  );

  const value: YjsContextValue = {
    doc,
    provider,
    awareness,
    syncStatus,
    isConnected,
    collaborators,
    updateLocalPresence,
  };

  return <YjsContext.Provider value={value}>{children}</YjsContext.Provider>;
}

export function useYjs(): YjsContextValue {
  const context = useContext(YjsContext);
  if (!context) {
    throw new Error('useYjs must be used within a YjsProvider');
  }
  return context;
}

export { YjsContext };
