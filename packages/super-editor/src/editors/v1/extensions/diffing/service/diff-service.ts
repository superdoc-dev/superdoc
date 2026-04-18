/**
 * Shared diff service — the single source of truth for snapshot capture,
 * comparison, and replay.
 *
 * Both the existing editor commands (diffing.js) and the Document API adapter
 * (diff-adapter.ts) delegate to this module. No diff logic should be
 * duplicated outside of this service.
 */

import type { Node as PMNode, Schema } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { NumberingProperties, StylesDocumentProperties } from '@superdoc/style-engine/ooxml';
import type { DiffSnapshot, DiffPayload, DiffApplyResult, DiffCoverage } from '@superdoc/document-api';
import type { CommentInput } from '../algorithm/comment-diffing';
import type { HeaderFooterState } from '../algorithm/header-footer-diffing';
import type { PartsDiff, PartsState } from '../algorithm/parts-diffing';
import { capturePartsState } from '../algorithm/parts-diffing';
import { captureHeaderFooterState } from '../algorithm/header-footer-diffing';
import type { DiffResult } from '../computeDiff';
import { computeDiff } from '../computeDiff';
import { replayDiffs, type ReplayDiffsResult } from '../replayDiffs';
import { buildCanonicalDiffableState } from './canonicalize';
import { computeFingerprint } from './fingerprint';
import { buildDiffSummary } from './summary';
import { V1_COVERAGE, V2_COVERAGE, coverageEquals } from './coverage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNAPSHOT_VERSION_V2 = 'sd-diff-snapshot/v2' as const;
const PAYLOAD_VERSION_V1 = 'sd-diff-payload/v1' as const;
const PAYLOAD_VERSION_V2 = 'sd-diff-payload/v2' as const;
const ENGINE_ID = 'super-editor' as const;

// ---------------------------------------------------------------------------
// Editor shape (minimal interface to avoid tight coupling)
// ---------------------------------------------------------------------------

