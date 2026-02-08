// Define Excalidraw types inline to avoid import issues
// These types match the Excalidraw library's internal types

/**
 * Base Excalidraw element type
 */
export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number; value?: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: Array<{ id: string; type: string }> | null;
  updated: number;
  link: string | null;
  locked: boolean;
  [key: string]: unknown;
}

/**
 * Excalidraw application state
 */
export interface AppState {
  theme: 'light' | 'dark';
  viewModeEnabled: boolean;
  zenModeEnabled: boolean;
  gridModeEnabled: boolean;
  zoom: { value: number };
  scrollX: number;
  scrollY: number;
  cursorButton: 'up' | 'down';
  selectedElementIds: Record<string, boolean>;
  [key: string]: unknown;
}

/**
 * Binary file data for images
 */
export interface BinaryFileData {
  mimeType: string;
  id: string;
  dataURL: string;
  created: number;
  lastRetrieved?: number;
}

/**
 * Collection of binary files
 */
export type BinaryFiles = Record<string, BinaryFileData>;

/**
 * Collaborator information for real-time collaboration
 */
export interface Collaborator {
  pointer?: { x: number; y: number; tool: 'pointer' | 'laser' };
  button?: 'up' | 'down';
  selectedElementIds?: Record<string, boolean>;
  username?: string | null;
  color?: { background: string; stroke: string };
  avatarUrl?: string;
  id?: string;
  isCurrentUser?: boolean;
}

/**
 * Excalidraw imperative API
 */
export interface ExcalidrawImperativeAPI {
  getSceneElements: () => readonly ExcalidrawElement[];
  getAppState: () => AppState;
  getFiles: () => BinaryFiles;
  updateScene: (scene: {
    elements?: readonly ExcalidrawElement[];
    appState?: Partial<AppState>;
    collaborators?: Map<string, Collaborator>;
  }) => void;
  scrollToContent: (
    target?: ExcalidrawElement | readonly ExcalidrawElement[],
    opts?: { fitToContent?: boolean; animate?: boolean }
  ) => void;
  resetScene: () => void;
  refresh: () => void;
  setToast: (toast: { message: string; closable?: boolean; duration?: number } | null) => void;
  id: string;
}

/**
 * Whiteboard board status
 */
export type BoardStatus = 'active' | 'archived';

/**
 * Participant role in whiteboard context
 */
export type WhiteboardRole = 'owner' | 'editor' | 'viewer';

/**
 * Whiteboard board data from database
 */
