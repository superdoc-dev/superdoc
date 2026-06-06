/**
 * SuperDoc public facade: root entry.
 *
 * SD-3212 PR B (Phase 4b re-curation) under SD-3175. This file mirrors
 * the classification artifact at
 *   tests/consumer-typecheck/snapshots/superdoc-root-classification.json
 *
 * Three tiers:
 *   1. Supported root: documented public API; first-class root surface.
 *   2. Legacy root: typed for backward compatibility; not the recommended
 *      path. Per-name @deprecated JSDoc only where a replacement exists.
 *   3. Internal candidate: accidental implementation leak; kept typed under
 *      compat re-export with @internal so a future major can remove it.
 *      Today these only exist at root because at least one supported or
 *      legacy export reaches them transitively (see closure gate at
 *      tests/consumer-typecheck/check-root-classification-closure.mjs).
 *
 * Rules for this file:
 *   - AIDEV-NOTE: Named exports only. No `export *` (the postbuild gate
 *     parses this file and rejects wildcards). This source export list
 *     IS the facade contract; `verify-public-facade-emit.cjs` derives
 *     the expected names from this file and asserts the emitted .d.ts /
 *     .d.cts match. Changing the surface here also updates the
 *     classification artifact in the same PR; skipping that fails the
 *     consumer-typecheck snapshot.
 *   - The CI closure gate enforces that no supported-root or legacy-root
 *     export references an internal-candidate root symbol in its declared
 *     type. Overrides require a reason string per
 *     check-root-classification-closure.mjs.
 *   - Per-name `@deprecated` JSDoc only fires for names with a real
 *     migration target. Section-level framing carries the "legacy compat"
 *     intent for names where no replacement exists today (avoids
 *     "deprecated to nothing" noise in customer IDEs).
 */

// The common package is workspace-private. Source imports stay readable here;
// ensure-types.cjs strips and inlines the emitted declarations so consumers
// never resolve @superdoc/common from the packed package.
import { DOCX, PDF, HTML, getFileObject, compareVersions } from '@superdoc/common';
// @ts-expect-error Vite resolves DOCX asset URL imports; plain tsc does not.
import BlankDOCXAsset from '@superdoc/common/data/blank.docx?url';
/** URL to the blank DOCX template. */
export const BlankDOCX: string = BlankDOCXAsset;
export { DOCX, PDF, HTML, getFileObject, compareVersions };

// =============================================================================
// SUPPORTED ROOT
// First-class public API. Documented, advertised, supported long-term.
// =============================================================================

// Source: ./core/SuperDoc.ts. The `.js` import specifier is intentional
// for ESM output and resolves to the .ts source during TypeScript builds.
export { SuperDoc } from '../core/SuperDoc.js';

// Source: ./core/theme/create-theme.ts
export { buildTheme } from '../core/theme/create-theme.js';
export { createTheme } from '../core/theme/create-theme.js';

