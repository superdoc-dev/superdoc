/**
 * Shared block insertion position resolver — single source of truth for
 * anchor-block boundary resolution in create operations.
 *
 * Used by both:
 * - Plan-engine `executeCreateStep` (executor.ts)
 * - Standalone `create-wrappers.ts` (for before/after target cases)
 *
 * Scope: This module centralizes **position resolution** only.
 * Node creation, ID generation, and command dispatch remain in their
 * respective call sites.
 */

import type { Editor } from '../../core/Editor.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { planError } from './errors.js';

/**
 * Resolves the PM insertion position for a create-step from an anchor block ID
 * and a position directive.
 *
 * - `'before'` → before the anchor block's opening bracket (`candidate.pos`)
 * - `'after'`  → after the anchor block's closing bracket (`candidate.pos + candidate.nodeSize`)
 *
 * @param editor - The editor instance (used to access block index)
 * @param anchorBlockId - The block ID to anchor insertion relative to
 * @param position - Whether to insert before or after the anchor block
 * @param stepId - Optional step ID for error attribution
 * @returns The absolute PM position for insertion
 */
export function resolveBlockInsertionPos(
  editor: Editor,
  anchorBlockId: string,
  position: 'before' | 'after',
  stepId?: string,
): number {
  const index = getBlockIndex(editor);
  const candidate = index.candidates.find((c) => c.nodeId === anchorBlockId);
  if (!candidate) {
    throw planError('TARGET_NOT_FOUND', `block "${anchorBlockId}" not found`, stepId);
  }
  return position === 'before' ? candidate.pos : candidate.end;
}
