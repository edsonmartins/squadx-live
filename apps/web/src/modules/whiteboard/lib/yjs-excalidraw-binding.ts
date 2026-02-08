import * as Y from 'yjs';
import type { ExcalidrawElement, AppState, BinaryFiles } from '../types';

/**
 * Keys used in the Yjs document for storing whiteboard data
 */
export const YJS_KEYS = {
  ELEMENTS: 'elements',
  APP_STATE: 'appState',
  FILES: 'files',
} as const;

/**
 * Binding between Yjs document and Excalidraw state
 * Handles bidirectional sync between CRDT and canvas
 */
export class YjsExcalidrawBinding {
  private doc: Y.Doc;
  private elementsMap: Y.Map<ExcalidrawElement>;
  private appStateMap: Y.Map<unknown>;
  private filesMap: Y.Map<unknown>;
  private isUpdating = false;
  private onRemoteChange:
    | ((
        elements: ExcalidrawElement[],
        appState: Partial<AppState>,
        files: BinaryFiles
      ) => void)
    | undefined;

  constructor(doc: Y.Doc) {
    this.doc = doc;

    // Get or create shared types
    this.elementsMap = doc.getMap(YJS_KEYS.ELEMENTS);
    this.appStateMap = doc.getMap(YJS_KEYS.APP_STATE);
    this.filesMap = doc.getMap(YJS_KEYS.FILES);

    // Subscribe to remote changes
    this.elementsMap.observe(this.handleElementsChange);
    this.appStateMap.observe(this.handleAppStateChange);
    this.filesMap.observe(this.handleFilesChange);
  }

  /**
   * Set callback for remote changes
   */
  setOnRemoteChange(
    callback: (
      elements: ExcalidrawElement[],
      appState: Partial<AppState>,
      files: BinaryFiles
    ) => void
  ) {
    this.onRemoteChange = callback;
  }

  /**
   * Update Yjs document from local Excalidraw changes
   * Called when user makes changes to the canvas
   */
  updateFromLocal(
    elements: readonly ExcalidrawElement[],
    _appState: Partial<AppState>,
    files: BinaryFiles
  ) {
    if (this.isUpdating) return;
    this.isUpdating = true;

    try {
      this.doc.transact(() => {
        // Sync elements
        const currentIds = new Set<string>();
        elements.forEach((element) => {
          currentIds.add(element.id);
          const existing = this.elementsMap.get(element.id);

          // Only update if element is newer or doesn't exist
          if (!existing || existing.version < element.version) {
            this.elementsMap.set(element.id, element);
          }
        });

        // Remove deleted elements
        this.elementsMap.forEach((_, id) => {
          if (!currentIds.has(id)) {
            this.elementsMap.delete(id);
          }
        });

        // Sync files (for images)
        Object.entries(files).forEach(([id, file]) => {
          if (!this.filesMap.has(id)) {
            this.filesMap.set(id, file);
          }
        });

        // Note: We don't sync all appState to avoid conflicts
        // Each user maintains their own viewport, selection, etc.
      });
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Get current state from Yjs document
   */
  getState(): {
    elements: ExcalidrawElement[];
    appState: Partial<AppState>;
    files: BinaryFiles;
  } {
    const elements: ExcalidrawElement[] = [];
    this.elementsMap.forEach((element) => {
      elements.push(element);
    });

    const appState: Partial<AppState> = {};
    this.appStateMap.forEach((value, key) => {
      (appState as Record<string, unknown>)[key] = value;
    });

    const files: BinaryFiles = {};
    this.filesMap.forEach((value, key) => {
      files[key] = value as BinaryFiles[string];
    });

    return { elements, appState, files };
  }

  /**
   * Initialize Yjs document with initial data
   */
  initialize(
    elements: readonly ExcalidrawElement[],
    appState: Partial<AppState>,
    files: BinaryFiles
  ) {
    this.doc.transact(() => {
      // Only initialize if the document is empty
      if (this.elementsMap.size === 0) {
        elements.forEach((element) => {
          this.elementsMap.set(element.id, element);
        });
      }

      // Initialize shared app state (only collaborative properties)
      const collaborativeStateKeys = ['viewBackgroundColor', 'currentItemFontFamily'];
      collaborativeStateKeys.forEach((key) => {
        if (
          !this.appStateMap.has(key) &&
          (appState as Record<string, unknown>)[key] !== undefined
        ) {
          this.appStateMap.set(key, (appState as Record<string, unknown>)[key]);
        }
      });

      // Initialize files
      Object.entries(files).forEach(([id, file]) => {
        if (!this.filesMap.has(id)) {
          this.filesMap.set(id, file);
        }
      });
    });
  }

  /**
   * Handle remote changes to elements
   */
  private handleElementsChange = (event: Y.YMapEvent<ExcalidrawElement>) => {
    if (this.isUpdating) return;

    // Only react to remote changes
    if (event.transaction.local) return;

    this.notifyRemoteChange();
  };

  /**
   * Handle remote changes to app state
   */
  private handleAppStateChange = (event: Y.YMapEvent<unknown>) => {
    if (this.isUpdating) return;
    if (event.transaction.local) return;

    this.notifyRemoteChange();
  };

  /**
   * Handle remote changes to files
   */
  private handleFilesChange = (event: Y.YMapEvent<unknown>) => {
    if (this.isUpdating) return;
    if (event.transaction.local) return;

    this.notifyRemoteChange();
  };

  /**
   * Notify subscribers of remote changes
   */
  private notifyRemoteChange() {
    if (!this.onRemoteChange) return;

    const { elements, appState, files } = this.getState();
    this.onRemoteChange(elements, appState, files);
  }

  /**
   * Clean up observers
   */
  destroy() {
    this.elementsMap.unobserve(this.handleElementsChange);
    this.appStateMap.unobserve(this.handleAppStateChange);
    this.filesMap.unobserve(this.handleFilesChange);
    this.onRemoteChange = undefined;
  }
}

/**
 * Create a binding between Yjs document and Excalidraw
 */
export function createYjsExcalidrawBinding(doc: Y.Doc): YjsExcalidrawBinding {
  return new YjsExcalidrawBinding(doc);
}
