'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import {
  YjsExcalidrawBinding,
  createYjsExcalidrawBinding,
} from '../lib/yjs-excalidraw-binding';
import type {
  ExcalidrawElement,
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  WhiteboardPresence,
  Collaborator,
} from '../types';

/**
 * Permission state for whiteboard interaction
 */
export type DrawPermission = 'none' | 'requested' | 'granted';

/**
 * Collaborator with permission info
 */
export interface CollaboratorWithPermission extends WhiteboardPresence {
  clientId: number;
  permission: DrawPermission;
  agentStatus?: 'idle' | 'thinking' | 'drawing' | 'selecting' | 'requesting_permission' | undefined;
  currentAction?: string | undefined;
  permissionReason?: string | undefined;
}

/**
 * Hook options
 */
export interface UseWhiteboardSyncOptions {
  doc: Y.Doc | null;
  awareness: Awareness | null;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  isHost: boolean;
  participantId: string;
  participantName: string;
  participantColor: string;
  onPermissionChange?: (permission: DrawPermission) => void;
}

/**
 * Hook return value
 */
export interface UseWhiteboardSyncReturn {
  // Sync state
  isSynced: boolean;

  // Permission state
  permission: DrawPermission;
  canDraw: boolean;

  // Collaborators
  collaborators: CollaboratorWithPermission[];
  excalidrawCollaborators: Map<string, Collaborator>;

  // Actions for viewers
  requestPermission: () => void;
  releasePermission: () => void;

  // Actions for host
  grantPermission: (clientId: number) => void;
  revokePermission: (clientId: number) => void;

  // Sync functions
  syncToRemote: (
    elements: readonly ExcalidrawElement[],
    appState: Partial<AppState>,
    files: BinaryFiles
  ) => void;
}

/**
 * Hook to manage whiteboard synchronization with Yjs
 * Includes permission system for controlled collaboration
 */
