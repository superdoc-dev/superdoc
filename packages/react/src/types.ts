import type { CSSProperties, ReactNode } from 'react';

/**
 * User object for SuperDoc
 */
export interface SuperDocUser {
  name: string;
  email?: string | null;
  image?: string | null;
}

/**
 * Document mode for SuperDoc
 */
export type DocumentMode = 'editing' | 'viewing' | 'suggesting';

/**
 * User role in SuperDoc
 */
export type UserRole = 'editor' | 'viewer' | 'suggester';

/**
 * Export options for SuperDoc
 */
export interface ExportOptions {
  exportType?: ('docx' | 'pdf' | 'html')[];
  commentsType?: 'external' | 'clean';
  exportedName?: string;
  triggerDownload?: boolean;
  fieldsHighlightColor?: string | null;
  additionalFiles?: Blob[];
  additionalFileNames?: string[];
  isFinalDoc?: boolean;
}

/**
 * Tracked changes preferences
 */
export interface TrackedChangesPreferences {
  mode?: 'review' | 'original' | 'final' | 'off';
  enabled?: boolean;
}

/**
 * Search result from SuperDoc
 */
export interface SearchResult {
  from: number;
  to: number;
  text: string;
}

/**
 * Layout engine options
 */
export interface LayoutEngineOptions {
  trackedChanges?: TrackedChangesPreferences;
  [key: string]: unknown;
}

/**
 * View options for document display
 */
export interface ViewOptions {
  layout?: 'print' | 'web';
}

/**
 * Modules configuration for SuperDoc
 */
export interface SuperDocModules {
  comments?: object | false;
  ai?: {
    apiKey?: string;
    endpoint?: string;
  };
  collaboration?: {
    ydoc?: object;
    provider?: object;
    providerType?: 'hocuspocus' | 'superdoc';
    url?: string;
    token?: string;
    params?: object;
  };
  toolbar?: {
    selector?: string | HTMLElement;
    groups?: string[];
    icons?: object;
    texts?: object;
    fonts?: object;
    hideButtons?: boolean;
    responsiveToContainer?: boolean;
    excludeItems?: string[];
  };
  slashMenu?: {
    customItems?: object[];
    menuProvider?: (items: unknown[]) => unknown[];
    includeDefaultItems?: boolean;
  };
}

/**
 * Additional SuperDoc configuration options
 */
export interface SuperDocConfig {
  superdocId?: string;
  format?: string | null;
  editorExtensions?: object[];
  colors?: string[];
  permissionResolver?: (params: {
    permission: string;
    role?: string;
    isInternal?: boolean;
    comment?: object | null;
    trackedChange?: object | null;
  }) => boolean | undefined;
  title?: string;
  conversations?: object[];
  isInternal?: boolean;
  comments?: { visible?: boolean };
  trackChanges?: { visible?: boolean };
  toolbarGroups?: string[];
  toolbarIcons?: object;
  toolbarTexts?: object;
  uiDisplayFallbackFont?: string;
  isDev?: boolean;
  layoutEngineOptions?: LayoutEngineOptions;
  isLocked?: boolean;
  lockedBy?: SuperDocUser | null;
  handleImageUpload?: (file: File) => Promise<string>;
  suppressDefaultDocxStyles?: boolean;
  jsonOverride?: object;
  disableContextMenu?: boolean;
  html?: string;
  markdown?: string;
  isDebug?: boolean;
  viewOptions?: ViewOptions;
  cspNonce?: string;
}

/**
 * SuperDoc instance interface (subset of public methods)
 */
export interface SuperDocInstance {
  version: string;
  superdocId: string;
  config: SuperDocConfig;
  activeEditor: object | null;
  isLocked: boolean;
  lockedBy: SuperDocUser | null;