// Type source: ./core/types/index.js
export type { AwarenessState } from '../core/types/index.js';
export type { AwarenessUser } from '../core/types/index.js';
export type { BlockNavigationAddress } from '../core/types/index.js';
export type { BookmarkAddress } from '../core/types/index.js';
export type { CanPerformPermissionParams } from '../core/types/index.js';
export type { CollaborationConfig } from '../core/types/index.js';
export type { CommentAddress } from '../core/types/index.js';
export type { CommentsType } from '../core/types/index.js';
export type { Config } from '../core/types/index.js';
export type { DirectSurfaceRequest } from '../core/types/index.js';
export type { DocRange } from '../core/types/index.js';
export type { Document } from '../core/types/index.js';
export type { DocumentMode } from '../core/types/index.js';
export type { EditorSurface } from '../core/types/index.js';
export type { EditorTransactionEvent } from '../core/types/index.js';
export type { EditorUpdateEvent } from '../core/types/index.js';
export type { ExportParams } from '../core/types/index.js';
export type { ExportType } from '../core/types/index.js';
export type { ExternalPopoverRenderContext } from '../core/types/index.js';
export type { ExternalSurfaceRenderContext } from '../core/types/index.js';
export type { FindReplaceContext } from '../core/types/index.js';
export type { FindReplaceHandle } from '../core/types/index.js';
export type { FindReplaceRenderContext } from '../core/types/index.js';
export type { FindReplaceResolution } from '../core/types/index.js';
export type { IntentSurfaceRequest } from '../core/types/index.js';
export type { Modules } from '../core/types/index.js';
export type { NavigableAddress } from '../core/types/index.js';
export type { PasswordPromptAttemptResult } from '../core/types/index.js';
export type { PasswordPromptConfig } from '../core/types/index.js';
export type { PasswordPromptContext } from '../core/types/index.js';
export type { PasswordPromptHandle } from '../core/types/index.js';
export type { PasswordPromptRenderContext } from '../core/types/index.js';
export type { PasswordPromptResolution } from '../core/types/index.js';
export type { PermissionResolverParams } from '../core/types/index.js';
export type { ResolvedFindReplaceTexts } from '../core/types/index.js';
export type { ResolvedPasswordPromptTexts } from '../core/types/index.js';
export type { ContentControlActiveChangePayload } from '../core/types/index.js';
export type { ContentControlClickPayload } from '../core/types/index.js';
export type { SdtRef } from '../core/types/index.js';
export type { SearchMatch } from '../core/types/index.js';
export type { StoryLocator } from '../core/types/index.js';
export type { SuperDocAwarenessUpdatePayload } from '../core/types/index.js';
export type { SuperDocCommentsUpdatePayload } from '../core/types/index.js';
export type { SuperDocEditorPayload } from '../core/types/index.js';
export type { SuperDocExceptionEditorPayload } from '../core/types/index.js';
export type { SuperDocExceptionPayload } from '../core/types/index.js';
export type { SuperDocExceptionRestorePayload } from '../core/types/index.js';
export type { SuperDocExceptionStorePayload } from '../core/types/index.js';
export type { SuperDocFitWidthOptions } from '../core/types/index.js';
export type { SuperDocFontsApi, SuperDocFontFamily, SuperDocFontFace } from '../core/types/index.js';
export type { SuperDocLayoutEngineOptions } from '../core/types/index.js';
export type { SuperDocLockedPayload } from '../core/types/index.js';
export type { SuperDocReadyPayload } from '../core/types/index.js';
export type { SuperDocState } from '../core/types/index.js';
export type { SuperDocTelemetryConfig } from '../core/types/index.js';
export type { SuperDocViewportChangePayload } from '../core/types/index.js';
export type { SuperDocViewportMetrics } from '../core/types/index.js';
export type { SuperDocZoomConfig } from '../core/types/index.js';
export type { SuperDocZoomMode } from '../core/types/index.js';
export type { SuperDocZoomPayload } from '../core/types/index.js';
export type { SuperDocZoomState } from '../core/types/index.js';
export type { SurfaceComponentProps } from '../core/types/index.js';
export type { SurfaceFloatingPlacement } from '../core/types/index.js';
export type { SurfaceHandle } from '../core/types/index.js';
export type { SurfaceMode } from '../core/types/index.js';
export type { SurfaceOutcome } from '../core/types/index.js';
export type { SurfaceRequest } from '../core/types/index.js';
export type { SurfaceResolution } from '../core/types/index.js';
export type { SurfaceResolver } from '../core/types/index.js';
export type { SurfacesModuleConfig } from '../core/types/index.js';
export type { TrackChangeAuthor } from '../core/types/index.js';
export type { TrackChangesAuthorColorsConfig } from '../core/types/index.js';
export type { TrackChangesModuleConfig } from '../core/types/index.js';
export type { TrackedChangeAddress } from '../core/types/index.js';
export type { UpgradeToCollaborationOptions } from '../core/types/index.js';
export type { ViewingVisibilityConfig } from '../core/types/index.js';

// Source: ./helpers/schema-introspection.js
export { getSchemaIntrospection } from '../helpers/schema-introspection.js';

// `compareVersions`, `DOCX`, `getFileObject`, `HTML`, `PDF` and `BlankDOCX`
// from `@superdoc/common` are handled at the top of this file
// (import-then-export pattern; see comment there for rationale).

// Source: @superdoc/super-editor
export { assertNodeType } from '@superdoc/super-editor';
export { createZip } from '@superdoc/super-editor';
export { defineMark } from '@superdoc/super-editor';
export { defineNode } from '@superdoc/super-editor';
export { Editor } from '@superdoc/super-editor';
export { Extensions } from '@superdoc/super-editor';
export { getActiveFormatting } from '@superdoc/super-editor';
export { getAllowedImageDimensions } from '@superdoc/super-editor';
export { getMarksFromSelection } from '@superdoc/super-editor';
export { getRichTextExtensions } from '@superdoc/super-editor';
export { getStarterExtensions } from '@superdoc/super-editor';
export { isMarkType } from '@superdoc/super-editor';
export { isNodeType } from '@superdoc/super-editor';

