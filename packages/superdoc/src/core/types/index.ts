// Public-contract type definitions for the `superdoc` package.
//
// This module is the canonical home for the shapes consumers see when they
// import from `superdoc` (Config, Modules, the surface and prompt configs,
// etc.). vite-plugin-dts emits these declarations into the published `.d.ts`
// graph, and the consumer-typecheck matrix asserts each export resolves to a
// real interface — not `any` and not missing.
//
// SD-2869 converted this file from JSDoc typedefs to TypeScript so the
// declarations are self-checked by the compiler. Keep the public surface
// stable: each exported name and shape mirrors the previous JSDoc; new fields
// or behavioral changes belong in a follow-up ticket.

import type { Doc as YDoc } from 'yjs';
import type { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import type { Ref, ComputedRef } from 'vue';

import type {
  Editor as SuperEditor,
  PresentationEditor as SuperEditorPresentationEditor,
  StoryLocator as SuperEditorStoryLocator,
  BookmarkAddress as SuperEditorBookmarkAddress,
  BlockNavigationAddress as SuperEditorBlockNavigationAddress,
  CommentAddress as SuperEditorCommentAddress,
  TrackedChangeAddress as SuperEditorTrackedChangeAddress,
  NavigableAddress as SuperEditorNavigableAddress,
  CollaborationProvider as SuperEditorCollaborationProvider,
  FontConfig,
  FontsResolvedPayload,
  ProofingProvider,
} from '@superdoc/super-editor';

import type { SuperDoc as SuperDocClass } from '../SuperDoc.js';

// Re-exports (kept as named exports so `import('../core/types').Editor` still
// resolves the same names consumers were using).
export type Editor = SuperEditor;
export type SuperDoc = SuperDocClass;
export type StoryLocator = SuperEditorStoryLocator;
export type BookmarkAddress = SuperEditorBookmarkAddress;
export type BlockNavigationAddress = SuperEditorBlockNavigationAddress;
export type CommentAddress = SuperEditorCommentAddress;
export type TrackedChangeAddress = SuperEditorTrackedChangeAddress;
export type NavigableAddress = SuperEditorNavigableAddress;

/**
 * The current user of this superdoc.
 *
 * Every field is optional on input. `SuperDoc.#init` normalizes a missing
 * or partial `user` by spreading `DEFAULT_USER` over consumer input, so
 * `name` and `email` always have a value at runtime even when the
 * consumer omits them. The typedef stays open so consumers can pass
 * `{ name: 'Ada' }` without a typecheck failure.
 *
 * Kept structurally compatible with the publicly re-exported
 * `User` from `@superdoc/super-editor` (also optional name/email).
 */
export interface User {
  /** The user's name. */
  name?: string;
  /**
   * The user's email. May be `null` when the consumer did not provide an
   * email and SuperDoc fell back to the built-in default user; the runtime
   * has always exposed `null` here, so the typedef accepts it explicitly
   * rather than narrowing to `string`. Consumers must narrow before
   * performing string operations on this field.
   */
  email?: string | null;
  /** The user's photo. */
  image?: string | null;
  /**
   * Awareness color for collaborative cursors. Auto-assigned from the
   * configured palette (or a default palette) when omitted, derived from a
   * hash of the user's identity so the assignment is stable across reloads.
   */
  color?: string;
}

export interface Document {
  /** The ID of the document. */
  id?: string;
  /** The type of the document. */
  type: string;
  /** The initial data of the document (File, Blob, or null). */
  data?: File | Blob | null;
  /** The name of the document. */
  name?: string;
  /** The URL of the document. */
  url?: string;
  /** Whether the document is a new file. */
  isNewFile?: boolean;
  /** The Yjs document for collaboration. */
  ydoc?: YDoc;
  /**
   * The provider for collaboration. Widened from `HocuspocusProvider` to
   * `CollaborationProvider` to match the runtime, which stores whatever
   * provider the consumer passed via `Config.modules.collaboration.provider`
   * (HocuspocusProvider, LiveblocksYjsProvider, TiptapCollabProvider, etc.).
   * Consumers needing Hocuspocus-specific members must narrow before use.
   */
  provider?: CollaborationProvider;
}

/**
 * External collaboration provider interface. Accepts any Yjs-compatible
 * provider (HocuspocusProvider, LiveblocksYjsProvider, TiptapCollabProvider,
 * etc.). Re-exported from `@superdoc/super-editor` so `Config.modules.collaboration.provider`
 * (typed against this) accepts values typed against the publicly-exported
 * `CollaborationProvider` from `superdoc`.
 */
export type CollaborationProvider = SuperEditorCollaborationProvider;

/**
 * Internal augmentation of `Document` for runtime-only fields that the
 * SuperDoc instance attaches to each document during initialization. The
 * public `Document` interface above is what consumers pass in via
 * `Config.documents`; this type adds the fields SuperDoc itself sets and
 * reads internally (per-document `role` propagation, the live `getEditor`
 * and `getPresentationEditor` accessors that the surface manager and
 * mode-switch helpers walk).
 *
 * Internal use only: not part of any public typedef. Consumers cannot
 * import this through `superdoc` and should not pass any of these fields
 * into `Config.documents` from outside.
 */
export interface RuntimeDocument extends Document {
  /**
   * Per-document role. `useDocument()` reads `params.role` from the input
   * config and exposes it on the smart-doc object; once collaboration
   * setup runs, SuperDoc unconditionally writes `doc.role = config.role`,
   * silently replacing whatever was passed. SD-2872 removed this from
   * the public `Document` interface so consumers stop trying to use it
   * as a stable per-document override; it lives on `RuntimeDocument`
   * only so internal SuperDoc.js callsites can type the assignment.
   */
  role?: 'editor' | 'viewer' | 'suggester';
  /**
   * Returns the body Editor for this document, when the runtime has
   * created one. Set by the editor-create lifecycle.
   *
   * @deprecated Direct editor access will be removed in a future version.
   * Use the Document API (`editor.doc`) instead. This typedef carries the
   * deprecation marker forward from the source accessor in
   * `packages/superdoc/src/composables/use-document.js`.
   */
  getEditor?: () => SuperEditor | null | undefined;
  /**
   * Returns the PresentationEditor for this document, when the runtime
   * has created one. Set by the editor-create lifecycle.
   *
   * @deprecated Direct editor access will be removed in a future version.
   * Use the Document API (`editor.doc`) instead.
   */
  getPresentationEditor?: () => SuperEditorPresentationEditor | null | undefined;
}

/** Collaboration module configuration. */
export interface CollaborationConfig {
  /** External Yjs document (provider-agnostic mode). */
  ydoc?: object;
  /** External collaboration provider (provider-agnostic mode). */
  provider?: CollaborationProvider;
  /** Internal provider type (deprecated). */
  providerType?: 'hocuspocus' | 'superdoc';
  /** WebSocket URL for internal provider (deprecated). */
  url?: string;
  /** Authentication token for internal provider (deprecated). */
  token?: string;
  /** Additional params for internal provider (deprecated). */
  params?: object;
}

/** Options for `upgradeToCollaboration()`. */
export interface UpgradeToCollaborationOptions {
  /** The target Yjs document to seed and connect to. */
  ydoc: YDoc;
  /** The collaboration provider to use. */
  provider: CollaborationProvider;
}

/** Context passed to a link popover resolver when a link is clicked. */
export interface LinkPopoverContext {
  /** The editor instance. */
  editor: Editor;
  /** The href attribute of the clicked link. */
  href: string;
  /** The target attribute of the clicked link. */
  target: string | null;
  /** The rel attribute of the clicked link. */
  rel: string | null;
  /** The title/tooltip attribute of the clicked link. */
  tooltip: string | null;
  /** The clicked anchor DOM element. */
  element: HTMLAnchorElement;
  /** X coordinate of the click. */
  clientX: number;
  /** Y coordinate of the click. */
  clientY: number;
  /** Whether this is an anchor link (href starts with #). */
  isAnchorLink: boolean;
  /** Current document mode ('editing', 'viewing', 'suggesting'). */
  documentMode: string;
  /** Computed popover position relative to editor surface. */
  position: { left: string; top: string };
  /** Close the popover programmatically. */
  closePopover: () => void;
}

/** Context passed to an external (framework-agnostic) popover renderer. */
export interface ExternalPopoverRenderContext {
  /** Empty DOM container positioned where the popover should appear. */
  container: HTMLElement;
  /** Call to close the popover and clean up. */
  closePopover: () => void;
  /** The editor instance. */
  editor: Editor;
  /** The href of the clicked link. */
  href: string;
}

/** Resolution returned by a link popover resolver. */
export type LinkPopoverResolution =
  | { type: 'default' }
  | { type: 'none' }
  | { type: 'custom'; component: unknown; props?: Record<string, unknown> }
  | {
      type: 'external';
      render: (ctx: ExternalPopoverRenderContext) => { destroy?: () => void } | void;
    };

/**
 * Resolver function for customizing the link click popover. Must be
 * synchronous; do not return a Promise. Return null/undefined to use the
 * default popover.
 */
export type LinkPopoverResolver = (ctx: LinkPopoverContext) => LinkPopoverResolution | null | undefined;

// ---------------------------------------------------------------------------
// Context menu types
// ---------------------------------------------------------------------------

/** Context object passed to context menu callbacks (showWhen, render, action, menuProvider). */
export interface ContextMenuContext {
  /** The editor instance. */
  editor: Editor;
  /** Currently selected text (empty string if no selection). */
  selectedText: string;
  /** Whether there is an expanded selection. */
  hasSelection: boolean;
  /** ProseMirror start position of the selection. */
  selectionStart: number;
  /** ProseMirror end position of the selection. */
  selectionEnd: number;
  /** How the menu was opened. */
  trigger: 'click' | 'slash';
  /** Whether the cursor is inside a table. */
  isInTable: boolean;
  /** Whether the cursor is inside a list. */
  isInList: boolean;
  /** Whether the cursor is inside a document section. */
  isInSectionNode: boolean;
  /** Whether a table cell selection is active. */
  isCellSelection: boolean;
  /** Kind of table selection (row, column, etc.). */
  tableSelectionKind: string | null;
  /** ProseMirror node type name at the cursor. */
  currentNodeType: string | null;
  /** Names of marks active at the cursor. */
  activeMarks: string[];
  /** Whether the cursor is on a tracked change. */
  isTrackedChange: boolean;
  /** ID of the tracked change at the cursor. */
  trackedChangeId: string | null;
  /** Current document mode (editing, viewing, suggesting). */
  documentMode: string;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
  /** Whether the editor is editable. */
  isEditable: boolean;
  /** Screen coordinates of the cursor. */
  cursorPosition: { x: number; y: number } | null;
}

/** A single item inside a context menu section. */
export interface ContextMenuItem {
  /** Unique identifier for the menu item. */
  id: string;
  /** Display text. */
  label: string;
  /** Icon identifier. */
  icon?: string;
  /** Custom Vue component to render this item. */
  component?: unknown;
  /** Callback invoked when the item is clicked. */
  action?: (editor: Editor, context: ContextMenuContext) => void;
  /** Predicate controlling visibility. */
  showWhen?: (context: ContextMenuContext) => boolean;
  /** Custom renderer returning an HTML element. */
  render?: (context: ContextMenuContext) => HTMLElement;
  /** Keyboard shortcut label displayed beside the item. */
  shortcut?: string;
}

/** A section (group) of items in the context menu. */
export interface ContextMenuSection {
  /** Unique identifier for the section. */
  id: string;
  /** Menu items in this section. */
  items: ContextMenuItem[];
}

/** Configuration for the context menu module. */
export interface ContextMenuConfig {
  /** Custom menu sections appended (or merged by id) to the default menu. */
  customItems?: ContextMenuSection[];
  /**
   * Advanced: transform the final section list before render. Return
   * null/undefined to keep the original sections.
   */
  menuProvider?: (
    context: ContextMenuContext,
    sections: ContextMenuSection[],
  ) => ContextMenuSection[] | null | undefined;
  /** Whether to include default menu items (default: true). */
  includeDefaultItems?: boolean;
}

// ---------------------------------------------------------------------------
// Surface system types
// ---------------------------------------------------------------------------

/** Surface presentation mode. */
export type SurfaceMode = 'dialog' | 'floating';

export type SurfaceFloatingPlacement =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'bottom-center';

/** Per-request floating-mode overrides. */
interface FloatingRequestOptions {
  /** Position preset (default: 'top-right'). Ignored when explicit insets are provided. */
  placement?: SurfaceFloatingPlacement;
  /** Exact top inset (overrides placement). */
  top?: string | number;
  /** Exact right inset (overrides placement). */
  right?: string | number;
  /** Exact bottom inset (overrides placement). */
  bottom?: string | number;
  /** Exact left inset (overrides placement). */
  left?: string | number;
  /** Surface width. */
  width?: string | number;
  /** Max width. */
  maxWidth?: string | number;
  /** Max height. */
  maxHeight?: string | number;
  /** Move focus into first focusable child on open (default: true). */
  autoFocus?: boolean;
  /** Close when pointer down outside the surface (default: false). */
  closeOnOutsidePointerDown?: boolean;
}

/** Intent-based surface request — resolved by the resolver or built-in registry. */
export interface IntentSurfaceRequest {
  /** Optional surface id (auto-generated if omitted). */
  id?: string;
  /** Opaque intent identifier used by the resolver. */
  kind: string;
  /** Presentation mode. */
  mode: SurfaceMode;
  /** Optional title rendered in the surface chrome. */
  title?: string;
  /**
   * Accessible name for the surface when no visible title is provided. Used as
   * aria-label fallback when neither title nor ariaLabelledBy is set.
   */
  ariaLabel?: string;
  /**
   * ID of the element that labels the surface. Takes precedence over
   * ariaLabel. Use this when the content component renders its own heading
   * that should serve as the accessible name.
   */
  ariaLabelledBy?: string;
  /**
   * Whether Escape closes the surface (default: true). Set at the request top
   * level — the runtime does not read `floating.closeOnEscape` on a per-request
   * basis.
   */
  closeOnEscape?: boolean;
  /** Whether backdrop click closes a dialog (default: true). */
  closeOnBackdrop?: boolean;
  /** Dialog-specific overrides. */
  dialog?: { maxWidth?: string | number };
  /** Floating-specific overrides. */
  floating?: FloatingRequestOptions;
  /** Arbitrary data for the resolver or content. */
  payload?: Record<string, unknown>;
}

/** Direct-render surface request — provides its own component or external renderer. */
export interface DirectSurfaceRequest {
  /** Optional surface id (auto-generated if omitted). */
  id?: string;
  /** Presentation mode. */
  mode: SurfaceMode;
  /** Optional title rendered in the surface chrome. */
  title?: string;
  /**
   * Accessible name for the surface when no visible title is provided. Used as
   * aria-label fallback when neither title nor ariaLabelledBy is set.
   */
  ariaLabel?: string;
  /**
   * ID of the element that labels the surface. Takes precedence over
   * ariaLabel. Use this when the content component renders its own heading
   * that should serve as the accessible name.
   */
  ariaLabelledBy?: string;
  /**
   * Whether Escape closes the surface (default: true). Set at the request top
   * level — the runtime does not read `floating.closeOnEscape` on a per-request
   * basis.
   */
  closeOnEscape?: boolean;
  /** Whether backdrop click closes a dialog (default: true). */
  closeOnBackdrop?: boolean;
  /** Dialog-specific overrides. */
  dialog?: { maxWidth?: string | number };
  /** Floating-specific overrides. */
  floating?: FloatingRequestOptions;
  /** Vue component to render as the surface content. */
  component?: unknown;
  /** Extra props passed to the Vue component. */
  props?: Record<string, unknown>;
  /** External (framework-agnostic) renderer function. */
  render?: (ctx: ExternalSurfaceRenderContext) => { destroy?: () => void } | void;
}

/** Combined surface request type (intent-based or direct-render). */
export type SurfaceRequest = IntentSurfaceRequest | DirectSurfaceRequest;

/** Resolution returned by a surface resolver. */
export type SurfaceResolution =
  | { type: 'none' }
  | { type: 'custom'; component: unknown; props?: Record<string, unknown> }
  | {
      type: 'external';
      render: (ctx: ExternalSurfaceRenderContext) => { destroy?: () => void } | void;
    };

/**
 * Resolver function for customizing surface rendering. Must be synchronous;
 * do not return a Promise. Return null/undefined to fall through to built-in
 * handling. Return `{ type: 'none' }` to explicitly suppress the surface.
 */
export type SurfaceResolver = (request: SurfaceRequest) => SurfaceResolution | null | undefined;

/**
 * Outcome of a surface lifecycle. The handle.result promise always resolves
 * with one of these — it never rejects for normal lifecycle events.
 */
export interface SurfaceOutcome<TResult = unknown> {
  status: 'submitted' | 'closed' | 'replaced' | 'destroyed';
  /** Present when status is 'submitted'. */
  data?: TResult;
  /** Present when status is 'closed'. */
  reason?: unknown;
  /** Present when status is 'replaced'. */
  replacedBy?: string;
}

/**
 * Handle returned by openSurface(). Callers use this to await the outcome or
 * close the surface programmatically.
 */
export interface SurfaceHandle<TResult = unknown> {
  /** Resolved surface id. */
  id: string;
  /** Presentation mode. */
  mode: SurfaceMode;
  /** Close this surface programmatically. */
  close: (reason?: unknown) => void;
  /** Resolves when the surface settles. */
  result: Promise<SurfaceOutcome<TResult>>;
}

/**
 * Props passed to a custom Vue component rendered inside a surface shell.
 * Reserved props (surfaceId, mode, request, resolve, close) always win over
 * caller-provided props to prevent accidental lifecycle override.
 */
export interface SurfaceComponentProps {
  /** The surface id. */
  surfaceId: string;
  /** Presentation mode. */
  mode: SurfaceMode;
  /** The original (normalized) request. */
  request: SurfaceRequest;
  /** Resolves the handle with `{ status: 'submitted', data }`. */
  resolve: (data?: unknown) => void;
  /** Resolves the handle with `{ status: 'closed', reason }`. */
  close: (reason?: unknown) => void;
}

/** Context passed to an external (framework-agnostic) surface renderer. */
export interface ExternalSurfaceRenderContext {
  /** Empty DOM container to render into. */
  container: HTMLElement;
  /** The surface id. */
  surfaceId: string;
  /** Presentation mode. */
  mode: SurfaceMode;
  /** The original (normalized) request. */
  request: SurfaceRequest;
  /** Resolves the handle with `{ status: 'submitted', data }`. */
  resolve: (data?: unknown) => void;
  /** Resolves the handle with `{ status: 'closed', reason }`. */
  close: (reason?: unknown) => void;
}

/** Module-level configuration for the surface system. */
export interface SurfacesModuleConfig {
  /** Global surface resolver. */
  resolver?: SurfaceResolver;
  /** Default dialog options. */
  dialog?: {
    /** Default escape behavior for dialogs (default: true). */
    closeOnEscape?: boolean;
    /** Default backdrop-click behavior for dialogs (default: true). */
    closeOnBackdrop?: boolean;
    /** Default dialog max-width. */
    maxWidth?: string | number;
  };
  /** Default floating options. */
  floating?: {
    /** Default placement preset (default: 'top-right'). */
    placement?: SurfaceFloatingPlacement;
    /** Default floating width. */
    width?: string | number;
    /** Default floating max-width. */
    maxWidth?: string | number;
    /** Default floating max-height. */
    maxHeight?: string | number;
    /** Default escape behavior for floating surfaces (default: true). */
    closeOnEscape?: boolean;
    /** Default outside-pointer behavior (default: false). */
    closeOnOutsidePointerDown?: boolean;
    /** Default auto-focus behavior (default: true). */
    autoFocus?: boolean;
  };
  /**
   * Built-in find/replace popover for editor-backed documents. Disabled by
   * default. Set to `true` to intercept Cmd+F / Ctrl+F inside SuperDoc and
   * open the built-in UI. When an object, allows text customization, custom
   * components, resolvers, and replace-disabling.
   */
  findReplace?: boolean | FindReplaceConfig;
  /**
   * Built-in password prompt dialog for encrypted DOCX files. Enabled by
   * default when omitted. Set to `false` to disable. When `true`, uses
   * default titles/labels. When an object, allows custom titles and labels.
   */
  passwordPrompt?: boolean | PasswordPromptConfig;
}

/** All customizable text strings for the password prompt, resolved with defaults. */
export interface ResolvedPasswordPromptTexts {
  /** Dialog title for first attempt. */
  title: string;
  /** Dialog title after wrong password. */
  invalidTitle: string;
  /** Explanatory text shown below the title. */
  description: string;
  /** Input placeholder text. */
  placeholder: string;
  /** Accessible label for the password input. */
  inputAriaLabel: string;
  /** Submit button text. */
  submitLabel: string;
  /** Cancel button text. */
  cancelLabel: string;
  /** Submit button text while decrypting. */
  busyLabel: string;
  /** Error message for wrong password. */
  invalidMessage: string;
  /** Error message for decryption timeout. */
  timeoutMessage: string;
  /** Error message for other failures. */
  genericErrorMessage: string;
}

/** Result of a password attempt via the `attemptPassword` function. */
export interface PasswordPromptAttemptResult {
  /** Whether the password was accepted. */
  success: boolean;
  /** Error code when success is false (e.g. 'DOCX_PASSWORD_INVALID', 'timeout'). */
  errorCode?: string;
}

/**
 * Handle object injected into custom password prompt UIs as the
 * `passwordPrompt` prop/context field. Provides document metadata, resolved
 * texts, and the retry function.
 */
export interface PasswordPromptHandle {
  /** The document ID requiring a password. */
  documentId: string;
  /** The current error code (e.g. 'DOCX_PASSWORD_REQUIRED', 'DOCX_PASSWORD_INVALID'). */
  errorCode: string;
  /** All text strings resolved with defaults. */
  texts: ResolvedPasswordPromptTexts;
  /**
   * Submit a password attempt. Returns the outcome; do not mutate document
   * state directly.
   */
  attemptPassword: (password: string) => Promise<PasswordPromptAttemptResult>;
}

/**
 * Read-only context passed to a password prompt resolver to decide how to
 * render. Does NOT include `attemptPassword` — the resolver decides, it does
 * not act.
 */
export interface PasswordPromptContext {
  /** The document ID requiring a password. */
  documentId: string;
  /** The current error code. */
  errorCode: string;
  /** Resolved text strings. */
  texts: ResolvedPasswordPromptTexts;
}

/** Context passed to an external (framework-agnostic) password prompt renderer. */
export interface PasswordPromptRenderContext {
  /** Empty DOM container to render into. */
  container: HTMLElement;
  /** The password prompt handle. */
  passwordPrompt: PasswordPromptHandle;
  /** Resolves the surface with `{ status: 'submitted', data }`. */
  resolve: (data?: unknown) => void;
  /** Resolves the surface with `{ status: 'closed', reason }`. */
  close: (reason?: unknown) => void;
  /** The surface id. */
  surfaceId: string;
  /** Presentation mode. */
  mode: SurfaceMode;
}

/** Resolution returned by a password prompt resolver. */
export type PasswordPromptResolution =
  | { type: 'default' }
  | { type: 'none' }
  | { type: 'custom'; component: unknown; props?: Record<string, unknown> }
  | {
      type: 'external';
      render: (ctx: PasswordPromptRenderContext) => { destroy?: () => void } | void;
    };

/** Configuration for the password prompt surface. */
export interface PasswordPromptConfig {
  /** Dialog title for first attempt (default: 'Password Required'). */
  title?: string;
  /** Dialog title after wrong password (default: 'Incorrect Password'). */
  invalidTitle?: string;
  /** Explanatory text (default: 'This document is password protected. Enter the password to open it.'). */
  description?: string;
  /** Input placeholder (default: 'Enter password'). */
  placeholder?: string;
  /** Accessible label for the input (default: 'Document password'). */
  inputAriaLabel?: string;
  /** Submit button text (default: 'Open'). */
  submitLabel?: string;
  /** Cancel button text (default: 'Cancel'). */
  cancelLabel?: string;
  /** Submit button text while decrypting (default: 'Decrypting…'). */
  busyLabel?: string;
  /** Error for wrong password (default: 'Incorrect password. Please try again.'). */
  invalidMessage?: string;
  /** Error for timeout (default: 'Timed out while decrypting. Please try again.'). */
  timeoutMessage?: string;
  /** Error for other failures (default: 'Unable to decrypt this document.'). */
  genericErrorMessage?: string;
  /** Vue component to render as custom password prompt content. Mutually exclusive with `render`. */
  component?: unknown;
  /** Extra props passed to the custom Vue component. Component-only; ignored for `render`. */
  props?: Record<string, unknown>;
  /** External (framework-agnostic) renderer. Mutually exclusive with `component`. */
  render?: (ctx: PasswordPromptRenderContext) => { destroy?: () => void } | void;
  /** Conditional resolver for per-document customization. Can coexist with `component`/`render`. */
  resolver?: (ctx: PasswordPromptContext) => PasswordPromptResolution | null | undefined;
}

// ---------------------------------------------------------------------------
// Find/replace surface types
// ---------------------------------------------------------------------------

/** All customizable text strings for the find/replace surface, resolved with defaults. */
export interface ResolvedFindReplaceTexts {
  /** Input placeholder for the find field. */
  findPlaceholder: string;
  /** Accessible label for the find input. */
  findAriaLabel: string;
  /** Input placeholder for the replace field. */
  replacePlaceholder: string;
  /** Accessible label for the replace input. */
  replaceAriaLabel: string;
  /** Text shown when there are no matches. */
  noResultsLabel: string;
  /** Button label / title for previous match. */
  previousMatchLabel: string;
  /** Accessible label for previous match button. */
  previousMatchAriaLabel: string;
  /** Button label / title for next match. */
  nextMatchLabel: string;
  /** Accessible label for next match button. */
  nextMatchAriaLabel: string;
  /** Button label / title for close. */
  closeLabel: string;
  /** Accessible label for close button. */
  closeAriaLabel: string;
  /** Replace button text. */
  replaceLabel: string;
  /** Replace-all button text. */
  replaceAllLabel: string;
  /** Toggle replace row label. */
  toggleReplaceLabel: string;
  /** Accessible label for toggle replace button. */
  toggleReplaceAriaLabel: string;
  /** Match case toggle text. */
  matchCaseLabel: string;
  /** Accessible label for match case toggle. */
  matchCaseAriaLabel: string;
  /** Ignore diacritics toggle text. */
  ignoreDiacriticsLabel: string;
  /** Accessible label for ignore diacritics toggle. */
  ignoreDiacriticsAriaLabel: string;
}

/**
 * A document position range, in ProseMirror coordinates.
 *
 * SD-2828: Surfaced on the public type contract so consumers can
 * destructure `SearchMatch.ranges` without falling back to `any`. Mirrors
 * the private `DocRange` typedef in the search extension; keep them in
 * sync. Pure data, no methods.
 */
export interface DocRange {
  /** Start position in the document. */
  from: number;
  /** End position in the document. */
  to: number;
}

/**
 * One match returned by `SuperDoc.search()` (and consumed by
 * `SuperDoc.goToSearchResult()`).
 *
 * SD-2828: Promoted from the private search-extension typedef to a
 * public contract so consumers get real types instead of `any` on the
 * search return value, and so `goToSearchResult` can declare the input
 * shape it expects rather than accepting an opaque `Object`. Match
 * instances are produced by the runtime; consumers should treat them as
 * read-only and pass them back unchanged.
 */
export interface SearchMatch {
  /** Combined match text across all ranges. */
  text: string;
  /** Start position of the first range. */
  from: number;
  /** End position of the last range. */
  to: number;
  /**
   * Stable match identifier. For single-range matches this is the
   * position-tracker id; for multi-range (cross-paragraph) matches it is
   * the first tracker id. Use as the dedupe / equality key when wiring a
   * custom navigator.
   */
  id: string;
  /**
   * Document ranges for the match. Present for multi-range matches
   * (cross-paragraph), and may also be populated for single-range
   * matches by the search runtime; consumers should not assume length 1.
   */
  ranges?: DocRange[];
  /** Position-tracker ids, one per range in `ranges`. */
  trackerIds?: string[];
}

/**
 * Handle object injected into find/replace UIs as the `findReplace`
 * prop/context field. Provides reactive search state and all action functions.
 */
export interface FindReplaceHandle {
  /** Current search query. */
  findQuery: Ref<string>;
  /** Current replacement text. */
  replaceText: Ref<string>;
  /** Case-sensitive toggle. */
  caseSensitive: Ref<boolean>;
  /** Ignore diacritics toggle. */
  ignoreDiacritics: Ref<boolean>;
  /** Whether replace row is expanded. */
  showReplace: Ref<boolean>;
  /** Total match count (read-only by convention). */
  matchCount: Ref<number>;
  /** Active match index, -1 when none (read-only by convention). */
  activeMatchIndex: Ref<number>;
  /** Formatted match label e.g. "3 of 12" or "No results". */
  matchLabel: ComputedRef<string>;
  /** Whether there are any matches. */
  hasMatches: ComputedRef<boolean>;
  /** Whether replace actions are available (false for find-only mode). */
  replaceEnabled: boolean;
  /** All text strings resolved with defaults. */
  texts: ResolvedFindReplaceTexts;
  /** Navigate to the next match. */
  goNext: () => void;
  /** Navigate to the previous match. */
  goPrev: () => void;
  /** Replace the active match. */
  replaceCurrent: () => void;
  /** Replace all matches. */
  replaceAll: () => void;
  /** Register a function the composable calls to refocus the find input. */
  registerFocusFn: (fn: () => void) => void;
  /** Close the find/replace surface. */
  close: (reason?: unknown) => void;
}

/**
 * Read-only context passed to a find/replace resolver to decide how to
 * render. Does NOT include action functions — the resolver decides, it does
 * not act.
 */
export interface FindReplaceContext {
  /** Resolved text strings. */
  texts: ResolvedFindReplaceTexts;
  /** Whether replace is available. */
  replaceEnabled: boolean;
}

/**
 * Context passed to an external (framework-agnostic) find/replace renderer.
 * Vue refs are unwrapped as getter/setter properties for framework neutrality.
 */
export interface FindReplaceRenderContext {
  /** Empty DOM container to render into. */
  container: HTMLElement;
  /** The find/replace handle with getters/setters instead of Vue refs. */
  findReplace: object;
  /** Resolves the surface with `{ status: 'submitted', data }`. */
  resolve: (data?: unknown) => void;
  /** Resolves the surface with `{ status: 'closed', reason }`. */
  close: (reason?: unknown) => void;
  /** The surface id. */
  surfaceId: string;
  /** Presentation mode. */
  mode: SurfaceMode;
}

/** Resolution returned by a find/replace resolver. */
export type FindReplaceResolution =
  | { type: 'default' }
  | { type: 'none' }
  | { type: 'custom'; component: unknown; props?: Record<string, unknown> }
  | {
      type: 'external';
      render: (ctx: FindReplaceRenderContext) => { destroy?: () => void } | void;
    };

/** Configuration for the find/replace surface. */
export interface FindReplaceConfig {
  /** Override find placeholder text. */
  findPlaceholder?: string;
  /** Override find input aria-label. */
  findAriaLabel?: string;
  /** Override replace placeholder text. */
  replacePlaceholder?: string;
  /** Override replace input aria-label. */
  replaceAriaLabel?: string;
  /** Override "No results" text. */
  noResultsLabel?: string;
  /** Override previous match button title. */
  previousMatchLabel?: string;
  /** Override previous match aria-label. */
  previousMatchAriaLabel?: string;
  /** Override next match button title. */
  nextMatchLabel?: string;
  /** Override next match aria-label. */
  nextMatchAriaLabel?: string;
  /** Override close button title. */
  closeLabel?: string;
  /** Override close button aria-label. */
  closeAriaLabel?: string;
  /** Override replace button text. */
  replaceLabel?: string;
  /** Override replace-all button text. */
  replaceAllLabel?: string;
  /** Override toggle replace button title. */
  toggleReplaceLabel?: string;
  /** Override toggle replace aria-label. */
  toggleReplaceAriaLabel?: string;
  /** Override match case toggle text. */
  matchCaseLabel?: string;
  /** Override match case aria-label. */
  matchCaseAriaLabel?: string;
  /** Override ignore diacritics toggle text. */
  ignoreDiacriticsLabel?: string;
  /** Override ignore diacritics aria-label. */
  ignoreDiacriticsAriaLabel?: string;
  /** Whether replace is available (default: true). */
  replaceEnabled?: boolean;
  /** Vue component to render as custom find/replace content. Mutually exclusive with `render`. */
  component?: unknown;
  /** Extra props passed to the custom Vue component. */
  props?: Record<string, unknown>;
  /** External (framework-agnostic) renderer. Mutually exclusive with `component`. */
  render?: (ctx: FindReplaceRenderContext) => { destroy?: () => void } | void;
  /** Conditional resolver. Can coexist with `component`/`render`. */
  resolver?: (ctx: FindReplaceContext) => FindReplaceResolution | null | undefined;
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

/** Permission resolver shared by the top-level Config and the comments module. */
type PermissionResolverParams = {
  permission: string;
  role?: string;
  isInternal?: boolean;
  comment?: object | null;
  trackedChange?: object | null;
  currentUser?: User | null;
  superdoc?: SuperDoc | null;
};

/** Modules registered with the SuperDoc instance. */
export interface Modules {
  /**
   * Comments module configuration (false to disable). The named fields below
   * are typed for IDE help; the runtime spreads the entire object through the
   * comments store and accepts additional keys (`useInternalExternalComments`,
   * `suppressInternalExternalComments`, etc.), so the type intersects with an
   * open index signature to keep pass-through configs compiling.
   */
  comments?:
    | false
    | ({
        /** Custom permission resolver for comment actions. */
        permissionResolver?: (params: PermissionResolverParams) => boolean | undefined;
        /** Comment highlight colors (internal/external and active overrides). */
        highlightColors?: {
          /** Base highlight color for internal comments. */
          internal?: string;
          /** Base highlight color for external comments. */
          external?: string;
          /** Active highlight color override for internal comments. */
          activeInternal?: string;
          /** Active highlight color override for external comments. */
          activeExternal?: string;
        };
        /** Comment highlight opacity values (0-1). */
        highlightOpacity?: {
          /** Opacity for active comment highlight. */
          active?: number;
          /** Opacity for inactive comment highlight. */
          inactive?: number;
        };
        /** Hover highlight color for comment marks. */
        highlightHoverColor?: string;
        /** Track change highlight colors. */
        trackChangeHighlightColors?: {
          /** Border color for inserted text highlight. */
          insertBorder?: string;
          /** Background color for inserted text highlight. */
          insertBackground?: string;
          /** Border color for deleted text highlight. */
          deleteBorder?: string;
          /** Background color for deleted text highlight. */
          deleteBackground?: string;
          /** Border color for format change highlight. */
          formatBorder?: string;
        };
        /** Active track change highlight colors (defaults to trackChangeHighlightColors). */
        trackChangeActiveHighlightColors?: {
          /** Active border color for inserted text highlight. */
          insertBorder?: string;
          /** Active background color for inserted text highlight. */
          insertBackground?: string;
          /** Active border color for deleted text highlight. */
          deleteBorder?: string;
          /** Active background color for deleted text highlight. */
          deleteBackground?: string;
          /** Active border color for format change highlight. */
          formatBorder?: string;
        };
      } & Record<string, unknown>);
  /** AI module configuration. */
  ai?: {
    /** Harbour API key for AI features. */
    apiKey?: string;
    /** Custom endpoint URL for AI services. */
    endpoint?: string;
  } & Record<string, unknown>;
  /** PDF module configuration. */
  pdf?: {
    /** Preloaded pdf.js library instance. */
    pdfLib: object;
    /** PDF.js worker source URL (falls back to CDN when omitted). */
    workerSrc?: string;
    /** Whether to auto-configure pdf.js worker. */
    setWorker?: boolean;
    /** Enable text layer rendering (default: false). */
    textLayer?: boolean;
    /** Canvas render scale (quality). */
    outputScale?: number;
  } & Record<string, unknown>;
  /** Collaboration module configuration. */
  collaboration?: CollaborationConfig;
  /**
   * Toolbar module configuration. The `selector`, `groups`, `icons`, and
   * `texts` fields fall back to the top-level `Config.toolbar`,
   * `Config.toolbarGroups`, `Config.toolbarIcons`, and `Config.toolbarTexts`
   * aliases respectively if not set here.
   */
  toolbar?: {
    /**
     * CSS selector (id or class) for the DOM element to render the toolbar
     * into. Must be a string selector, not an `HTMLElement` reference. Falls
     * back to `Config.toolbar` if omitted.
     */
    selector?: string;
    /** Toolbar item ids to hide from the default set. */
    excludeItems?: string[];
    /**
     * Object map of group id to item ids
     * (`{ left: [...], center: [...], right: [...] }`) that overrides the
     * default group composition. Default group ids are
     * `'left' | 'center' | 'right'`. To pass an ordered group-id array
     * (`['left', 'center', 'right']`) use the top-level `Config.toolbarGroups`
     * instead — the array form is not accepted here.
     */
    groups?: Record<string, string[]>;
    /** Icon overrides keyed by toolbar item id. Falls back to `Config.toolbarIcons`. */
    icons?: Record<string, unknown>;
    /** Text/label overrides keyed by toolbar item id. Falls back to `Config.toolbarTexts`. */
    texts?: Record<string, string>;
    /** Custom font list rendered in the font-family dropdown. */
    fonts?: FontConfig[];
    /** Hide buttons that overflow the available width (default: true). */
    hideButtons?: boolean;
    /** Recompute the visible toolbar item set on container resize (default: false). */
    responsiveToContainer?: boolean;
    /**
     * Custom toolbar buttons appended to the default item set. Each entry is
     * a `ToolbarItem`-shaped object (see the consumer-facing toolbar docs for
     * the full shape). The internal `ToolbarItem` type is not yet on the
     * public surface; this typedef accepts the structural shape consumers
     * already pass through `modules.toolbar.customButtons`.
     */
    customButtons?: Array<Record<string, unknown>>;
  } & Record<string, unknown>;
  /** Link click popover configuration. */
  links?: {
    /** Custom resolver for the link click popover. */
    popoverResolver?: LinkPopoverResolver;
  } & Record<string, unknown>;
  /** Context menu module configuration. */
  contextMenu?: ContextMenuConfig;
  /** Deprecated. Use `contextMenu` instead. */
  slashMenu?: object;
  /** Surface system configuration. */
  surfaces?: SurfacesModuleConfig;
  /** Track changes module configuration. */
  trackChanges?: TrackChangesModuleConfig;
  /**
   * Whiteboard module configuration. Pass `false` to disable the module
   * entirely; pass an object to opt in (with `enabled: true`) or to keep it
   * registered but inert (`enabled: false`, the default when no field is set).
   */
  whiteboard?: false | { enabled?: boolean };
}

/**
 * Canonical configuration for the track-changes module. Supersedes the
 * top-level `config.trackChanges` and `config.layoutEngineOptions.trackedChanges`
 * keys, which remain supported as deprecated aliases.
 */
export interface TrackChangesModuleConfig {
  /** Whether tracked-change indicators are shown in viewing mode. */
  visible?: boolean;
  /**
   * Rendering mode for tracked changes (see `TrackedChangesMode` in
   * `@superdoc/contracts`).
   * - 'review': show insertions and deletions inline (default for editing/suggesting)
   * - 'original': show the document as it existed before tracked changes (default for viewing when `visible` is false)
   * - 'final': show the document with changes applied
   * - 'off': disable tracked-change rendering
   */
  mode?: 'review' | 'original' | 'final' | 'off';
  /** Whether the layout engine treats tracked changes as active. */
  enabled?: boolean;
  /**
   * How a tracked replacement (adjacent insertion + deletion created by typing
   * over selected text) surfaces in the UI and API.
   * - `'paired'` (default, Google Docs model): the two halves share one id
   *   and resolve together with a single accept/reject click.
   * - `'independent'` (Microsoft Word / ECMA-376 §17.13.5 model): each
   *   insertion and each deletion has its own id, is addressable on its own,
   *   and resolves independently.
   */
  replacements?: 'paired' | 'independent';
}

export type DocumentMode = 'editing' | 'viewing' | 'suggesting';

export type ExportType = 'docx' | 'pdf' | 'html';

/**
 * - 'external': Include only external comments (default)
 * - 'clean': Export without any comments
 */
export type CommentsType = 'external' | 'clean';

/**
 * Document view layout values — mirrors OOXML ST_View (ECMA-376 §17.18.102).
 * - 'print': Print Layout View — displays document as it prints (default)
 * - 'web': Web Page View — content reflows to fit container (mobile/accessibility)
 */
export type ViewLayout = 'print' | 'web';

/**
 * Document view options for controlling how the document is displayed.
 * Mirrors OOXML document view settings.
 */
export interface ViewOptions {
  /** Document view layout (OOXML ST_View compatible). */
  layout?: ViewLayout;
}

export interface ExportParams {
  /** File formats to export. */
  exportType?: ExportType[];
  /** How to handle comments. */
  commentsType?: CommentsType;
  /** Custom filename (without extension). */
  exportedName?: string;
  /** Extra files to include in the export zip. */
  additionalFiles?: Blob[];
  /** Filenames for the additional files. */
  additionalFileNames?: string[];
  /** Whether this is a final document export. */
  isFinalDoc?: boolean;
  /** Auto-download or return blob. */
  triggerDownload?: boolean;
  /** Color for field highlights. */
  fieldsHighlightColor?: string;
}

/** Surface where the edit originated. */
export type EditorSurface = 'body' | 'header' | 'footer';

export interface EditorUpdateEvent {
  /** The primary editor associated with the update. For header/footer edits, this is the main body editor. */
  editor: Editor;
  /** The editor instance that emitted the update. For body edits, this matches `editor`. */
  sourceEditor: Editor;
  /** The surface where the edit originated. */
  surface: EditorSurface;
  /** Relationship ID for header/footer edits. */
  headerId?: string | null;
  /** Header/footer variant (`default`, `first`, `even`, `odd`) when available. */
  sectionType?: string | null;
}

export interface EditorTransactionEvent {
  /** The primary editor associated with the transaction. For header/footer edits, this is the main body editor. */
  editor: Editor;
  /** The editor instance that emitted the transaction. For body edits, this matches `editor`. */
  sourceEditor: Editor;
  /** The ProseMirror transaction or transaction-like payload emitted by the source editor. */
  transaction: any;
  /** Time spent applying the transaction, in milliseconds. */
  duration?: number;
  /** The surface where the transaction originated. */
  surface: EditorSurface;
  /** Relationship ID for header/footer edits. */
  headerId?: string | null;
  /** Header/footer variant (`default`, `first`, `even`, `odd`) when available. */
  sectionType?: string | null;
}

export interface SuperDocLayoutEngineOptions {
  /**
   * Layout engine flow mode.
   * - 'paginated': standard page-first layout (default)
   * - 'semantic': continuous semantic flow without visible pagination boundaries
   */
  flowMode?: 'paginated' | 'semantic';
  /**
   * Deprecated. Use `modules.trackChanges` instead. Optional override for
   * paginated track-changes rendering (e.g., `{ mode: 'original' }` or
   * `{ enabled: false }`).
   */
  trackedChanges?: object;
  /**
   * Page virtualization options for paginated layout. Defaults to
   * `{ enabled: true, window: 5, overscan: 1 }` to render only the visible
   * window of pages plus a small overscan buffer.
   */
  virtualization?: {
    /** Whether virtualization is active (default: true). */
    enabled?: boolean;
    /** Number of pages kept rendered around the active page (default: 5). */
    window?: number;
    /** Extra pages rendered outside the active window for smoother scrolling (default: 1). */
    overscan?: number;
  };
  /**
   * Whether bookmark indicators are shown in the rendered layout. Toggleable
   * at runtime via `superdoc.setShowBookmarks()`.
   */
  showBookmarks?: boolean;
}

export interface ViewingVisibilityConfig {
  visible?: boolean;
}

export interface SuperDocTelemetryConfig {
  enabled: boolean;
  endpoint?: string;
  metadata?: Record<string, unknown>;
  licenseKey?: string;
}

export interface Config {
  /** The ID of the SuperDoc. */
  superdocId?: string;
  /** The selector or element to mount the SuperDoc into. */
  selector: string | HTMLElement;
  /** The mode of the document (default: 'editing'). */
  documentMode?: DocumentMode;
  /** The role of the user in this SuperDoc. */
  role?: 'editor' | 'viewer' | 'suggester';
  /**
   * The document to load. If a string, it will be treated as a URL. If a File
   * or Blob, it will be used directly.
   */
  document?: object | string | File | Blob;
  /** Password for encrypted DOCX files. Forwarded during document load. */
  password?: string;
  /** The documents to load → soon to be deprecated. */
  documents?: Document[];
  /** The current user of this SuperDoc. */
  user?: User;
  /** All users of this SuperDoc (can be used for "@"-mentions). */
  users?: User[];
  /** Colors to use for user awareness. */
  colors?: string[];
  /** Modules to load. */
  modules?: Modules;
  /** Top-level override for permission checks. */
  permissionResolver?: (params: PermissionResolverParams) => boolean | undefined;
  /** Optional DOM element to render the toolbar in. */
  toolbar?: string;
  /** Toolbar groups to show. */
  toolbarGroups?: string[];
  /** Icons to show in the toolbar. */
  toolbarIcons?: object;
  /** Texts to override in the toolbar. */
  toolbarTexts?: object;
  /**
   * The font-family to use for all SuperDoc UI surfaces (toolbar, comments
   * UI, dropdowns, tooltips, etc.). This ensures consistent typography across
   * the entire application and helps match your application's design system.
   * The value should be a valid CSS font-family string.
   *
   * Example (system fonts):
   *   uiDisplayFallbackFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
   *
   * Example (custom font):
   *   uiDisplayFallbackFont: '"Inter", Arial, sans-serif'
   */
  uiDisplayFallbackFont?: string;
  /** Whether the SuperDoc is in development mode. */
  isDev?: boolean;
  /**
   * Disable Pinia/Vue devtools plugin setup for this SuperDoc instance
   * (useful in non-Vue hosts).
   */
  disablePiniaDevtools?: boolean;
  /**
   * Layout engine overrides passed through to PresentationEditor (page size,
   * margins, virtualization, zoom, debug label, etc.).
   */
  layoutEngineOptions?: SuperDocLayoutEngineOptions;
  /**
   * Advanced PresentationEditor feature toggles. `unifiedHistory` is enabled
   * by default; set it to `false` to force legacy active-surface undo
   * routing.
   */
  experimental?: { unifiedHistory?: boolean };
  /** Callback before an editor is created. */
  onEditorBeforeCreate?: (editor: Editor) => void;
  /** Callback after an editor is created. */
  onEditorCreate?: (editor: Editor) => void;
  /** Callback when a transaction is made. */
  onTransaction?: (params: EditorTransactionEvent) => void;
  /** Callback after an editor is destroyed. */
  onEditorDestroy?: () => void;
  /** Callback when there is an error in the content. */
  onContentError?: (params: { error: object; editor: Editor; documentId: string; file: File }) => void;
  /** Callback when the SuperDoc is ready. */
  onReady?: (editor: { superdoc: SuperDoc }) => void;
  /** Callback when comments are updated. */
  onCommentsUpdate?: (params: { type: string; data: object }) => void;
  /** Callback when awareness is updated. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAwarenessUpdate?: (params: { context: SuperDoc; states: any[] }) => void;
  /** Callback when the SuperDoc is locked. */
  onLocked?: (params: { isLocked: boolean; lockedBy: User }) => void;
  /** Callback when the PDF document is ready. */
  onPdfDocumentReady?: () => void;
  /** Callback when the sidebar is toggled. */
  onSidebarToggle?: (isOpened: boolean) => void;
  /** Callback when collaboration is ready. */
  onCollaborationReady?: (params: { editor: Editor }) => void;
  /** Callback when document is updated. */
  onEditorUpdate?: (params: EditorUpdateEvent) => void;
  /** Callback when an exception is thrown. */
  onException?: (params: { error: Error; editor?: Editor | null; code?: string }) => void;
  /** Callback when the comments list is rendered. */
  onCommentsListChange?: (params: { isRendered: boolean }) => void;
  /**
   * Callback when pagination layout updates (fires after each layout pass
   * with the current page count).
   */
  onPaginationUpdate?: (params: { totalPages: number; superdoc: SuperDoc }) => void;
  /** Callback when the list definitions change. */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  onListDefinitionsChange?: (params: {}) => void;
  /** The format of the document (docx, pdf, html). */
  format?: string;
  /** The extensions to load for the editor. */
  editorExtensions?: object[];
  /** Whether the SuperDoc is internal. */
  isInternal?: boolean;
  /** The title of the SuperDoc. */
  title?: string;
  /** The conversations to load. */
  conversations?: object[];
  /** Toggle comment visibility when `documentMode` is `viewing` (default: false). */
  comments?: ViewingVisibilityConfig;
  /**
   * Deprecated. Use `modules.trackChanges.visible` instead. Toggle
   * tracked-change visibility when `documentMode` is `viewing` (default:
   * false).
   */
  trackChanges?: ViewingVisibilityConfig;
  /** Whether the SuperDoc is locked. */
  isLocked?: boolean;
  /** The function to handle image uploads. */
  handleImageUpload?: (file: File) => Promise<string>;
  /** The user who locked the SuperDoc. */
  lockedBy?: User;
  /** Whether to show the ruler in the editor. */
  rulers?: boolean;
  /** Whether to suppress default styles in docx mode. */
  suppressDefaultDocxStyles?: boolean;
  /** Provided JSON to override content with. */
  jsonOverride?: object;
  /** Whether to disable slash / right-click custom context menu. */
  disableContextMenu?: boolean;
  /** HTML content to initialize the editor with. */
  html?: string;
  /** Markdown content to initialize the editor with. */
  markdown?: string;
  /**
   * Callback invoked with unsupported HTML elements dropped during import.
   * When provided, console.warn is NOT emitted.
   */
  onUnsupportedContent?: ((items: Array<{ tagName: string; outerHTML: string; count: number }>) => void) | null;
  /**
   * When true and no onUnsupportedContent callback is provided, emits a
   * console.warn with unsupported items.
   */
  warnOnUnsupportedContent?: boolean;
  /** Whether to enable debug mode. */
  isDebug?: boolean;
  /** Document view options (OOXML ST_View compatible). */
  viewOptions?: ViewOptions;
  /**
   * Enable contained mode for fixed-height container embedding. When true,
   * SuperDoc propagates height through its DOM tree and adds internal
   * scrolling, so multi-page documents scroll within the consumer's
   * fixed-height container. Default behavior (false) lets the document
   * expand to its natural height.
   */
  contained?: boolean;
  /** Content Security Policy nonce for dynamically injected styles. */
  cspNonce?: string;
  /** License key for organization identification. */
  licenseKey?: string;
  /** Telemetry configuration. */
  telemetry?: SuperDocTelemetryConfig;
  /** Proofing / spellcheck configuration. */
  proofing?: ProofingConfig;
  /**
   * Opt-in toggle for the layout engine. Auto-disabled when web layout is
   * requested without `layoutEngineOptions.flowMode === 'semantic'`; the
   * loader logs a warning and falls back to the legacy ProseMirror render
   * path in that case.
   */
  useLayoutEngine?: boolean;
  /**
   * Callback fired after the editor reports `fonts-resolved`. The payload
   * contains `documentFonts` and `unsupportedFonts` arrays so hosts can fall
   * back, warn, or block printing on unsupported faces.
   */
  onFontsResolved?: (payload: FontsResolvedPayload) => void;
}

/**
 * Internal augmentation of `Config` for runtime-only fields and tightened
 * invariants that must not appear on the published consumer surface. The
 * `Config` interface above is the public contract; this type adds the
 * fields SuperDoc sets/reads internally so the implementation can be
 * type-checked without leaking the fields into customer IDE autocomplete.
 *
 * The four overrides below mark fields that `Config` exposes as optional
 * but `SuperDoc.#init` always normalizes to a populated shape. Internal
 * call sites cast `this.config` to this type so they can access these
 * invariants without per-site null guards.
 *
 * Use this from internal SuperDoc.js callsites that need the augmented shape
 * (e.g. `/** @type {InternalConfig} *\/ (this.config).socket = ...`).
 */
export interface InternalConfig extends Config {
  /**
   * The shared websocket instance created by SuperDoc when
   * `modules.collaboration.providerType === 'hocuspocus'`. Set automatically;
   * not part of the public Config surface.
   */
  socket?: HocuspocusProviderWebsocket;
  /** Normalized to `[]` by `#init` if the consumer passes nothing or `undefined`. */
  documents: Document[];
  /** Normalized to `{}` by `#init` if the consumer passes nothing or `undefined`. */
  modules: Modules;
  /** Spread of `DEFAULT_USER` over consumer input by `#init`; `name` always present. */
  user: User;
  /** Normalized to `{}` by `#init` if the consumer passes nothing or `undefined`. */
  layoutEngineOptions: SuperDocLayoutEngineOptions;
}

/**
 * Internal augmentation of `SuperDocLayoutEngineOptions` for unstable tuning
 * fields. The public `SuperDocLayoutEngineOptions` interface above is the
 * customer-facing contract; this type adds fields the implementation may
 * read but that are intentionally not part of the v1 stable API.
 */
export interface InternalSuperDocLayoutEngineOptions extends SuperDocLayoutEngineOptions {
  /**
   * Internal-only semantic mode tuning options. Shape may change without
   * notice; not part of the public surface.
   */
  semanticOptions?: object;
}

export type ProofingStatus = 'idle' | 'checking' | 'disabled' | 'degraded';

export interface ProofingError {
  kind: 'provider-error' | 'validation-error' | 'timeout';
  message: string;
  segmentIds?: string[];
  cause?: any;
}

export interface ProofingConfig {
  /** Enable or disable proofing (default: false). */
  enabled?: boolean;
  /** Provider instance. */
  provider?: ProofingProvider | null;
  /** Fallback language for segments without a resolved language. */
  defaultLanguage?: string | null;
  /** Debounce delay after edits before rechecking (default: 500). */
  debounceMs?: number;
  /** Maximum replacement suggestions per issue. */
  maxSuggestions?: number;
  /** Prioritize checking visible pages first (default: true). */
  visibleFirst?: boolean;
  /** Show "Ignore" in context menu (default: true). */
  allowIgnoreWord?: boolean;
  /** Words to suppress from proofing results. */
  ignoredWords?: string[];
  /** Provider call timeout in milliseconds (default: 10000). */
  timeoutMs?: number;
  /** Max concurrent provider requests (default: 2). */
  maxConcurrentRequests?: number;
  /** Max segments per provider call (default: 20). */
  maxSegmentsPerBatch?: number;
  /** Error callback for provider failures. */
  onProofingError?: (error: ProofingError) => void;
  /** Status change callback. */
  onStatusChange?: (status: ProofingStatus) => void;
}