  destroy(): void;
  setDocumentMode(mode: DocumentMode): void;
  export(options?: ExportOptions): Promise<Blob | void>;
  getHTML(options?: object): string[];
  focus(): void;
  search(text: string | RegExp): SearchResult[];
  goToSearchResult(match: SearchResult): void;
  setLocked(locked: boolean): void;
  setHighContrastMode(enabled: boolean): void;
  setTrackedChangesPreferences(prefs: TrackedChangesPreferences): void;
  save(): Promise<void[]>;
  toggleRuler(): void;
  setDisableContextMenu(disabled: boolean): void;
  addCommentsList(element: HTMLElement): void;
  removeCommentsList(): void;
  addSharedUser(user: SuperDocUser): void;
  removeSharedUser(email: string): void;
  canPerformPermission(params: {
    permission: string;
    role?: string;
    isInternal?: boolean;
    comment?: object | null;
    trackedChange?: object | null;
  }): boolean;

  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  once(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

/**
 * Editor instance from SuperDoc
 */
export interface EditorInstance {
  focus(): void;
  getHTML(options?: object): string;
  exportDocx(options?: object): Promise<Blob | null>;
  setDocumentMode(mode: DocumentMode): void;
  setHighContrastMode(enabled: boolean): void;
}

/**
 * Ready event payload
 */
export interface ReadyEvent {
  superdoc: SuperDocInstance;
}

/**
 * Editor create event payload
 */
export interface EditorCreateEvent {
  editor: EditorInstance;
}

/**
 * Editor update event payload
 */
export interface EditorUpdateEvent {
  editor: EditorInstance;
}

/**
 * Content error event payload
 */
export interface ContentErrorEvent {
  error: object;
  editor: EditorInstance;
  documentId: string;
  file: File | Blob | null;
}

/**
 * Exception event payload
 */
export interface ExceptionEvent {
  error: Error;
  document?: object;
}

/**
 * Props for SuperDocEditor component
 */
export interface SuperDocEditorProps {
  /**
   * Document to load - can be a File, Blob, URL string, or document config object
   */
  document?: File | Blob | string | object;

  /**
   * The editing mode for the document
   * @default 'editing'
   */
  documentMode?: DocumentMode;

  /**
   * The user's role in this document
   * @default 'editor'
   */
  role?: UserRole;

  /**
   * Current user information
   */
  user?: SuperDocUser;

  /**
   * List of users who have access to this document (for @-mentions)
   */
  users?: SuperDocUser[];

  /**
   * Modules configuration (collaboration, comments, ai, toolbar, etc.)
   */
  modules?: SuperDocModules;

  /**
   * Whether to show the toolbar
   * @default true
   */
  toolbar?: boolean;

  /**
   * Whether to show rulers
   */
  rulers?: boolean;

  /**
   * Whether to enable pagination
   */
  pagination?: boolean;

  /**
   * Render function for loading state
   */
  renderLoading?: () => ReactNode;

  /**
   * Callback when SuperDoc is ready
   */
  onReady?: (event: ReadyEvent) => void;

  /**
   * Callback when an editor is created
   */
  onEditorCreate?: (event: EditorCreateEvent) => void;

  /**
   * Callback when an editor is destroyed
   */
  onEditorDestroy?: () => void;

  /**
   * Callback when an editor is updated
   */
  onEditorUpdate?: (event: EditorUpdateEvent) => void;

  /**
   * Callback when there is a content error
   */
  onContentError?: (event: ContentErrorEvent) => void;

  /**
   * Callback when an exception occurs
   */
  onException?: (event: ExceptionEvent) => void;

  /**
   * Advanced configuration options passed through to SuperDoc constructor
   */
  config?: Partial<SuperDocConfig>;

  /**
   * Additional CSS class name for the wrapper element
   */
  className?: string;

  /**
   * Additional inline styles for the wrapper element
   */
  style?: CSSProperties;
}

/**
 * Ref interface for SuperDocEditor component
 */
export interface SuperDocRef {
  /**
   * Get the underlying SuperDoc instance (escape hatch)
   * Returns null if not yet initialized
   */
  getInstance(): SuperDocInstance | null;

  /**
   * Set the document mode
   */
  setDocumentMode(mode: DocumentMode): void;

  /**
   * Export the document
   */
  export(options?: ExportOptions): Promise<Blob | void>;

  /**
   * Get HTML content from all editors
   */
  getHTML(options?: object): string[];

  /**
   * Focus the active editor
   */
  focus(): void;

  /**
   * Search for text in the document
   */
  search(text: string | RegExp): SearchResult[];

  /**
   * Navigate to a search result
   */
  goToSearchResult(match: SearchResult): void;

  /**
   * Set the document lock state
   */
  setLocked(locked: boolean): void;

  /**
   * Enable or disable high contrast mode
   */
  setHighContrastMode(enabled: boolean): void;

  /**
   * Set tracked changes preferences
   */
  setTrackedChangesPreferences(prefs: TrackedChangesPreferences): void;

  /**
   * Save the document (collaboration mode)
   */
  save(): Promise<void[]>;

  /**
   * Toggle ruler visibility
   */
  toggleRuler(): void;

  /**
   * Enable or disable context menu
   */
  setDisableContextMenu(disabled: boolean): void;

  /**
   * Add a comments list to an element
   */
  addCommentsList(element: HTMLElement): void;

  /**
   * Remove the comments list
   */
  removeCommentsList(): void;
}
