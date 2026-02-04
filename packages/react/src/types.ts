import type { CSSProperties, ReactNode } from 'react';
import type { SuperDoc } from 'superdoc';

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

/** Event passed to onReady callback */
export interface SuperDocReadyEvent {
  superdoc: SuperDocInstance;
}

/** Event passed to onEditorCreate callback */
export interface SuperDocEditorCreateEvent {
  editor: unknown;
}

/** Event passed to onEditorUpdate callback */
export interface SuperDocEditorUpdateEvent {
  editor: unknown;
}

/** Event passed to onContentError callback */
export interface SuperDocContentErrorEvent {
  error: unknown;
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
 * Note: All callback types (onReady, onEditorCreate, etc.) come directly from
 * SuperDocConfig, ensuring type compatibility with the core package.
 */
export interface SuperDocEditorProps
  extends Omit<SuperDocConfig, InternalProps | OptionalInReact>,
    Partial<Pick<SuperDocConfig, OptionalInReact>>,
    ReactProps {}

/**
 * Ref interface for SuperDocEditor component
 */
export interface SuperDocRef {
  /** Get the underlying SuperDoc instance. Returns null if not yet initialized. */
  getInstance(): SuperDocInstance | null;
}