// Type source: @superdoc/super-editor
export type { BinaryData } from '@superdoc/super-editor';
export type { BlocksListResult } from '@superdoc/super-editor';
export type { BookmarkInfo } from '@superdoc/super-editor';
export type { CollaborationProvider } from '@superdoc/super-editor';
export type { Comment } from '@superdoc/super-editor';
export type { CommentConfig } from '@superdoc/super-editor';
export type { CommentElement } from '@superdoc/super-editor';
export type { CommentLocationsPayload } from '@superdoc/super-editor';
export type { CommentsPayload } from '@superdoc/super-editor';
export type { DocumentApi } from '@superdoc/super-editor';
export type { DocumentProtectionState } from '@superdoc/super-editor';
export type { DocxFileEntry } from '@superdoc/super-editor';
export type { EditorEventMap } from '@superdoc/super-editor';
export type { EditorLifecycleState } from '@superdoc/super-editor';
export type { EntityAddress } from '@superdoc/super-editor';
export type { ExportDocxParams } from '@superdoc/super-editor';
export type { ExportFormat } from '@superdoc/super-editor';
export type { ExportOptions } from '@superdoc/super-editor';
export type { FieldValue } from '@superdoc/super-editor';
export type { FontAssetUrlContext } from '@superdoc/super-editor';
export type { FontAssetUrlResolver } from '@superdoc/super-editor';
export type { FontConfig } from '@superdoc/super-editor';
export type { FontFaceConfig } from '@superdoc/super-editor';
export type { FontFamilyConfig } from '@superdoc/super-editor';
export type { FontResolutionRecord } from '@superdoc/super-editor';
export type { FontsChangedPayload } from '@superdoc/super-editor';
export type { FontsConfig } from '@superdoc/super-editor';
export type { FontsResolvedPayload } from '@superdoc/super-editor';
export type { ImageDeselectedEvent } from '@superdoc/super-editor';
export type { ImageSelectedEvent } from '@superdoc/super-editor';
export type { LinkPopoverContext } from '@superdoc/super-editor';
export type { LinkPopoverResolution } from '@superdoc/super-editor';
export type { LinkPopoverResolver } from '@superdoc/super-editor';
export type { OpenOptions } from '@superdoc/super-editor';
export type { PageMargins } from '@superdoc/super-editor';
export type { PageSize } from '@superdoc/super-editor';
export type { PageStyles } from '@superdoc/super-editor';
export type { PartChangedEvent } from '@superdoc/super-editor';
export type { PermissionParams } from '@superdoc/super-editor';
export type { ProofingCapabilities } from '@superdoc/super-editor';
export type { ProofingCheckRequest } from '@superdoc/super-editor';
export type { ProofingCheckResult } from '@superdoc/super-editor';
export type { ProofingConfig } from '@superdoc/super-editor';
export type { ProofingError } from '@superdoc/super-editor';
export type { ProofingIssue } from '@superdoc/super-editor';
export type { ProofingIssueKind } from '@superdoc/super-editor';
export type { ProofingProvider } from '@superdoc/super-editor';
export type { ProofingSegment } from '@superdoc/super-editor';
export type { ProofingSegmentMetadata } from '@superdoc/super-editor';
export type { ProofingStatus } from '@superdoc/super-editor';
export type { ProtectionChangeSource } from '@superdoc/super-editor';
export type { ResolveRangeOutput } from '@superdoc/super-editor';
export type { SaveOptions } from '@superdoc/super-editor';
export type { ScrollIntoViewInput } from '@superdoc/super-editor';
export type { ScrollIntoViewOutput } from '@superdoc/super-editor';
export type { SelectionApi } from '@superdoc/super-editor';
export type { SelectionCommandContext } from '@superdoc/super-editor';
export type { SelectionCurrentInput } from '@superdoc/super-editor';
export type { SelectionHandle } from '@superdoc/super-editor';
export type { SelectionInfo } from '@superdoc/super-editor';
export type { TextAddress } from '@superdoc/super-editor';
export type { TextSegment } from '@superdoc/super-editor';
export type { TextTarget } from '@superdoc/super-editor';
export type { TrackedChangesMode } from '@superdoc/super-editor';
export type { UnsupportedContentItem } from '@superdoc/super-editor';
export type { User } from '@superdoc/super-editor';
export type { ViewLayout } from '@superdoc/super-editor';
export type { ViewOptions } from '@superdoc/super-editor';

// =============================================================================
// LEGACY ROOT (60)
// Typed for backward compatibility. Not the recommended root story.
// Per-name @deprecated JSDoc applied below where a clear replacement exists.
// =============================================================================

// Type source: ./core/types/index.js
export type { ContextMenuConfig } from '../core/types/index.js';
export type { ContextMenuContext } from '../core/types/index.js';
export type { ContextMenuItem } from '../core/types/index.js';
export type { ContextMenuSection } from '../core/types/index.js';
export type { FindReplaceConfig } from '../core/types/index.js';

