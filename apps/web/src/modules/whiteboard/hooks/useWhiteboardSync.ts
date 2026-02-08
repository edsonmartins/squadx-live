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

  // Host always has permission
  const canDraw = isHost || permission === 'granted';

  // Initialize Yjs binding
  useEffect(() => {
    if (!doc) return;

    const binding = createYjsExcalidrawBinding(doc);
    bindingRef.current = binding;

    // Handle remote changes from Yjs
    binding.setOnRemoteChange((elements, _appState, _files) => {
      if (!excalidrawAPI) return;

      excalidrawAPI.updateScene({
        elements,
      });

      setIsSynced(true);
    });

    // Initialize with current Excalidraw state if we have API
    if (excalidrawAPI && !isInitializedRef.current) {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      binding.initialize(elements, appState, files);
      isInitializedRef.current = true;
    }

    return () => {
      binding.destroy();
      bindingRef.current = null;
    };
  }, [doc, excalidrawAPI]);

  // Handle awareness changes (collaborators + permissions)
  useEffect(() => {
    if (!awareness) return;

    const handleAwarenessChange = () => {
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
          if (newPermission !== permission) {
            setPermission(newPermission);
            onPermissionChange?.(newPermission);
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

      setCollaborators(newCollaborators);
      setExcalidrawCollaborators(newExcalidrawCollaborators);

      // Update Excalidraw with collaborator cursors
      if (excalidrawAPI) {
        excalidrawAPI.updateScene({
          collaborators: newExcalidrawCollaborators,
        });
      }
    };

    awareness.on('change', handleAwarenessChange);

    // Set initial local state
    awareness.setLocalStateField('user', {
      odId: participantId,
      odName: participantName,
      odColor: participantColor,
      cursor: null,
      selectedElementIds: [],
    });
    awareness.setLocalStateField('permission', isHost ? 'granted' : 'none');

    return () => {
      awareness.off('change', handleAwarenessChange);
    };
  }, [
    awareness,
    excalidrawAPI,
    isHost,
    participantId,
    participantName,
    participantColor,
    permission,
    onPermissionChange,
  ]);

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

  // Listen for permission grants from host (for non-hosts)
  useEffect(() => {
    if (!awareness || isHost) return;

    const handleAwarenessChange = () => {
      const states = awareness.getStates();
      const myClientId = awareness.clientID;

      // Look for host's permission grants
      states.forEach((state) => {
        const grants = state.permissionGrants as Record<number, boolean> | undefined;
        if (grants && typeof grants[myClientId] !== 'undefined') {
          const granted = grants[myClientId];
          const newPermission = granted ? 'granted' : 'none';

          if (newPermission !== permission) {
            awareness.setLocalStateField('permission', newPermission);
            setPermission(newPermission);
            onPermissionChange?.(newPermission);
          }
        }
      });
    };

    awareness.on('change', handleAwarenessChange);

    return () => {
      awareness.off('change', handleAwarenessChange);
    };
  }, [awareness, isHost, permission, onPermissionChange]);

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
