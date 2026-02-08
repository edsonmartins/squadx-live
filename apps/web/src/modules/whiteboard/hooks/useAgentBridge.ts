'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type { ExcalidrawElement, AgentStatus } from '../types';

/**
 * Agent information from awareness
 */
export interface AgentInfo {
  agentId: string;
  name: string;
  color: string;
  status: AgentStatus;
  currentAction?: string | undefined;
  permissionReason?: string | undefined;
  cursor?: { x: number; y: number } | undefined;
  clientId: number;
}

/**
 * Agent action event
 */
export interface AgentActionEvent {
  type: 'create' | 'update' | 'delete';
  agentId: string;
  agentName: string;
  elementIds: string[];
  timestamp: number;
}

/**
 * Hook options
 */
export interface UseAgentBridgeOptions {
  awareness: Awareness | null;
  elements: readonly ExcalidrawElement[];
  isHost: boolean;
  onAgentAction?: (event: AgentActionEvent) => void;
}

/**
 * Hook return value
 */
export interface UseAgentBridgeReturn {
  // Connected agents
  agents: AgentInfo[];
  agentCount: number;

  // Agent actions
  lastAgentAction: AgentActionEvent | null;
  agentActionHistory: AgentActionEvent[];

  // Host controls
  grantAgentPermission: (agentId: string) => void;
  revokeAgentPermission: (agentId: string) => void;
  grantAllAgentsPermission: () => void;
  revokeAllAgentsPermission: () => void;

  // Element attribution
  getElementCreator: (elementId: string) => { isAgent: boolean; name: string } | null;
  getAgentElements: (agentId: string) => string[];
}

/**
 * Hook to manage AI agent bridge for whiteboard collaboration
 * Tracks agent presence, permissions, and actions
 */
