/**
 * Yjs Bridge for MCP Server
 * Connects to the whiteboard's Yjs document as a peer
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type {
  ExcalidrawElement,
  YjsBridgeOptions,
  AgentPresence,
  BoardContextSummary,
} from '../types.js';

const YJS_KEYS = {
  ELEMENTS: 'elements',
  APP_STATE: 'appState',
  FILES: 'files',
} as const;

export class YjsBridge {
  private doc: Y.Doc;
  private provider: WebsocketProvider | null = null;
  private elementsMap: Y.Map<ExcalidrawElement>;
  private options: YjsBridgeOptions;
  private isConnected = false;
  private currentPermission: 'none' | 'requested' | 'granted' = 'none';

  constructor(options: YjsBridgeOptions) {
    this.options = options;
    this.doc = new Y.Doc();
    this.elementsMap = this.doc.getMap(YJS_KEYS.ELEMENTS);
    // Initialize other maps (for future use with app state and files sync)
    this.doc.getMap(YJS_KEYS.APP_STATE);
    this.doc.getMap(YJS_KEYS.FILES);
  }

  /**
   * Connect to the Yjs room
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.provider = new WebsocketProvider(
          this.options.websocketUrl,
          `squadx-whiteboard-${this.options.roomId}`,
          this.doc,
          { connect: true }
        );

        // Set agent presence
        this.provider.awareness.setLocalStateField('user', {
          odId: this.options.agentId,
          odName: this.options.agentName,
          odColor: this.options.agentColor || '#8b5cf6',
          cursor: null,
          isAgent: true,
          agentId: this.options.agentId,
          status: 'idle',
        } satisfies AgentPresence);

        // Start with no permission - must request like humans
        this.currentPermission = 'none';
        this.provider.awareness.setLocalStateField('permission', 'none');

        // Listen for permission grants from host
        this.provider.awareness.on('change', () => {
          this.checkPermissionGrants();
        });

        this.provider.on('status', ({ status }: { status: string }) => {
          if (status === 'connected') {
            this.isConnected = true;
            resolve();
          }
        });

        this.provider.on('connection-error', (event: Event) => {
          this.isConnected = false;
          reject(new Error(`Connection error: ${event.type}`));
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the Yjs room
   */
  disconnect(): void {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
    this.doc.destroy();
    this.isConnected = false;
    this.currentPermission = 'none';
  }

  /**
   * Check for permission grants from host
   */
  private checkPermissionGrants(): void {
    if (!this.provider) return;

    const states = this.provider.awareness.getStates();
    const myClientId = this.provider.awareness.clientID;

    // Look for host's permission grants
    states.forEach((state) => {
      const grants = state.permissionGrants as Record<number, boolean> | undefined;
      if (grants && typeof grants[myClientId] !== 'undefined') {
        const granted = grants[myClientId];
        const newPermission = granted ? 'granted' : 'none';

        if (newPermission !== this.currentPermission) {
          this.currentPermission = newPermission;
          this.provider?.awareness.setLocalStateField('permission', newPermission);
        }
      }
    });
  }

  /**
   * Request permission to draw (raise hand)
   */
  requestPermission(): { success: boolean; message: string } {
    if (!this.provider) {
      return { success: false, message: 'Not connected to whiteboard' };
    }

    if (this.currentPermission === 'granted') {
      return { success: true, message: 'Permission already granted' };
    }

    if (this.currentPermission === 'requested') {
      return { success: true, message: 'Permission already requested, waiting for host approval' };
    }

    this.currentPermission = 'requested';
    this.provider.awareness.setLocalStateField('permission', 'requested');

    // Update presence to show we're requesting
    this.updatePresence({ status: 'requesting_permission' });

    return { success: true, message: 'Permission requested. Waiting for host approval.' };
  }

  /**
   * Release permission (lower hand / give up permission)
   */
  releasePermission(): { success: boolean; message: string } {
    if (!this.provider) {
      return { success: false, message: 'Not connected to whiteboard' };
    }

    this.currentPermission = 'none';
    this.provider.awareness.setLocalStateField('permission', 'none');
    this.updatePresence({ status: 'idle' });

    return { success: true, message: 'Permission released' };
  }

  /**
   * Get current permission state
   */
  getPermission(): 'none' | 'requested' | 'granted' {
    return this.currentPermission;
  }

  /**
   * Check if agent has permission to draw
   */
  hasPermission(): boolean {
    return this.currentPermission === 'granted';
  }

  /**
   * Wait for permission to be granted (with timeout)
   */
  async waitForPermission(timeoutMs: number = 30000): Promise<boolean> {
    if (this.currentPermission === 'granted') {
      return true;
    }

    // Request if not already requested
    if (this.currentPermission === 'none') {
      this.requestPermission();
    }

    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        if (this.currentPermission === 'granted') {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 500);
    });
  }

  /**
   * Update agent presence/cursor
   */
  updatePresence(presence: Partial<AgentPresence>): void {
    if (!this.provider) return;

    const currentState = this.provider.awareness.getLocalState();
    const currentUser = (currentState?.user as AgentPresence) || {};

    this.provider.awareness.setLocalStateField('user', {
      ...currentUser,
      ...presence,
    });
  }

  /**
   * Get all elements from the board
   */
  getElements(): ExcalidrawElement[] {
    const elements: ExcalidrawElement[] = [];
    this.elementsMap.forEach((element) => {
      if (!element.isDeleted) {
        elements.push(element);
      }
    });
    return elements;
  }

  /**
   * Get element by ID
   */
  getElementById(id: string): ExcalidrawElement | null {
    const element = this.elementsMap.get(id);
    return element && !element.isDeleted ? element : null;
  }

  /**
   * Get elements by type
   */
  getElementsByType(type: string): ExcalidrawElement[] {
    return this.getElements().filter((el) => el.type === type);
  }

  /**
   * Add new elements to the board
   * @throws Error if no permission to draw
   */
  addElements(elements: ExcalidrawElement[]): string[] {
    if (!this.hasPermission()) {
      throw new Error('Permission denied: Agent must request and receive permission before drawing. Use request_permission tool first.');
    }

    const addedIds: string[] = [];

    this.doc.transact(() => {
      for (const element of elements) {
        this.elementsMap.set(element.id, element);
        addedIds.push(element.id);
      }
    });

    return addedIds;
  }

  /**
   * Update existing elements
   * @throws Error if no permission to draw
   */
  updateElements(updates: Array<{ id: string; changes: Partial<ExcalidrawElement> }>): string[] {
    if (!this.hasPermission()) {
      throw new Error('Permission denied: Agent must request and receive permission before modifying elements. Use request_permission tool first.');
    }

    const updatedIds: string[] = [];

    this.doc.transact(() => {
      for (const { id, changes } of updates) {
        const existing = this.elementsMap.get(id);
        if (existing) {
          const updated = {
            ...existing,
            ...changes,
            version: existing.version + 1,
            versionNonce: Math.floor(Math.random() * 2147483647),
            updated: Date.now(),
          };
          this.elementsMap.set(id, updated);
          updatedIds.push(id);
        }
      }
    });

    return updatedIds;
  }

  /**
   * Delete elements by ID (soft delete)
   * @throws Error if no permission to draw
   */
  deleteElements(ids: string[]): number {
    if (!this.hasPermission()) {
      throw new Error('Permission denied: Agent must request and receive permission before deleting elements. Use request_permission tool first.');
    }

    let deletedCount = 0;

    this.doc.transact(() => {
      for (const id of ids) {
        const existing = this.elementsMap.get(id);
        if (existing && !existing.isDeleted) {
          const deleted = {
            ...existing,
            isDeleted: true,
            version: existing.version + 1,
            versionNonce: Math.floor(Math.random() * 2147483647),
            updated: Date.now(),
          };
          this.elementsMap.set(id, deleted);
          deletedCount++;
        }
      }
    });

    return deletedCount;
  }

  /**
   * Get board context summary for AI
   */
  getBoardContext(): BoardContextSummary {
    const elements = this.getElements();

    // Count element types
    const elementTypes: Record<string, number> = {};
    for (const el of elements) {
      elementTypes[el.type] = (elementTypes[el.type] || 0) + 1;
    }

    // Calculate bounding box
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const el of elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }

    // Extract text content
    const textContent: string[] = [];
    for (const el of elements) {
      if (el.type === 'text' && 'text' in el && typeof el.text === 'string') {
        textContent.push(el.text);
      }
    }

    // Find connections (arrows/lines with bindings)
    const connections: BoardContextSummary['connections'] = [];
    for (const el of elements) {
      if ((el.type === 'arrow' || el.type === 'line') && 'startBinding' in el && 'endBinding' in el) {
        const startBinding = el.startBinding as { elementId: string } | null;
        const endBinding = el.endBinding as { elementId: string } | null;
        if (startBinding && endBinding) {
          connections.push({
            fromId: startBinding.elementId,
            toId: endBinding.elementId,
            type: el.type as 'arrow' | 'line',
          });
        }
      }
    }

    // Find groups
    const groupMap = new Map<string, string[]>();
    for (const el of elements) {
      for (const groupId of el.groupIds) {
        if (!groupMap.has(groupId)) {
          groupMap.set(groupId, []);
        }
        groupMap.get(groupId)!.push(el.id);
      }
    }

    const groups: BoardContextSummary['groups'] = [];
    groupMap.forEach((elementIds, groupId) => {
      groups.push({ groupId, elementIds });
    });

    return {
      elementCount: elements.length,
      elementTypes,
      boundingBox: {
        minX: minX === Infinity ? 0 : minX,
        minY: minY === Infinity ? 0 : minY,
        maxX: maxX === -Infinity ? 0 : maxX,
        maxY: maxY === -Infinity ? 0 : maxY,
        width: maxX === -Infinity ? 0 : maxX - minX,
        height: maxY === -Infinity ? 0 : maxY - minY,
      },
      textContent,
      connections,
      groups,
    };
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

/**
 * Create a new Yjs bridge instance
 */
export function createYjsBridge(options: YjsBridgeOptions): YjsBridge {
  return new YjsBridge(options);
}
