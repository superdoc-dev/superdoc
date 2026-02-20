import type { CSSProperties, ReactNode } from 'react';
import type { SuperDoc, Editor } from 'superdoc';

/**
 * Types for @superdoc-dev/react
 *
 * Core types are extracted from the SuperDoc constructor parameter type,
 * ensuring they stay in sync with the superdoc package.
 */

// =============================================================================
// Extract types from SuperDoc constructor (single source of truth)
// =============================================================================

/** SuperDoc constructor config - extracted from superdoc package */
type SuperDocConstructorConfig = ConstructorParameters<typeof SuperDoc>[0];

/** SuperDoc instance type - from superdoc package */
export type SuperDocInstance = InstanceType<typeof SuperDoc>;

/** Document mode - extracted from Config.documentMode */
export type DocumentMode = NonNullable<SuperDocConstructorConfig['documentMode']>;

/** User role - extracted from Config.role */
export type UserRole = NonNullable<SuperDocConstructorConfig['role']>;

/** User object - extracted from Config.user */
export type SuperDocUser = NonNullable<SuperDocConstructorConfig['user']>;

/** Modules configuration - extracted from Config.modules */
export type SuperDocModules = NonNullable<SuperDocConstructorConfig['modules']>;

/** Full SuperDoc config - extracted from constructor */
export type SuperDocConfig = SuperDocConstructorConfig;

// =============================================================================
// Callback Event Types
// =============================================================================

// Re-export Editor type from superdoc
export type { Editor } from 'superdoc';

/** Event passed to onReady callback */
export interface SuperDocReadyEvent {
  superdoc: SuperDocInstance;
}

/** Event passed to onEditorCreate callback */
export interface SuperDocEditorCreateEvent {
  editor: Editor;
}

/** Event passed to onEditorUpdate callback */
export interface SuperDocEditorUpdateEvent {
  editor: Editor;
}

/** Event passed to onContentError callback */
export interface SuperDocContentErrorEvent {
  error: Error;
  editor: Editor;
  documentId: string;
  file: File;
}

/** Event passed to onException callback */
export interface SuperDocExceptionEvent {
  error: Error;
}

// =============================================================================
// React Component Types
// =============================================================================

/**
 * Props managed internally by the React component (not exposed to users).
 * - selector: managed by component (creates internal container)
 */
type InternalProps = 'selector';

/**
 * Props that are required in core but should be optional in React.
 * - documentMode: defaults to 'editing' if not provided
 */
type OptionalInReact = 'documentMode';

/**
 * Callback props that are explicitly typed in CallbackProps.
 * These are excluded from SuperDocConfig to avoid type conflicts.
 */
type ExplicitCallbackProps =
  | 'onReady'
  | 'onEditorCreate'
  | 'onEditorDestroy'
  | 'onEditorUpdate'
  | 'onContentError'
  | 'onException';

/**
 * Explicitly typed callback props to ensure proper TypeScript inference.
 * These override any loosely-typed callbacks from SuperDocConfig.
 */
export interface CallbackProps {
  /** Callback when SuperDoc is ready */
  onReady?: (event: SuperDocReadyEvent) => void;

  /** Callback after an editor is created */
  onEditorCreate?: (event: SuperDocEditorCreateEvent) => void;

  /** Callback when editor is destroyed */
  onEditorDestroy?: () => void;

  /** Callback when document content is updated */
  onEditorUpdate?: (event: SuperDocEditorUpdateEvent) => void;

  /** Callback when there is a content parsing error */
  onContentError?: (event: SuperDocContentErrorEvent) => void;

  /** Callback when an exception is thrown */
  onException?: (event: SuperDocExceptionEvent) => void;
}

/**
 * React-specific props added on top of SuperDocConfig.
 */
interface ReactProps {
  /** Optional ID for the editor container. Auto-generated if not provided. */
  id?: string;

  /** Render function for loading state */
  renderLoading?: () => ReactNode;

  /** Hide the toolbar container. When true, no toolbar is rendered. @default false */
  hideToolbar?: boolean;

  /** Additional CSS class name for the wrapper element */
  className?: string;

  /** Additional inline styles for the wrapper element */
  style?: CSSProperties;
}

/**
 * Props for SuperDocEditor component.
 *
 * Extends SuperDocConfig (minus internal props) with React-specific additions.
 * When new props are added to SuperDoc core, they're automatically available here.
 *
 * Callback props are explicitly typed to ensure proper TypeScript inference.
 */
export interface SuperDocEditorProps
  extends Omit<SuperDocConfig, InternalProps | OptionalInReact | ExplicitCallbackProps>,
    Partial<Pick<SuperDocConfig, OptionalInReact>>,
    CallbackProps,
    ReactProps {}

/**
 * Ref interface for SuperDocEditor component
 */
export interface SuperDocRef {
  /** Get the underlying SuperDoc instance. Returns null if not yet initialized. */
  getInstance(): SuperDocInstance | null;
}
