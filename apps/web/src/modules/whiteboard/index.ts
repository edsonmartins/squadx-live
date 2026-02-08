// Components
export {
  WhiteboardPanel,
  WhiteboardCanvas,
  CursorOverlay,
  PermissionBar,
  BoardSidebar,
  MermaidImporter,
  WhiteboardModeSelector,
  SplitViewContainer,
  OverlayContainer,
  SnapshotManager,
  ExportDialog,
  TemplateGallery,
} from './components';

// Providers
export {
  WhiteboardProvider,
  useWhiteboard,
  YjsProvider,
  useYjs,
} from './providers';

// Hooks
export { useExcalidrawAPI, useWhiteboardSync, useBoardPersistence } from './hooks';
export type {
  DrawPermission,
  CollaboratorWithPermission,
  UseWhiteboardSyncOptions,
  UseWhiteboardSyncReturn,
  UseBoardPersistenceReturn,
} from './hooks';

// Lib
export {
  YjsExcalidrawBinding,
  createYjsExcalidrawBinding,
  YJS_KEYS,
  mermaidToExcalidraw,
} from './lib';

// Templates
export {
  ALL_TEMPLATES,
  getTemplatesByCategory,
  getTemplateById,
  cloneTemplateElements,
  c4ContextTemplate,
  erdTemplate,
  sprintBoardTemplate,
  flowchartTemplate,
  userStoryMapTemplate,
  sequenceDiagramTemplate,
} from './templates';

// Types
export type {
  WhiteboardBoard,
  WhiteboardSnapshot,
  WhiteboardPresence,
  WhiteboardState,
  WhiteboardActions,
  WhiteboardContextValue,
  WhiteboardPanelProps,
  WhiteboardCanvasProps,
  WhiteboardTemplate,
  WhiteboardDisplayMode,
  WhiteboardAgentAction,
  AgentActionType,
  SyncStatus,
  BoardStatus,
  WhiteboardRole,
  UseExcalidrawAPIReturn,
  YjsProviderOptions,
  UseBoardPersistenceOptions,
  ExcalidrawElement,
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  Collaborator,
} from './types';