export interface DiffServiceEditor {
  state: { doc: PMNode; schema: Schema; tr: Transaction };
  converter?: {
    comments?: CommentInput[];
    translatedLinkedStyles?: StylesDocumentProperties | null;
    translatedNumbering?: NumberingProperties | null;
    headers?: Record<string, unknown>;
    footers?: Record<string, unknown>;
    headerIds?: Record<string, unknown>;
    footerIds?: Record<string, unknown>;
    convertedXml?: Record<string, unknown>;
    numbering?: Record<string, unknown>;
    bodySectPr?: Record<string, unknown> | null;
    savedTagsToRestore?: Array<Record<string, unknown>>;
    headerFooterModified?: boolean;
    documentModified?: boolean;
    exportToXmlJson?: (opts: {
      data: unknown;
      editor: { schema: Schema; getUpdatedJson: () => unknown };
      editorSchema: Schema;
      isHeaderFooter: boolean;
      comments?: unknown[];
      commentDefinitions?: unknown[];
      isFinalDoc?: boolean;
    }) => { result?: { elements?: Array<{ elements?: unknown[] }> } };
  } | null;
  emit?: (event: string, payload: unknown) => void;
  options?: {
    documentId?: string | null;
    user?: unknown;
    mediaFiles?: Record<string, unknown>;
  };
  storage?: {
    image?: {
      media?: Record<string, unknown>;
    };
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getEditorComments(editor: DiffServiceEditor): CommentInput[] {
  return Array.isArray(editor.converter?.comments) ? editor.converter!.comments! : [];
}

function getEditorStyles(editor: DiffServiceEditor): StylesDocumentProperties | null {
  return editor.converter?.translatedLinkedStyles ?? null;
}

function getEditorNumbering(editor: DiffServiceEditor): NumberingProperties | null {
  return editor.converter?.translatedNumbering ?? null;
}

/**
 * Captures the current editor's header/footer state for diffing.
 *
 * @param editor Editor whose converter and section XML should be read.
 * @returns Canonical header/footer snapshot for the editor.
 */
function getEditorHeaderFooters(editor: DiffServiceEditor): HeaderFooterState {
  return captureHeaderFooterState(editor);
}

function getEditorPartsState(editor: DiffServiceEditor, headerFooters: HeaderFooterState | null): PartsState {
  return capturePartsState(editor, headerFooters);
}

/**
 * Builds the canonical fingerprint input for one coverage profile.
 *
 * @param doc ProseMirror document snapshot.
 * @param comments Comment snapshot.
 * @param styles Styles snapshot.
 * @param numbering Numbering snapshot.
 * @param headerFooters Header/footer snapshot.
 * @param coverage Coverage flags that decide which components participate.
 * @returns Canonical diffable state used for fingerprinting.
 */
function buildCanonicalStateForCoverage(
  doc: PMNode,
  comments: CommentInput[],
  styles: StylesDocumentProperties | null,
  numbering: NumberingProperties | null,
  headerFooters: HeaderFooterState | null,
  partsState: PartsState | null,
  coverage: DiffCoverage,
) {
  return buildCanonicalDiffableState(
    doc,
    comments,
    styles,
    numbering,
    coverage.headerFooters ? headerFooters : null,
    coverage.headerFooters ? partsState : null,
  );
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * Captures the current editor's diffable state as a versioned snapshot.
 *
 * The payload stores **raw** document data (full comments with identity and
 * body fields intact) so that `compareToSnapshot` can feed them into
 * `computeDiff` → `diffComments` which needs `commentId`, `textJson`, and
 * `elements`. Canonicalization is used only for fingerprinting.
 */
export function captureSnapshot(editor: DiffServiceEditor): DiffSnapshot {
  const doc = editor.state.doc;
  const comments = getEditorComments(editor);
  const styles = getEditorStyles(editor);
  const numbering = getEditorNumbering(editor);
  const headerFooters = getEditorHeaderFooters(editor);
  const partsState = getEditorPartsState(editor, headerFooters);

  const canonical = buildCanonicalStateForCoverage(
    doc,
    comments,
    styles,
    numbering,
    headerFooters,
    partsState,
    V2_COVERAGE,
  );
  const fingerprint = computeFingerprint(canonical);

  return {
    version: SNAPSHOT_VERSION_V2,
    engine: ENGINE_ID,
    fingerprint,
    coverage: { ...V2_COVERAGE },
    // Deep-clone every slot so the snapshot is immutable.  doc.toJSON()
    // already returns a fresh tree; the rest are live references that would
    // drift if the editor keeps mutating after capture.
    payload: structuredClone({
      doc: doc.toJSON() as Record<string, unknown>,
      comments: comments as unknown as Record<string, unknown>[],
      styles: styles as unknown as Record<string, unknown> | null,
      numbering: numbering as unknown as Record<string, unknown> | null,
      headerFooters: headerFooters as unknown as Record<string, unknown>,
      partsState: partsState as unknown as Record<string, unknown>,
    }),
  };
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

/**
 * Compares the current editor (base) against a target snapshot.
 * Returns a versioned diff payload.
 */
export function compareToSnapshot(editor: DiffServiceEditor, targetSnapshot: DiffSnapshot): DiffPayload {
  validateEngine(targetSnapshot.engine);
  validateSnapshotVersion(targetSnapshot.version);
  validateSnapshotFingerprints(targetSnapshot);

  const expectedCoverage = getCoverageForSnapshotVersion(targetSnapshot.version);
  const targetCoverage = targetSnapshot.coverage;
  validateCoverageMatch(expectedCoverage, targetCoverage);

  // Structurally validate payload slots before use — the payload is opaque
  // and may have been deserialized from external JSON.
  validateSnapshotPayload(targetSnapshot.payload);

  const targetComments = (targetSnapshot.payload.comments ?? []) as CommentInput[];
  const targetStyles = targetSnapshot.payload.styles as StylesDocumentProperties | null;
  const targetNumbering = targetSnapshot.payload.numbering as NumberingProperties | null;
  const targetHeaderFooters = (targetSnapshot.payload.headerFooters ?? null) as HeaderFooterState | null;
  const targetPartsState = (targetSnapshot.payload.partsState ?? null) as PartsState | null;
  const targetDoc = parseDocPayload(editor.state.schema, targetSnapshot.payload.doc);

  // Re-derive target fingerprint from payload to guard against tampered wrappers.
  // Wrap in try-catch so malformed nested data (e.g. comment body nodes that
  // pass structural validation but fail during canonicalization) surfaces as
  // INVALID_INPUT rather than a raw TypeError.
  let reDerivedFingerprint: string;
  try {
    const targetCanonical = buildCanonicalStateForCoverage(
      targetDoc,
      targetComments,
      targetStyles,
      targetNumbering,
      targetHeaderFooters,
      targetSnapshot.version === SNAPSHOT_VERSION_V2 ? targetPartsState : null,
      targetCoverage,
    );
    reDerivedFingerprint = computeFingerprint(targetCanonical);
  } catch (err) {
    if (err instanceof DiffServiceError) throw err;
    throw new DiffServiceError(
      'INVALID_INPUT',
      `Snapshot payload contains malformed data that failed during canonicalization: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (reDerivedFingerprint !== targetSnapshot.fingerprint) {
    throw new DiffServiceError(
      'INVALID_INPUT',
      `Target snapshot fingerprint does not match re-derived value. The snapshot may have been tampered with.`,
    );
  }
  // Compute base fingerprint
  const baseDoc = editor.state.doc;
  const baseComments = getEditorComments(editor);
  const baseStyles = getEditorStyles(editor);
  const baseNumbering = getEditorNumbering(editor);
  const baseHeaderFooters = targetCoverage.headerFooters ? getEditorHeaderFooters(editor) : null;
  const basePartsState = targetCoverage.headerFooters ? getEditorPartsState(editor, baseHeaderFooters) : null;
  const baseCanonical = buildCanonicalStateForCoverage(
    baseDoc,
    baseComments,
    baseStyles,
    baseNumbering,
    baseHeaderFooters,
    targetSnapshot.version === SNAPSHOT_VERSION_V2 ? basePartsState : null,
    targetCoverage,
  );
  const baseFingerprint = computeFingerprint(baseCanonical);

  // Compute raw diff.  Wrap in try-catch so malformed nested comment bodies
  // (e.g. textJson that passes structural validation but fails inside
  // schema.nodeFromJSON during tokenizeCommentText) surface as INVALID_INPUT.
  let rawDiff: DiffResult;
  try {
    rawDiff = computeDiff(
      baseDoc,
      targetDoc,
      editor.state.schema,
      baseComments,
      targetComments,
      baseStyles,
      targetStyles,
      baseNumbering,
      targetNumbering,
      baseHeaderFooters,
      targetHeaderFooters,
      basePartsState,
      targetPartsState,
    );
  } catch (err) {
    if (err instanceof DiffServiceError) throw err;
    throw new DiffServiceError(
      'INVALID_INPUT',
      `Snapshot payload contains data that failed during diff computation: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const summary = buildDiffSummary(rawDiff);
  const payload = structuredClone({
    docDiffs: rawDiff.docDiffs as unknown as Record<string, unknown>[],
    commentDiffs: rawDiff.commentDiffs as unknown as Record<string, unknown>[],
    stylesDiff: rawDiff.stylesDiff as unknown as Record<string, unknown> | null,
    numberingDiff: rawDiff.numberingDiff as unknown as Record<string, unknown> | null,
    headerFootersDiff: rawDiff.headerFootersDiff as unknown as Record<string, unknown> | null,
    partsDiff: rawDiff.partsDiff as unknown as Record<string, unknown> | null,
  }) as Record<string, unknown>;

  return {
    version: getPayloadVersionForCoverage(targetCoverage),
    engine: ENGINE_ID,
    baseFingerprint,
    targetFingerprint: targetSnapshot.fingerprint,
    coverage: { ...targetCoverage },
    summary,
    // Detach the payload from editor-owned objects before returning it across
    // the API boundary. Comment diffs can otherwise retain live comment refs.
    payload,
  } as DiffPayload;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export interface ApplyOptions {
  changeMode?: 'direct' | 'tracked';
}

/** Returned by applyDiffPayload — includes the transaction for the caller to dispatch. */
export interface ApplyDiffResult {
  result: DiffApplyResult;
  tr: Transaction;
}

/**
 * Applies a previously computed diff payload against the current editor.
 *
 * Returns both the public result and the PM transaction. The caller (adapter
 * or editor command) is responsible for dispatching the transaction.
 */
export function applyDiffPayload(
  editor: DiffServiceEditor,
  diffPayload: DiffPayload,
  options?: ApplyOptions,
): ApplyDiffResult {
  validateEngine(diffPayload.engine);
  validatePayloadVersion(diffPayload.version);
  validateCoverageForPayloadVersion(diffPayload);
  validatePayloadFingerprints(diffPayload);

  // Verify base fingerprint matches current document
  const baseDoc = editor.state.doc;
  const baseComments = getEditorComments(editor);
  const baseStyles = getEditorStyles(editor);
  const baseNumbering = getEditorNumbering(editor);
  const baseHeaderFooters = getEditorHeaderFooters(editor);
  const basePartsState = getEditorPartsState(editor, baseHeaderFooters);
  const baseCanonical = buildCanonicalStateForCoverage(
    baseDoc,
    baseComments,
    baseStyles,
    baseNumbering,
    baseHeaderFooters,
    diffPayload.version === PAYLOAD_VERSION_V2 ? basePartsState : null,
    diffPayload.coverage,
  );
  const currentFingerprint = computeFingerprint(baseCanonical);

  if (currentFingerprint !== diffPayload.baseFingerprint) {
    throw new DiffServiceError(
      'PRECONDITION_FAILED',
      `Document fingerprint mismatch. Expected "${diffPayload.baseFingerprint}", got "${currentFingerprint}". ` +
        `The document may have changed since the diff was computed. Re-run diff.compare against the current state.`,
    );
  }
  // Reconstruct internal DiffResult from opaque payload with structural validation
  const rawDiff = parseDiffPayloadContents(diffPayload.payload);

  // Read the existing comments array without mutating the real editor.
  // If the converter exists but has no comments store, we use an empty
  // array for staging; the real store is only created on commit.
  const comments = editor.converter ? (Array.isArray(editor.converter.comments) ? editor.converter.comments : []) : [];

  const trackedRequested = options?.changeMode === 'tracked';
  const trackedAvailable = Boolean(editor.options?.user);

  // Reject explicitly when tracked mode is requested but unavailable.
  // Other tracked-capable mutations follow the same gate; silently
  // degrading to direct apply would break the "Doc1 + Doc2 → Doc3 with
  // tracked changes" workflow.
  if (trackedRequested && !trackedAvailable) {
    throw new DiffServiceError(
      'CAPABILITY_UNAVAILABLE',
      'Tracked change mode was requested but is not available. ' +
        'A user identity must be configured on the editor to enable tracked changes.',
    );
  }

  const tr = editor.state.tr;

  // Replay against a staging editor so the real editor is never mutated
  // unless every operation succeeds.  replayDiffs mutates comments,
  // converter state (styles, numbering, convertedXml, documentModified),
  // and emits UI events as side-effects outside the PM transaction.
  // A staging wrapper isolates all of that: events are buffered, converter
  // data is cloned, and the real editor is only touched on commit.
  const { staging, stagedComments, commit } = createStagingEditor(editor, comments);

  const replayResult: ReplayDiffsResult = replayDiffs({
    tr,
    diff: rawDiff,
    schema: editor.state.schema,
    comments: stagedComments,
    editor: staging as unknown as Parameters<typeof replayDiffs>[0]['editor'],
    trackedChangesRequested: trackedRequested,
  });

  tr.setMeta('inputType', 'programmatic');

  if (trackedRequested) {
    tr.setMeta('forceTrackChanges', true);
  } else {
    tr.setMeta('skipTrackChanges', true);
  }

  // Reject if any operations were skipped — staging editor absorbed all
  // side-effects so the real editor remains untouched.
  if (replayResult.skippedDiffs > 0) {
    throw new DiffServiceError(
      'INTERNAL_ERROR',
      `Diff apply failed: ${replayResult.skippedDiffs} operations skipped. ` +
        `Warnings: ${replayResult.warnings.join('; ')}`,
    );
  }

  // All operations succeeded — commit staged state to real editor.
  commit();

  // Re-derive summary from the actual diff data rather than trusting the
  // caller-supplied wrapper, which could be tampered.
  const verifiedSummary = buildDiffSummary(rawDiff);

  return {
    result: {
      appliedOperations: replayResult.appliedDiffs,
      baseFingerprint: diffPayload.baseFingerprint,
      targetFingerprint: diffPayload.targetFingerprint,
      coverage: { ...diffPayload.coverage },
      summary: verifiedSummary,
      diagnostics: replayResult.warnings,
    } as DiffApplyResult,
    tr,
  };
}

// ---------------------------------------------------------------------------
// Staging editor for atomic apply
// ---------------------------------------------------------------------------

/**
 * Converter properties that replay mutates as side-effects.  Only these
 * are deep-cloned for staging; everything else is passed through as a
 * read-only reference so non-cloneable live objects (mockWindow,
 * mockDocument, sub-editor entries, etc.) never hit structuredClone.
 */
const STAGED_CONVERTER_KEYS = [
  'translatedLinkedStyles',
  'translatedNumbering',
  'convertedXml',
  'numbering',
  'headers',
  'footers',
  'headerIds',
  'footerIds',
  'bodySectPr',
  'savedTagsToRestore',
  // promoteToGuid() mutates these on the converter during style/numbering
  // replay; they must be committed back since Editor.dispatch() only calls
  // promoteToGuid for body-changing transactions (tr.docChanged).
  'documentGuid',
  'documentUniqueIdentifier',
] as const;

/**
 * Creates a staging wrapper around the real editor so `replayDiffs` can run
 * without mutating any live state.
 *
 * - Events are buffered in a pending list instead of being emitted.
 * - Only the specific converter fields that replay mutates are deep-cloned;
 *   all other properties (including non-cloneable live objects) are shared
 *   read-only with the real converter via prototype delegation.
 * - The comments array is independently cloned.
 *
 * Call `commit()` after a successful replay to copy staged state back to the
 * real editor and flush buffered events.  On failure, simply discard the
 * staging wrapper — the real editor is untouched.
 */
function createStagingEditor(
  editor: DiffServiceEditor,
  comments: CommentInput[],
): { staging: DiffServiceEditor; stagedComments: CommentInput[]; commit: () => void } {
  const pendingEvents: Array<[string, unknown]> = [];
  const stagedComments = comments.map((c) => ({ ...c }));
  const stagedOptions: DiffServiceEditor['options'] = editor.options
    ? {
        ...editor.options,
        mediaFiles: editor.options.mediaFiles ? structuredClone(editor.options.mediaFiles) : editor.options.mediaFiles,
      }
    : editor.options;
  const stagedStorage: DiffServiceEditor['storage'] = editor.storage
    ? {
        ...editor.storage,
        image: editor.storage.image
          ? {
              ...editor.storage.image,
              media: editor.storage.image.media
                ? structuredClone(editor.storage.image.media)
                : editor.storage.image.media,
            }
          : editor.storage.image,
      }
    : editor.storage;

  // Build a staging converter that inherits non-mutable properties from
  // the real converter via Object.create, then deep-clones only the
  // fields that replay is known to mutate.
  let stagedConverter: DiffServiceEditor['converter'] = null;
  if (editor.converter) {
    const raw = editor.converter as Record<string, unknown>;
    const cloned = Object.create(raw) as Record<string, unknown>;

    for (const key of STAGED_CONVERTER_KEYS) {
      const val = raw[key];
      if (val !== null && val !== undefined && typeof val === 'object') {
        cloned[key] = structuredClone(val);
      }
    }

    // Replay also sets documentModified (primitive) — seed from current value
    cloned.headerFooterModified = raw.headerFooterModified;
    cloned.documentModified = raw.documentModified;
    // Point cloned converter's comments at the staged array
    cloned.comments = stagedComments;

    stagedConverter = cloned as DiffServiceEditor['converter'];
  }

  const staging: DiffServiceEditor = {
    state: editor.state,
    emit: (event: string, payload: unknown) => {
      pendingEvents.push([event, payload]);
    },
    options: stagedOptions,
    storage: stagedStorage,
    converter: stagedConverter,
  };

  function commit() {
    // Copy staged mutable fields back to the real converter
    if (editor.converter && stagedConverter) {
      const realRaw = editor.converter as Record<string, unknown>;
      const stagedRaw = stagedConverter as Record<string, unknown>;

      for (const key of STAGED_CONVERTER_KEYS) {
        realRaw[key] = stagedRaw[key];
      }
      realRaw.headerFooterModified = stagedRaw.headerFooterModified;
      realRaw.documentModified = stagedRaw.documentModified;
    }

    if (editor.options && stagedOptions && 'mediaFiles' in stagedOptions) {
      editor.options.mediaFiles = stagedOptions.mediaFiles;
    }
    if (editor.storage?.image && stagedStorage?.image) {
      editor.storage.image.media = stagedStorage.image.media;
    }

    // Apply comment mutations to the real array.  Deep-clone each entry
    // so the editor owns its comment objects outright — without this,
    // commentJSON / newCommentJSON references from the caller's diff
    // payload would leak into editor.converter.comments, allowing
    // post-return mutation of editor state.  If the real editor had no
    // comments store, create one now (deferred from applyDiffPayload to
    // avoid mutating the real editor before staging succeeds).
    const ownedComments = stagedComments.map((c) => structuredClone(c));
    if (editor.converter) {
      if (Array.isArray(editor.converter.comments)) {
        editor.converter.comments.length = 0;
        editor.converter.comments.push(...ownedComments);
      } else {
        editor.converter.comments = ownedComments;
      }
    }

    // Flush buffered events to the real editor
    for (const [event, payload] of pendingEvents) {
      editor.emit?.(event, payload);
    }
  }

  return { staging, stagedComments, commit };
}

// ---------------------------------------------------------------------------
// Payload parsing and validation
// ---------------------------------------------------------------------------

/**
 * Parses and validates a doc payload from a snapshot, turning raw JSON into
 * a ProseMirror node. Wraps `schema.nodeFromJSON` so malformed payloads
 * produce a documented `INVALID_INPUT` error instead of a raw engine exception.
 */
function parseDocPayload(schema: Schema, doc: unknown): PMNode {
  if (doc === null || doc === undefined || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new DiffServiceError('INVALID_INPUT', 'Snapshot payload.doc must be a valid document object.');
  }
  try {
    return schema.nodeFromJSON(doc);
  } catch (err) {
    throw new DiffServiceError(
      'INVALID_INPUT',
      `Snapshot payload.doc is not a valid ProseMirror document: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Parses and validates the opaque payload of a DiffPayload, returning a
 * typed DiffResult. Ensures the required array/object slots exist and are
 * the expected types so the replay layer never receives structurally invalid data.
 */
function parseDiffPayloadContents(payload: Record<string, unknown>): DiffResult {
  const docDiffs = payload.docDiffs;
  const commentDiffs = payload.commentDiffs;
  const stylesDiff = payload.stylesDiff;
  const numberingDiff = payload.numberingDiff;
  const headerFootersDiff = payload.headerFootersDiff;
  const partsDiff = payload.partsDiff;

  if (!Array.isArray(docDiffs)) {
    throw new DiffServiceError('INVALID_INPUT', 'Diff payload.docDiffs must be an array.');
  }
  if (!Array.isArray(commentDiffs)) {
    throw new DiffServiceError('INVALID_INPUT', 'Diff payload.commentDiffs must be an array.');
  }
  for (let i = 0; i < commentDiffs.length; i++) {
    validateCommentDiffEntry(commentDiffs[i], i);
  }
  if (
    stylesDiff !== null &&
    stylesDiff !== undefined &&
    (typeof stylesDiff !== 'object' || Array.isArray(stylesDiff))
  ) {
    throw new DiffServiceError('INVALID_INPUT', 'Diff payload.stylesDiff must be a plain object or null.');
  }
  if (
    numberingDiff !== null &&
    numberingDiff !== undefined &&
    (typeof numberingDiff !== 'object' || Array.isArray(numberingDiff))
  ) {
    throw new DiffServiceError('INVALID_INPUT', 'Diff payload.numberingDiff must be a plain object or null.');
  }
  if (
    headerFootersDiff !== null &&
    headerFootersDiff !== undefined &&
    (typeof headerFootersDiff !== 'object' || Array.isArray(headerFootersDiff))
  ) {
    throw new DiffServiceError('INVALID_INPUT', 'Diff payload.headerFootersDiff must be a plain object or null.');
  }
  if (partsDiff !== null && partsDiff !== undefined && (typeof partsDiff !== 'object' || Array.isArray(partsDiff))) {
    throw new DiffServiceError('INVALID_INPUT', 'Diff payload.partsDiff must be a plain object or null.');
  }

  // Deep-clone commentDiffs so replay never holds references to caller-owned
  // objects.  Without this, commentJSON/newCommentJSON pushed into
  // editor.converter.comments would be the same object references from the
  // input payload, allowing post-return mutation of editor state.
  return {
    docDiffs: docDiffs as DiffResult['docDiffs'],
    commentDiffs: structuredClone(commentDiffs) as DiffResult['commentDiffs'],
    stylesDiff: (stylesDiff ?? null) as DiffResult['stylesDiff'],
    numberingDiff: (numberingDiff ?? null) as DiffResult['numberingDiff'],
    headerFootersDiff: (headerFootersDiff ?? null) as DiffResult['headerFootersDiff'],
    partsDiff: (partsDiff ?? null) as PartsDiff | null,
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isNonNullObject(v: unknown): v is Record<string, unknown> {
  return v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v);
}

function validateCommentDiffEntry(entry: unknown, index: number): void {
  if (!isNonNullObject(entry)) {
    throw new DiffServiceError('INVALID_INPUT', `Diff payload.commentDiffs[${index}] must be a non-null object.`);
  }
  const { action, commentId, nodeType } = entry as Record<string, unknown>;
  if (nodeType !== 'comment') {
    throw new DiffServiceError('INVALID_INPUT', `Diff payload.commentDiffs[${index}].nodeType must be 'comment'.`);
  }
  if (typeof commentId !== 'string') {
    throw new DiffServiceError('INVALID_INPUT', `Diff payload.commentDiffs[${index}].commentId must be a string.`);
  }
  if (action === 'added') {
    if (!isNonNullObject((entry as Record<string, unknown>).commentJSON)) {
      throw new DiffServiceError(
        'INVALID_INPUT',
        `Diff payload.commentDiffs[${index}].commentJSON must be a non-null object for 'added' entries.`,
      );
    }
  } else if (action === 'deleted') {
    if (!isNonNullObject((entry as Record<string, unknown>).commentJSON)) {
      throw new DiffServiceError(
        'INVALID_INPUT',
        `Diff payload.commentDiffs[${index}].commentJSON must be a non-null object for 'deleted' entries.`,
      );
    }
  } else if (action === 'modified') {
    if (!isNonNullObject((entry as Record<string, unknown>).newCommentJSON)) {
      throw new DiffServiceError(
        'INVALID_INPUT',
        `Diff payload.commentDiffs[${index}].newCommentJSON must be a non-null object for 'modified' entries.`,
      );
    }
  } else {
    throw new DiffServiceError(
      'INVALID_INPUT',
      `Diff payload.commentDiffs[${index}].action must be 'added', 'deleted', or 'modified'.`,
    );
  }
}

function validateEngine(engine: string): void {
  if (engine !== ENGINE_ID) {
    throw new DiffServiceError(
      'INVALID_INPUT',
      `Unsupported engine "${engine}". This adapter only supports "${ENGINE_ID}".`,
    );
  }
}

function validateSnapshotVersion(version: string): void {
  if (version !== 'sd-diff-snapshot/v1' && version !== SNAPSHOT_VERSION_V2) {
    throw new DiffServiceError(
      'CAPABILITY_UNSUPPORTED',
      `Unsupported snapshot version "${version}". Expected "sd-diff-snapshot/v1" or "${SNAPSHOT_VERSION_V2}".`,
    );
  }
}

function validatePayloadVersion(version: string): void {
  if (version !== PAYLOAD_VERSION_V1 && version !== PAYLOAD_VERSION_V2) {
    throw new DiffServiceError(
      'CAPABILITY_UNSUPPORTED',
      `Unsupported diff version "${version}". Expected "${PAYLOAD_VERSION_V1}" or "${PAYLOAD_VERSION_V2}".`,
    );
  }
}

function validateSnapshotFingerprints(snapshot: DiffSnapshot): void {
  if (typeof snapshot.fingerprint !== 'string') {
    throw new DiffServiceError('INVALID_INPUT', 'Snapshot fingerprint must be a string.');
  }
}

function validatePayloadFingerprints(payload: DiffPayload): void {
  if (typeof payload.baseFingerprint !== 'string' || typeof payload.targetFingerprint !== 'string') {
    throw new DiffServiceError('INVALID_INPUT', 'Diff payload fingerprints must be strings.');
  }
}

function validateSnapshotPayload(payload: Record<string, unknown>): void {
  if (payload.comments !== null && payload.comments !== undefined) {
    if (!Array.isArray(payload.comments)) {
      throw new DiffServiceError('INVALID_INPUT', 'Snapshot payload.comments must be an array or null.');
    }
    for (let i = 0; i < payload.comments.length; i++) {
      const entry = payload.comments[i];
      if (entry === null || entry === undefined || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new DiffServiceError('INVALID_INPUT', `Snapshot payload.comments[${i}] must be a non-null object.`);
      }
    }
  }
  if (
    payload.styles !== null &&
    payload.styles !== undefined &&
    (typeof payload.styles !== 'object' || Array.isArray(payload.styles))
  ) {
    throw new DiffServiceError('INVALID_INPUT', 'Snapshot payload.styles must be a plain object or null.');
  }
  if (
    payload.numbering !== null &&
    payload.numbering !== undefined &&
    (typeof payload.numbering !== 'object' || Array.isArray(payload.numbering))
  ) {
    throw new DiffServiceError('INVALID_INPUT', 'Snapshot payload.numbering must be a plain object or null.');
  }
  if (
    payload.headerFooters !== null &&
    payload.headerFooters !== undefined &&
    (typeof payload.headerFooters !== 'object' || Array.isArray(payload.headerFooters))
  ) {
    throw new DiffServiceError('INVALID_INPUT', 'Snapshot payload.headerFooters must be a plain object or null.');
  }
  if (
    payload.partsState !== null &&
    payload.partsState !== undefined &&
    (typeof payload.partsState !== 'object' || Array.isArray(payload.partsState))
  ) {
    throw new DiffServiceError('INVALID_INPUT', 'Snapshot payload.partsState must be a plain object or null.');
  }
}

function validateCoverageMatch(base: DiffCoverage, target: DiffCoverage): void {
  if (!coverageEquals(base, target)) {
    throw new DiffServiceError(
      'INVALID_INPUT',
      `Coverage mismatch between base and target. Both must use the same coverage configuration.`,
    );
  }
}

function validateCoverageForPayloadVersion(diffPayload: DiffPayload): void {
  const expectedCoverage = diffPayload.version === PAYLOAD_VERSION_V1 ? V1_COVERAGE : V2_COVERAGE;
  if (!coverageEquals(diffPayload.coverage, expectedCoverage)) {
    throw new DiffServiceError(
      'INVALID_INPUT',
      `Coverage mismatch for payload version "${diffPayload.version}". ` +
        `Expected ${JSON.stringify(expectedCoverage)}, got ${JSON.stringify(diffPayload.coverage)}.`,
    );
  }
}

function getCoverageForSnapshotVersion(version: DiffSnapshot['version']): DiffCoverage {
  return version === 'sd-diff-snapshot/v1' ? V1_COVERAGE : V2_COVERAGE;
}

function getPayloadVersionForCoverage(coverage: DiffCoverage): DiffPayload['version'] {
  return coverage.headerFooters ? PAYLOAD_VERSION_V2 : PAYLOAD_VERSION_V1;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type DiffServiceErrorCode =
  | 'INVALID_INPUT'
  | 'CAPABILITY_UNSUPPORTED'
  | 'PRECONDITION_FAILED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class DiffServiceError extends Error {
  code: DiffServiceErrorCode;

  constructor(code: DiffServiceErrorCode, message: string) {
    super(message);
    this.name = 'DiffServiceError';
    this.code = code;
  }
}
