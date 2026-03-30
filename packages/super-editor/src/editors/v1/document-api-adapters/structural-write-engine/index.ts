/**
 * Structural write engine — core engine for SDFragment materialization.
 *
 * This is the single canonical execution path for all structural writes.
 * Both direct structural insert/replace AND legacy string-based operations
 * (when converted to SDFragment internally) route through here.
 *
 * Architecture:
 *   SDFragment     → fragment-validator → nesting-guard → node-materializer → PM transaction
 *   TargetSelector → target-resolver → placement-resolver → insertion position
 */

import type { SDFragment, SDContentNode, NestingPolicy, Placement } from '@superdoc/document-api';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import { materializeFragment, type SDWriteOp } from './node-materializer.js';
import { resolveInsertTarget, resolveReplaceTarget, type StructuralTarget } from './target-resolver.js';
import { resolvePlacement } from './placement-resolver.js';
import { enforceNestingPolicy } from './nesting-guard.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { applyTrackedMutationMeta, applyDirectMutationMeta } from '../helpers/transaction-meta.js';
import { resolveSectionProjections } from '../helpers/sections-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options for structural insert. */
export interface StructuralInsertOptions {
  target?: StructuralTarget;
  content: SDFragment;
  placement?: Placement;
  nestingPolicy?: NestingPolicy;
  /** Tracked or direct mode. When 'tracked', the transaction carries tracked-change metadata. */
  changeMode?: 'direct' | 'tracked';
  /** When true, runs all validation (target resolution, materialization, nesting policy) but skips the transaction dispatch. */
  dryRun?: boolean;
}

/** Options for structural replace. */
export interface StructuralReplaceOptions {
  target: StructuralTarget;
  content: SDFragment;
  nestingPolicy?: NestingPolicy;
  /** Tracked or direct mode. When 'tracked', the transaction carries tracked-change metadata. */
  changeMode?: 'direct' | 'tracked';
  /** When true, runs all validation (target resolution, materialization, nesting policy) but skips the transaction dispatch. */
  dryRun?: boolean;
  /**
   * Pre-resolved replacement range. When present, skips single-block target
   * resolution and uses this range directly. Used by the wrapper for
   * multi-block locators (SelectionTarget spanning blocks, multi-segment refs).
   */
  resolvedRange?: { from: number; to: number };
}

/** Result of a structural write operation. */
export interface StructuralWriteResult {
  success: boolean;
  insertedBlockIds: string[];
}

/**
 * Executes a structural insert: materializes an SDFragment and inserts
 * it at the resolved position in the ProseMirror document.
 */
export function executeStructuralInsert(editor: Editor, options: StructuralInsertOptions): StructuralWriteResult {
  const { content, placement, nestingPolicy, target, changeMode, dryRun } = options;
  const schema = editor.state.schema;

  // 1. Resolve target position
  const resolved = resolveInsertTarget(editor, target);

  // 2. Determine insertion position — apply placement if a target node is available
  let insertPos: number;
  if (resolved.targetNode && resolved.targetNodePos !== undefined) {
    insertPos = resolvePlacement(editor.state.doc, resolved.targetNodePos, resolved.targetNode, placement);
  } else {
    insertPos = resolved.insertPos;
  }

  // 3. Validate section references in the fragment
  validateSectionReferences(editor, content);

  // 4. Materialize fragment with ID lifecycle enforcement
  const existingDocIds = collectExistingBlockIds(editor.state.doc);
  const pmFragment = materializeFragment(schema, content, existingDocIds, 'insert' satisfies SDWriteOp);

  // 5. Enforce nesting policy
  enforceNestingPolicy(content, editor.state.doc, insertPos, nestingPolicy);

  // 6. Collect block IDs from materialized nodes
  const insertedBlockIds = collectBlockIds(pmFragment);

  // Dry-run: all validation passed — return without mutating the document.
  if (dryRun) {
    return { success: true, insertedBlockIds };
  }

  // 7. Apply to editor via transaction with appropriate change mode metadata
  const tr = editor.state.tr.insert(insertPos, pmFragment);
  applyChangeModeMeta(tr, changeMode);
  editor.dispatch(tr);

  // 8. Invalidate index cache
  clearIndexCache(editor);

  return { success: true, insertedBlockIds };
}

/**
 * Executes a structural replace: materializes an SDFragment and replaces
 * the target block in the ProseMirror document.
 *
 * Target resolution uses block-level addressing: the entire block node
 * (from pos to pos + nodeSize) is replaced, not just its text content.
 */