export function useWhiteboardSync({
  doc,
  awareness,
  excalidrawAPI,
  isHost,
  participantId,
  participantName,
  participantColor,
  onPermissionChange,
}: UseWhiteboardSyncOptions): UseWhiteboardSyncReturn {
  const [isSynced, setIsSynced] = useState(false);
  const [permission, setPermission] = useState<DrawPermission>(
    isHost ? 'granted' : 'none'
  );
  const [collaborators, setCollaborators] = useState<CollaboratorWithPermission[]>([]);
  const [excalidrawCollaborators, setExcalidrawCollaborators] = useState<
    Map<string, Collaborator>
  >(new Map());

  const bindingRef = useRef<YjsExcalidrawBinding | null>(null);
  const isInitializedRef = useRef(false);
  const permissionRef = useRef<DrawPermission>(isHost ? 'granted' : 'none');
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const isProcessingRef = useRef(false); // Guard against cascading updates
  const hasSetInitialPermission = useRef(false); // Track if we've set initial permission
  const lastCollaboratorsJson = useRef<string>(''); // Track last collaborators state

  // Host always has permission
  const canDraw = isHost || permission === 'granted';

  // Keep permissionRef in sync with state (for use in event handlers)
  useEffect(() => {
    permissionRef.current = permission;
  }, [permission]);

  // Keep excalidrawAPIRef in sync (avoids having excalidrawAPI in effect dependencies)
  useEffect(() => {
    excalidrawAPIRef.current = excalidrawAPI;
  }, [excalidrawAPI]);

  // Initialize Yjs binding - only depends on doc, not excalidrawAPI
  useEffect(() => {
    if (!doc) return;

    const binding = createYjsExcalidrawBinding(doc);
    bindingRef.current = binding;

    // Handle remote changes from Yjs
    // Use ref to avoid stale closure and dependency issues
    binding.setOnRemoteChange((elements, _appState, _files) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;

      // Only apply remote updates, not echo of our own changes
      // The binding already filters local transactions, but add extra safety
      api.updateScene({
        elements,
      });

      setIsSynced(true);
    });

    return () => {
      binding.destroy();
      bindingRef.current = null;
    };
  }, [doc]); // Remove excalidrawAPI from dependencies - use ref instead

  // Initialize Yjs with current Excalidraw state when API becomes available
  useEffect(() => {
    if (!excalidrawAPI || !bindingRef.current || isInitializedRef.current) return;

    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();

    bindingRef.current.initialize(elements, appState, files);
    isInitializedRef.current = true;
  }, [excalidrawAPI]);

  // Handle awareness changes (collaborators + permissions) - CONSOLIDATED
  // This single effect handles all awareness events to avoid cascading updates
  useEffect(() => {
    if (!awareness) return;

    const handleAwarenessChange = () => {
      // Guard against cascading updates
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        const states = awareness.getStates();
        const myClientId = awareness.clientID;
        const newCollaborators: CollaboratorWithPermission[] = [];
        const newExcalidrawCollaborators = new Map<string, Collaborator>();

        states.forEach((state, clientId) => {
          const user = state.user as WhiteboardPresence | undefined;
          if (!user) return;

          // Build collaborator with permission info
          const collaborator: CollaboratorWithPermission = {
            ...user,
            clientId,
            permission: (state.permission as DrawPermission) || 'none',
            agentStatus: (state.status as CollaboratorWithPermission['agentStatus']) || undefined,
            currentAction: (state.currentAction as string) || undefined,
            permissionReason: (state.permissionReason as string) || undefined,
          };

          // Update local permission if this is us
          if (clientId === myClientId && state.permission) {
            const newPermission = state.permission as DrawPermission;
            if (newPermission !== permissionRef.current) {
              setPermission(newPermission);
            }
          }

          // For non-hosts: check host's permission grants
          if (!isHost) {
            const grants = state.permissionGrants as Record<number, boolean> | undefined;
            if (grants && typeof grants[myClientId] !== 'undefined') {
              const granted = grants[myClientId];
              const newPermission = granted ? 'granted' : 'none';
              if (newPermission !== permissionRef.current) {
                awareness.setLocalStateField('permission', newPermission);
                setPermission(newPermission);
              }
            }
          }

          // Only include others in collaborators list
          if (clientId !== myClientId) {
            newCollaborators.push(collaborator);

            // Build Excalidraw collaborator format for cursor display
            if (user.cursor) {
              newExcalidrawCollaborators.set(user.odId, {
                pointer: {
                  x: user.cursor.x,
                  y: user.cursor.y,
                  tool: 'pointer',
                },
                username: user.odName,
                color: {
                  background: user.odColor,
                  stroke: user.odColor,
                },
                id: user.odId,
                isCurrentUser: false,
              });
            }
          }
        });

        // Only update collaborators if data has actually changed
        const collaboratorsJson = JSON.stringify(newCollaborators.map(c => ({
          clientId: c.clientId,
          odId: c.odId,
          cursor: c.cursor,
          permission: c.permission,
        })));

        if (collaboratorsJson !== lastCollaboratorsJson.current) {
          lastCollaboratorsJson.current = collaboratorsJson;
          setCollaborators(newCollaborators);
          setExcalidrawCollaborators(newExcalidrawCollaborators);

          // Update Excalidraw with collaborator cursors (use ref to avoid dependency)
          if (excalidrawAPIRef.current && newExcalidrawCollaborators.size > 0) {
            excalidrawAPIRef.current.updateScene({
              collaborators: newExcalidrawCollaborators,
            });
          }
        }
      } finally {
        // Release guard after microtask to allow next event processing
        queueMicrotask(() => {
          isProcessingRef.current = false;
        });
      }
    };

    awareness.on('change', handleAwarenessChange);

    // Set initial permission state ONLY ONCE (user state is already set by YjsProvider)
    if (!hasSetInitialPermission.current) {
      hasSetInitialPermission.current = true;
      awareness.setLocalStateField('permission', isHost ? 'granted' : 'none');
    }

    return () => {
      awareness.off('change', handleAwarenessChange);
    };
  }, [awareness, isHost]); // Minimal dependencies - refs used for other values

  // Sync local changes to Yjs
  const syncToRemote = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: Partial<AppState>,
      files: BinaryFiles
    ) => {
      if (!bindingRef.current || !canDraw) return;

      bindingRef.current.updateFromLocal(elements, appState, files);
    },
    [canDraw]
  );

  // Request permission (for viewers)
  const requestPermission = useCallback(() => {
    if (!awareness || isHost) return;

    awareness.setLocalStateField('permission', 'requested');
    setPermission('requested');
  }, [awareness, isHost]);

  // Release permission (for viewers)
  const releasePermission = useCallback(() => {
    if (!awareness || isHost) return;

    awareness.setLocalStateField('permission', 'none');
    setPermission('none');
  }, [awareness, isHost]);

  // Grant permission (host only)
  const grantPermission = useCallback(
    (clientId: number) => {
      if (!awareness || !isHost) return;

      // Find the state for this client and update it
      const states = awareness.getStates();
      const targetState = states.get(clientId);

      if (targetState) {
        // We can't directly modify another client's state,
        // so we use a permission grant map that clients listen to
        const grants =
          (awareness.getLocalState()?.permissionGrants as Record<number, boolean>) || {};
        grants[clientId] = true;
        awareness.setLocalStateField('permissionGrants', grants);
      }
    },
    [awareness, isHost]
  );

  // Revoke permission (host only)
  const revokePermission = useCallback(
    (clientId: number) => {
      if (!awareness || !isHost) return;

      const grants =
        (awareness.getLocalState()?.permissionGrants as Record<number, boolean>) || {};
      grants[clientId] = false;
      awareness.setLocalStateField('permissionGrants', grants);
    },
    [awareness, isHost]
  );

  // NOTE: Permission grants from host are now handled in the consolidated
  // awareness change handler above (Effect #1) to avoid duplicate event handlers

  return {
    isSynced,
    permission,
    canDraw,
    collaborators,
    excalidrawCollaborators,
    requestPermission,
    releasePermission,
    grantPermission,
    revokePermission,
    syncToRemote,
  };
}
