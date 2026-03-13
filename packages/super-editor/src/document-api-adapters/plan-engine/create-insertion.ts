/**
 * Shared block insertion position resolver — single source of truth for
 * anchor-block boundary resolution in create operations.
 *
 * Used by both:
 * - Plan-engine `executeCreateStep` (executor.ts)
 * - Standalone `create-wrappers.ts` (for before/after target cases)
 *
 * Scope: This module centralizes **position resolution** and **pre-flight
 * nodeType validation** for create-like operations.
 * Node creation, ID generation, and command dispatch remain in their
 * respective call sites.
 */

import type { BlockNodeAddress } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { findBlockByNodeIdOnly, type BlockCandidate } from '../helpers/node-address-resolver.js';
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

// ---------------------------------------------------------------------------
// Pre-flight validated anchor resolution for create-like operations
// ---------------------------------------------------------------------------

export type ResolvedCreateAnchor = {
  pos: number;
  anchor: BlockCandidate;
};

/**
 * Resolves the insertion position for a create-like operation with
 * pre-flight nodeType validation.
 *
 * Uses {@link findBlockByNodeIdOnly} for alias-aware, ambiguity-safe lookup.
 * When the caller specifies a `nodeType` on the target, the resolved block's
 * actual type must match — otherwise an `INVALID_TARGET` error is thrown with
 * structured remediation details.
 *
 * **Do NOT use this for plan-engine steps** — those use
 * {@link resolveBlockInsertionPos} directly because the plan step ID
 * attribution requires a different error shape.
 */
export function resolveCreateAnchor(
  editor: Editor,
  target: BlockNodeAddress,
  position: 'before' | 'after',
  stepId?: string,
): ResolvedCreateAnchor {
  const index = getBlockIndex(editor);

  let candidate: BlockCandidate;
  try {
    candidate = findBlockByNodeIdOnly(index, target.nodeId);
  } catch (e) {
    // Re-wrap as a planError so callers get consistent error shapes with stepId
    if (e instanceof Error && 'code' in e) {
      throw planError((e as { code: string }).code, e.message, stepId, (e as { details?: unknown }).details);
    }
    throw e;
  }

  if (target.nodeType && candidate.nodeType !== target.nodeType) {
    const remediation =
      candidate.nodeType === 'listItem'
        ? 'Use lists.insert to add an item to a list sequence.'
        : `The block is a ${candidate.nodeType}, not a ${target.nodeType}.`;

    throw planError(
      'INVALID_TARGET',
      `Expected ${target.nodeType}:${target.nodeId} but found ${candidate.nodeType}:${candidate.nodeId}.`,
      stepId,
      {
        requestedNodeType: target.nodeType,
        actualNodeType: candidate.nodeType,
        nodeId: target.nodeId,
        remediation,
      },
    );
  }

  const pos = position === 'before' ? candidate.pos : candidate.end;
  return { pos, anchor: candidate };
}