export function executeStructuralReplace(editor: Editor, options: StructuralReplaceOptions): StructuralWriteResult {
  const { content, nestingPolicy, target, changeMode, dryRun, resolvedRange } = options;
  const schema = editor.state.schema;

  // 1. Resolve target range — use pre-resolved range for multi-block locators,
  //    otherwise resolve from the single-block TextAddress target.
  const resolved = resolvedRange
    ? { from: resolvedRange.from, to: resolvedRange.to, effectiveTarget: target }
    : resolveReplaceTarget(editor, target);

  // 2. Validate section references in the fragment
  validateSectionReferences(editor, content);

  // 3. Materialize fragment with ID lifecycle enforcement
  const existingDocIds = collectExistingBlockIds(editor.state.doc);
  const pmFragment = materializeFragment(schema, content, existingDocIds, 'replace' satisfies SDWriteOp);

  // 4. Enforce nesting policy at the replacement position
  enforceNestingPolicy(content, editor.state.doc, resolved.from, nestingPolicy);

  // 5. Collect block IDs
  const insertedBlockIds = collectBlockIds(pmFragment);

  // Dry-run: all validation passed — return without mutating the document.
  if (dryRun) {
    return { success: true, insertedBlockIds };
  }

  // 6. Apply replacement via transaction with appropriate change mode metadata
  const tr = editor.state.tr.replaceWith(resolved.from, resolved.to, pmFragment);
  applyChangeModeMeta(tr, changeMode);
  editor.dispatch(tr);

  // 7. Invalidate index cache
  clearIndexCache(editor);

  return { success: true, insertedBlockIds };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates that any sectionBreak nodes in the fragment reference valid section IDs.
 * Contextual validation rule 15: sectionBreak.targetSectionId must reference
 * a valid section ID in the document's section catalog.
 */
function validateSectionReferences(editor: Editor, fragment: SDFragment): void {
  const nodes = Array.isArray(fragment) ? fragment : [fragment];
  const sectionRefIds = collectSectionRefIds(nodes);
  if (sectionRefIds.length === 0) return;

  const projections = resolveSectionProjections(editor);
  const validIds = new Set(projections.map((p) => p.sectionId));

  for (const refId of sectionRefIds) {
    if (!validIds.has(refId)) {
      throw new DocumentApiAdapterError(
        'INVALID_CONTEXT',
        `sectionBreak.targetSectionId "${refId}" does not reference a valid section.`,
      );
    }
  }
}

/** Recursively collects targetSectionId values from sectionBreak nodes at any depth. */
function collectSectionRefIds(nodes: SDContentNode[]): string[] {
  const refIds: string[] = [];
  const visit = (children: SDContentNode[]) => {
    for (const node of children) {
      if (node.kind === 'sectionBreak' && 'sectionBreak' in node) {
        const payload = (node as { sectionBreak: { targetSectionId?: string } }).sectionBreak;
        if (payload.targetSectionId) {
          refIds.push(payload.targetSectionId);
        }
      }
      // Recurse into container nodes
      if (node.kind === 'list') {
        for (const item of node.list.items) {
          visit(item.content);
        }
      } else if (node.kind === 'table') {
        for (const row of node.table.rows) {
          for (const cell of row.cells) {
            visit(cell.content);
          }
        }
      } else if (node.kind === 'sdt' && node.sdt.content) {
        visit(node.sdt.content);
      } else if (node.kind === 'customXml' && node.customXml.content) {
        visit(node.customXml.content);
      }
    }
  };
  visit(nodes);
  return refIds;
}

/** Scans the editor document for all existing sdBlockId attributes. */
function collectExistingBlockIds(doc: ProseMirrorNode): ReadonlySet<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    const sdBlockId = node.attrs?.sdBlockId;
    if (typeof sdBlockId === 'string' && sdBlockId) {
      ids.add(sdBlockId);
    }
    return true;
  });
  return ids;
}

/** Applies the appropriate tracked/direct metadata to a transaction. */
function applyChangeModeMeta(tr: import('prosemirror-state').Transaction, changeMode?: 'direct' | 'tracked'): void {
  if (changeMode === 'tracked') {
    applyTrackedMutationMeta(tr);
  } else {
    applyDirectMutationMeta(tr);
  }
}

/** Extracts sdBlockId attributes from a ProseMirror Fragment's child nodes. */
function collectBlockIds(fragment: { childCount: number; child: (index: number) => ProseMirrorNode }): string[] {
  const ids: string[] = [];
  for (let i = 0; i < fragment.childCount; i++) {
    const node = fragment.child(i);
    const sdBlockId = node.attrs?.sdBlockId;
    if (typeof sdBlockId === 'string') {
      ids.push(sdBlockId);
    }
  }
  return ids;
}

// Re-export submodules for direct access
export { materializeFragment } from './node-materializer.js';
export { resolveInsertTarget, resolveReplaceTarget } from './target-resolver.js';
export { resolvePlacement } from './placement-resolver.js';
export { enforceNestingPolicy } from './nesting-guard.js';
