/**
 * Selection range resolver — bridges live editor UI selection state to the
 * canonical Document API range model (`ResolveRangeOutput`).
 *
 * This module is the single source of truth for:
 * - what "current selection" means (live PM state.selection)
 * - what "effective selection" means (current > preserved fallback)
 * - when preserved selection is consulted
 * - which PM selection kinds are supported
 * - how a PM selection is validated and converted to absolute positions
 *
 * It does NOT scatter selection-source logic across Editor, PresentationEditor,
 * toolbar, AI, or context-menu code. All those callers delegate here.
 */

import type { Selection } from 'prosemirror-state';
import { NodeSelection } from 'prosemirror-state';
import type { ResolveRangeOutput } from '@superdoc/document-api';
import { SELECTION_EDGE_NODE_TYPES } from '@superdoc/document-api';

import type { Editor } from '../../core/Editor.js';
import { getPreservedSelection } from '../../core/selection-state.js';
import { resolveAbsoluteRange } from './range-resolver.js';
import { mapBlockNodeType } from './node-address-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EDGE_NODE_TYPES: ReadonlySet<string> = new Set(SELECTION_EDGE_NODE_TYPES);

// ---------------------------------------------------------------------------
// PM selection source policy (exported for reuse by handle resolution)
// ---------------------------------------------------------------------------

/**
 * Returns the live ProseMirror selection. No fallback, no preserved selection.
 */
export function selectCurrentPmSelection(editor: Editor): Selection {
  return editor.state.selection;
}

/**
 * Returns the "effective" PM selection — the one the UI considers actionable.
 *
 * Fallback chain:
 * 1. Live `state.selection` if non-collapsed
 * 2. PM plugin preserved selection (transaction-mapped) if present and non-empty
 * 3. Live `state.selection` (even if collapsed)
 *
 * `editor.options.preservedSelection` and `editor.options.lastSelection` are
 * intentionally excluded — they are unmapped snapshots that drift after
 * document-changing transactions.
 */
export function selectEffectivePmSelection(editor: Editor): Selection {
  const liveSelection = editor.state.selection;

  if (!liveSelection.empty) {
    return liveSelection;
  }

  const preserved = getPreservedSelection(editor.state);
  if (preserved && !preserved.empty) {
    return preserved;
  }

  return liveSelection;
}

// ---------------------------------------------------------------------------
// NodeSelection classification
// ---------------------------------------------------------------------------

type NodeSelectionClass = 'block-edge' | 'inline-leaf' | 'reject';

/**
 * Classifies a `NodeSelection` into one of three categories **before** the
 * generic position resolver runs. This prevents `resolveGapPosition` from
 * silently mis-mapping unsupported structural nodes.
 *
 * - `block-edge`: selected node maps to a supported edge node type via the
 *   adapter's `mapBlockNodeType` (not the raw PM schema name). This matters
 *   because PM `'paragraph'` can map to `'listItem'` (excluded) and PM
 *   `'structuredContentBlock'` maps to `'sdt'` (allowed).
 * - `inline-leaf`: selected node is an inline leaf inside a text block (e.g. inline image)
 * - `reject`: unsupported structural node — must throw before resolving
 */
function classifyNodeSelection(editor: Editor, selection: NodeSelection): NodeSelectionClass {
  const node = selection.node;

  // Use the adapter's mapped block type, not the raw PM schema name.
  // This ensures list paragraphs → 'listItem' (excluded) and
  // structuredContentBlock → 'sdt' (allowed) are handled correctly.
  const mappedType = mapBlockNodeType(node);
  if (mappedType && EDGE_NODE_TYPES.has(mappedType)) {
    return 'block-edge';
  }

  if (node.isLeaf && node.isInline) {
    const $pos = editor.state.doc.resolve(selection.from);
    if ($pos.parent.inlineContent) {
      return 'inline-leaf';
    }
  }

  return 'reject';
}

// ---------------------------------------------------------------------------
// PM Selection → absolute range (exported for reuse by handle resolution)
// ---------------------------------------------------------------------------

/**
 * Validates a PM selection and extracts absolute positions for range resolution.
 *
 * - `TextSelection` / `AllSelection`: use `selection.from` / `selection.to`
 * - `NodeSelection`: classify first, reject unsupported cases
 * - `CellSelection`: always reject
 */
export function extractAbsoluteRange(editor: Editor, selection: Selection): { absFrom: number; absTo: number } {
  // CellSelection — reject before any position resolution
  if ('$anchorCell' in selection) {
    throw new DocumentApiAdapterError(
      'INVALID_CONTEXT',
      'CellSelection cannot be converted to SelectionTarget. Use table-specific APIs for rectangular table selections.',
      { selectionType: selection.constructor.name },
    );
  }

  // NodeSelection — three-way classification before resolving
  if (selection instanceof NodeSelection) {
    const classification = classifyNodeSelection(editor, selection);
    if (classification === 'reject') {
      const mappedType = mapBlockNodeType(selection.node);
      const displayType = mappedType ?? selection.node.type.name;
      throw new DocumentApiAdapterError(
        'INVALID_CONTEXT',
        `NodeSelection for node type "${displayType}" cannot be converted to SelectionTarget.`,
        { nodeType: displayType, pmNodeType: selection.node.type.name },
      );
    }
    // block-edge and inline-leaf both proceed with selection.from / selection.to
  }

  return { absFrom: selection.from, absTo: selection.to };
}

// ---------------------------------------------------------------------------
// PM Selection → ResolveRangeOutput (shared pipeline)
// ---------------------------------------------------------------------------

/**
 * Validates a PM selection, extracts positions, and builds a full
 * `ResolveRangeOutput`. This is the shared pipeline used by both
 * snapshot methods and handle resolution.
 */
export function resolvePmSelectionToRange(editor: Editor, selection: Selection): ResolveRangeOutput {
  const { absFrom, absTo } = extractAbsoluteRange(editor, selection);
  return resolveAbsoluteRange(editor, { absFrom, absTo });
}

// ---------------------------------------------------------------------------
// Public snapshot API
// ---------------------------------------------------------------------------

/**
 * Resolves the live PM `state.selection` into a `ResolveRangeOutput`.
 *
 * Does NOT consult preserved selection or any fallback — returns exactly what
 * the current PM selection describes.
 *
 * This is a convenience wrapper: captures the current selection and resolves
 * immediately. For deferred flows, use `captureCurrentSelectionHandle` instead.
 */
export function resolveCurrentEditorSelectionRange(editor: Editor): ResolveRangeOutput {
  const selection = selectCurrentPmSelection(editor);
  return resolvePmSelectionToRange(editor, selection);
}

/**
 * Resolves the "effective" selection into a `ResolveRangeOutput`.
 *
 * The effective selection is what the UI considers actionable for commands:
 * - a non-collapsed live selection wins
 * - otherwise, the transaction-mapped preserved selection from the
 *   custom-selection PM plugin is used (if present and non-empty)
 * - otherwise, the current (possibly collapsed) live selection is returned
 *
 * This is a convenience wrapper: captures the effective selection and resolves
 * immediately. For deferred flows, use `captureEffectiveSelectionHandle` instead.
 */
export function resolveEffectiveEditorSelectionRange(editor: Editor): ResolveRangeOutput {
  const selection = selectEffectivePmSelection(editor);
  return resolvePmSelectionToRange(editor, selection);
}