export function useAgentBridge({
  awareness,
  elements,
  isHost,
  onAgentAction,
}: UseAgentBridgeOptions): UseAgentBridgeReturn {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [lastAgentAction, setLastAgentAction] = useState<AgentActionEvent | null>(null);
  const [agentActionHistory, setAgentActionHistory] = useState<AgentActionEvent[]>([]);

  // Track element creators (element ID -> creator info)
  const elementCreatorsRef = useRef<Map<string, { isAgent: boolean; name: string; agentId?: string }>>(
    new Map()
  );

  // Track previous elements to detect changes
  const previousElementsRef = useRef<Map<string, ExcalidrawElement>>(new Map());

  // Extract agents from awareness states
  useEffect(() => {
    if (!awareness) return;

    const updateAgents = () => {
      const states = awareness.getStates();
      const newAgents: AgentInfo[] = [];

      states.forEach((state, clientId) => {
        const user = state.user as {
          odId?: string;
          odName?: string;
          odColor?: string;
          isAgent?: boolean;
          agentId?: string;
          cursor?: { x: number; y: number };
        } | undefined;

        if (!user?.isAgent || !user.agentId) return;

        newAgents.push({
          agentId: user.agentId,
          name: user.odName || 'AI Agent',
          color: user.odColor || '#8b5cf6',
          status: (state.status as AgentStatus) || 'idle',
          currentAction: state.currentAction as string | undefined,
          permissionReason: state.permissionReason as string | undefined,
          cursor: user.cursor,
          clientId,
        });
      });

      setAgents(newAgents);
    };

    updateAgents();
    awareness.on('change', updateAgents);

    return () => {
      awareness.off('change', updateAgents);
    };
  }, [awareness]);

  // Detect element changes and attribute to agents
  useEffect(() => {
    const currentElements = new Map(elements.map((el) => [el.id, el]));
    const previousElements = previousElementsRef.current;

    // Check for new elements
    const newElements: ExcalidrawElement[] = [];
    const updatedElements: ExcalidrawElement[] = [];
    const deletedIds: string[] = [];

    // Find new and updated elements
    currentElements.forEach((el, id) => {
      const prevEl = previousElements.get(id);
      if (!prevEl) {
        newElements.push(el);
      } else if (prevEl.version !== el.version) {
        updatedElements.push(el);
      }
    });

    // Find deleted elements
    previousElements.forEach((_, id) => {
      if (!currentElements.has(id)) {
        deletedIds.push(id);
      }
    });

    // Attribute new elements to current drawing agent
    if (newElements.length > 0) {
      const drawingAgent = agents.find((a) => a.status === 'drawing');
      if (drawingAgent) {
        const event: AgentActionEvent = {
          type: 'create',
          agentId: drawingAgent.agentId,
          agentName: drawingAgent.name,
          elementIds: newElements.map((el) => el.id),
          timestamp: Date.now(),
        };

        // Track element creators
        newElements.forEach((el) => {
          elementCreatorsRef.current.set(el.id, {
            isAgent: true,
            name: drawingAgent.name,
            agentId: drawingAgent.agentId,
          });
        });

        setLastAgentAction(event);
        setAgentActionHistory((prev) => [...prev.slice(-49), event]);
        onAgentAction?.(event);
      }
    }

    // Attribute updates to current drawing agent
    if (updatedElements.length > 0) {
      const drawingAgent = agents.find((a) => a.status === 'drawing');
      if (drawingAgent) {
        const event: AgentActionEvent = {
          type: 'update',
          agentId: drawingAgent.agentId,
          agentName: drawingAgent.name,
          elementIds: updatedElements.map((el) => el.id),
          timestamp: Date.now(),
        };

        setLastAgentAction(event);
        setAgentActionHistory((prev) => [...prev.slice(-49), event]);
        onAgentAction?.(event);
      }
    }

    // Track deleted elements
    if (deletedIds.length > 0) {
      const drawingAgent = agents.find((a) => a.status === 'drawing');
      if (drawingAgent) {
        const event: AgentActionEvent = {
          type: 'delete',
          agentId: drawingAgent.agentId,
          agentName: drawingAgent.name,
          elementIds: deletedIds,
          timestamp: Date.now(),
        };

        setLastAgentAction(event);
        setAgentActionHistory((prev) => [...prev.slice(-49), event]);
        onAgentAction?.(event);
      }

      // Clean up creator tracking
      deletedIds.forEach((id) => {
        elementCreatorsRef.current.delete(id);
      });
    }

    // Update previous elements reference
    previousElementsRef.current = currentElements;
  }, [elements, agents, onAgentAction]);

  // Grant permission to a specific agent
  const grantAgentPermission = useCallback(
    (agentId: string) => {
      if (!awareness || !isHost) return;

      const agent = agents.find((a) => a.agentId === agentId);
      if (!agent) return;

      // Update permission grants
      const grants = (awareness.getLocalState()?.permissionGrants as Record<number, boolean>) || {};
      grants[agent.clientId] = true;
      awareness.setLocalStateField('permissionGrants', grants);
    },
    [awareness, isHost, agents]
  );

  // Revoke permission from a specific agent
  const revokeAgentPermission = useCallback(
    (agentId: string) => {
      if (!awareness || !isHost) return;

      const agent = agents.find((a) => a.agentId === agentId);
      if (!agent) return;

      const grants = (awareness.getLocalState()?.permissionGrants as Record<number, boolean>) || {};
      grants[agent.clientId] = false;
      awareness.setLocalStateField('permissionGrants', grants);
    },
    [awareness, isHost, agents]
  );

  // Grant permission to all connected agents
  const grantAllAgentsPermission = useCallback(() => {
    if (!awareness || !isHost) return;

    const grants = (awareness.getLocalState()?.permissionGrants as Record<number, boolean>) || {};
    agents.forEach((agent) => {
      grants[agent.clientId] = true;
    });
    awareness.setLocalStateField('permissionGrants', grants);
  }, [awareness, isHost, agents]);

  // Revoke permission from all agents
  const revokeAllAgentsPermission = useCallback(() => {
    if (!awareness || !isHost) return;

    const grants = (awareness.getLocalState()?.permissionGrants as Record<number, boolean>) || {};
    agents.forEach((agent) => {
      grants[agent.clientId] = false;
    });
    awareness.setLocalStateField('permissionGrants', grants);
  }, [awareness, isHost, agents]);

  // Get the creator of an element
  const getElementCreator = useCallback(
    (elementId: string): { isAgent: boolean; name: string } | null => {
      return elementCreatorsRef.current.get(elementId) || null;
    },
    []
  );

  // Get all elements created by a specific agent
  const getAgentElements = useCallback(
    (agentId: string): string[] => {
      const elementIds: string[] = [];
      elementCreatorsRef.current.forEach((creator, elementId) => {
        if (creator.agentId === agentId) {
          elementIds.push(elementId);
        }
      });
      return elementIds;
    },
    []
  );

  return {
    agents,
    agentCount: agents.length,
    lastAgentAction,
    agentActionHistory,
    grantAgentPermission,
    revokeAgentPermission,
    grantAllAgentsPermission,
    revokeAllAgentsPermission,
    getElementCreator,
    getAgentElements,
  };
}

export default useAgentBridge;