// BlankDOCX is handled via the import-then-export pattern at the top of this file.

// Source: @superdoc/super-editor
export { AIWriter } from '@superdoc/super-editor';
export { CommentsPluginKey } from '@superdoc/super-editor';
export { ContextMenu } from '@superdoc/super-editor';
export { DocxZipper } from '@superdoc/super-editor';
export { fieldAnnotationHelpers } from '@superdoc/super-editor';
export { PresentationEditor } from '@superdoc/super-editor';
export { SlashMenu } from '@superdoc/super-editor';
export { SuperConverter } from '@superdoc/super-editor';
export { SuperEditor } from '@superdoc/super-editor';
export { SuperInput } from '@superdoc/super-editor';
export { SuperToolbar } from '@superdoc/super-editor';
export { Toolbar } from '@superdoc/super-editor';
export { TrackChangesBasePluginKey } from '@superdoc/super-editor';

// Type source: @superdoc/super-editor
export type { BoundingRect } from '@superdoc/super-editor';
export type { CanObject } from '@superdoc/super-editor';
export type { ChainableCommandObject } from '@superdoc/super-editor';
export type { ChainedCommand } from '@superdoc/super-editor';
export type { Command } from '@superdoc/super-editor';
export type { CommandProps } from '@superdoc/super-editor';
export type { CoreCommandMap } from '@superdoc/super-editor';
export type { EditorCommands } from '@superdoc/super-editor';
export type { EditorExtension } from '@superdoc/super-editor';
export type { EditorOptions } from '@superdoc/super-editor';
export type { EditorState } from '@superdoc/super-editor';
export type { EditorView } from '@superdoc/super-editor';
export type { ExtensionCommandMap } from '@superdoc/super-editor';
export type { FlowBlock } from '@superdoc/super-editor';
export type { FlowMode } from '@superdoc/super-editor';
export type { Layout } from '@superdoc/super-editor';
export type { LayoutEngineOptions } from '@superdoc/super-editor';
export type { LayoutError } from '@superdoc/super-editor';
export type { LayoutFragment } from '@superdoc/super-editor';
export type { LayoutMetrics } from '@superdoc/super-editor';
export type { LayoutMode } from '@superdoc/super-editor';
export type { LayoutPage } from '@superdoc/super-editor';
export type { LayoutState } from '@superdoc/super-editor';
export type { ListDefinitionsPayload } from '@superdoc/super-editor';
export type { Measure } from '@superdoc/super-editor';
export type { PaginationPayload } from '@superdoc/super-editor';
export type { PaintSnapshot } from '@superdoc/super-editor';
export type { PartId } from '@superdoc/super-editor';
export type { PartSectionId } from '@superdoc/super-editor';
export type { PositionHit } from '@superdoc/super-editor';
export type { PresenceOptions } from '@superdoc/super-editor';
export type { PresentationEditorOptions } from '@superdoc/super-editor';
export type { ProseMirrorJSON } from '@superdoc/super-editor';
export type { RangeRect } from '@superdoc/super-editor';
export type { RemoteCursorState } from '@superdoc/super-editor';
export type { RemoteUserInfo } from '@superdoc/super-editor';
export type { Schema } from '@superdoc/super-editor';
export type { SectionMetadata } from '@superdoc/super-editor';
export type { TrackedChangesOverrides } from '@superdoc/super-editor';
export type { Transaction } from '@superdoc/super-editor';
export type { VirtualizationOptions } from '@superdoc/super-editor';

// =============================================================================
// INTERNAL CANDIDATE (8)
// Should not be public long-term. Kept typed under compat re-export because
// at least one supported/legacy export reaches them transitively. Removal
// planned for a major-version cleanup (see SD-3212 follow-ups).
// =============================================================================

// Source: @superdoc/super-editor
/** @internal */
export { AnnotatorHelpers } from '@superdoc/super-editor';
/** @internal */
export { registeredHandlers } from '@superdoc/super-editor';
/** @internal */
export { SectionHelpers } from '@superdoc/super-editor';
/** @internal */
export { helpers as superEditorHelpers } from '@superdoc/super-editor';
/** @internal */
export { trackChangesHelpers } from '@superdoc/super-editor';

// Type source: @superdoc/super-editor
/** @internal */
export type { LayoutUpdatePayload } from '@superdoc/super-editor';
/** @internal */
export type { RemoteCursorsRenderPayload } from '@superdoc/super-editor';
/** @internal */
export type { TelemetryEvent } from '@superdoc/super-editor';