export interface WhiteboardBoard {
  id: string;
  sessionId: string;
  projectId?: string;
  title: string;
  thumbnailUrl?: string;
  yjsState?: Uint8Array;
  elementsJson?: ExcalidrawElement[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
}

/**
 * Whiteboard snapshot for versioning
 */
export interface WhiteboardSnapshot {
  id: string;
  boardId: string;
  elementsJson: ExcalidrawElement[];
  thumbnailUrl?: string;
  label?: string;
  createdBy: string;
  createdAt: string;
}

/**
 * Agent status for presence indicator
 */
export type AgentStatus = 'idle' | 'thinking' | 'drawing' | 'selecting' | 'requesting_permission';

/**
 * Participant presence in whiteboard (awareness)
 */
export interface WhiteboardPresence {
  odId: string;
  odName: string;
  odColor: string;
  cursor?: {
    x: number;
    y: number;
  } | undefined;
  selectedElementIds?: string[] | undefined;
  isAgent?: boolean | undefined;
  agentId?: string | undefined;
  agentStatus?: AgentStatus | undefined;
  currentAction?: string | undefined;
  permissionReason?: string | undefined;
}

/**
 * Whiteboard context state
 */
export interface WhiteboardState {
  board: WhiteboardBoard | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  collaborators: Map<string, Collaborator>;
  isConnected: boolean;
  syncStatus: SyncStatus;
}

/**
 * Sync status for Yjs
 */
export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'synced' | 'error';

/**
 * Whiteboard context actions
 */
export interface WhiteboardActions {
  loadBoard: (boardId: string) => Promise<void>;
  createBoard: (sessionId: string, title?: string) => Promise<WhiteboardBoard>;
  saveBoard: () => Promise<void>;
  updateElements: (elements: readonly ExcalidrawElement[]) => void;
  updateAppState: (appState: Partial<AppState>) => void;
  updateFiles: (files: BinaryFiles) => void;
  createSnapshot: (label?: string) => Promise<WhiteboardSnapshot>;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  setExcalidrawAPI: (api: ExcalidrawImperativeAPI | null) => void;
}

/**
 * Full whiteboard context value
 */
export interface WhiteboardContextValue extends WhiteboardState, WhiteboardActions {}

/**
 * Whiteboard panel props
 */
export interface WhiteboardPanelProps {
  sessionId: string;
  boardId?: string | undefined;
  participantId: string;
  participantName: string;
  participantColor?: string | undefined;
  isHost?: boolean | undefined;
  className?: string | undefined;
  onBoardChange?: ((boardId: string) => void) | undefined;
}

/**
 * Whiteboard canvas props
 */
export interface WhiteboardCanvasProps {
  initialElements?: readonly ExcalidrawElement[];
  initialAppState?: Partial<AppState>;
  initialFiles?: BinaryFiles;
  onChange?: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) => void;
  onPointerUpdate?: (payload: {
    pointer: { x: number; y: number };
    button: 'down' | 'up';
    pointersMap: Map<number, { x: number; y: number }>;
  }) => void;
  viewModeEnabled?: boolean;
  zenModeEnabled?: boolean;
  gridModeEnabled?: boolean;
  theme?: 'light' | 'dark';
  className?: string;
}

/**
 * Yjs provider options
 */
export interface YjsProviderOptions {
  roomId: string;
  websocketUrl: string;
  awareness?: {
    user: WhiteboardPresence;
  };
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSynced?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Excalidraw API hook return type
 */
export interface UseExcalidrawAPIReturn {
  api: ExcalidrawImperativeAPI | null;
  setApi: (api: ExcalidrawImperativeAPI | null) => void;
  getElements: () => readonly ExcalidrawElement[];
  getAppState: () => AppState | null;
  getFiles: () => BinaryFiles;
  updateScene: (scene: {
    elements?: readonly ExcalidrawElement[];
    appState?: Partial<AppState>;
    collaborators?: Map<string, Collaborator>;
  }) => void;
  scrollToContent: (opts?: { fitToContent?: boolean; animate?: boolean }) => void;
  resetScene: () => void;
  exportToBlob: (opts?: {
    mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
    exportPadding?: number;
  }) => Promise<Blob | null>;
  exportToSvg: (opts?: { exportPadding?: number }) => Promise<SVGSVGElement | null>;
}

/**
 * Board persistence hook options
 */
export interface UseBoardPersistenceOptions {
  boardId: string;
  debounceMs?: number;
  onSaveStart?: () => void;
  onSaveComplete?: () => void;
  onSaveError?: (error: Error) => void;
}

/**
 * Agent action type for logging
 */
export type AgentActionType =
  | 'create_shapes'
  | 'update_shapes'
  | 'delete_shapes'
  | 'add_annotation'
  | 'create_diagram'
  | 'apply_template';

/**
 * Agent action log entry
 */
export interface WhiteboardAgentAction {
  id: string;
  boardId: string;
  agentId: string;
  actionType: AgentActionType;
  actionData: Record<string, unknown>;
  createdAt: string;
}

/**
 * Display mode for whiteboard panel
 */
export type WhiteboardDisplayMode = 'tab' | 'split' | 'overlay';

/**
 * Template metadata
 */
export interface WhiteboardTemplate {
  id: string;
  name: string;
  description: string;
  category: 'architecture' | 'diagram' | 'planning' | 'general';
  thumbnailUrl?: string;
  elements: ExcalidrawElement[];
  appState?: Partial<AppState>;
}
