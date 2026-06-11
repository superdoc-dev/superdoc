/**
 * Lock enforcement and type guards for content control mutations.
 *
 * Centralized lock-check logic used by all mutation wrappers.
 * The plan mandates that lock checks happen pre-apply (before PM dispatch),
 * throwing LOCK_VIOLATION for locks and TYPE_MISMATCH for type guards.
 *
 * ## Lock Mode Semantics
 *
 * The ECMA-376 lock modes define restrictions for interactive (UI) editing:
 * - `unlocked` — no restrictions
 * - `sdtLocked` — cannot delete the wrapper (content editable)
 * - `contentLocked` — cannot edit content interactively (can delete wrapper)
 * - `sdtContentLocked` — cannot delete wrapper OR edit content
 *
 * ## Document API Bypass for contentLocked (SD-3429)
 *
 * The Document API allows programmatic updates to `contentLocked` SDTs via
 * whole-node replacement. This is an intentional asymmetry:
 *
 * - **Interactive editing** — blocked by the lock plugin's `filterTransaction`
 *   which rejects inner-content modifications
 * - **Programmatic (Document API)** — allowed via `replaceEntireSdt` which
 *   replaces the entire SDT node (wrapper + content). The lock plugin permits
 *   this because the step covers the full node range (wrapper-level, not content-level).
 *
 * This enables use cases where template authors lock fields to prevent user typing
 * but still need automated systems to populate values programmatically.
 *
 * `sdtContentLocked` remains fully blocked for both interactive and programmatic
 * mutations via `assertNotFullyLocked`.
 */

import type { ContentControlType } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../../errors.js';
import type { ResolvedSdt } from './target-resolution.js';
import { resolveControlType, resolveLockMode } from './sdt-info-builder.js';

// ---------------------------------------------------------------------------
// Lock assertions
// ---------------------------------------------------------------------------

/**
 * Assert that the SDT wrapper itself is not locked (sdtLocked / sdtContentLocked).
 * Used before operations that modify or remove the wrapper (unwrap, delete, move, patch, etc.).
 */
export function assertNotSdtLocked(sdt: ResolvedSdt, operation: string): void {
  const mode = resolveLockMode(sdt.node.attrs as Record<string, unknown>);
  if (mode === 'sdtLocked' || mode === 'sdtContentLocked') {
    throw new DocumentApiAdapterError(
      'LOCK_VIOLATION',
      `Content control "${sdt.node.attrs.id}" has lock mode "${mode}" which prevents ${operation}.`,
      { lockMode: mode, operation },
    );
  }
}

/**
 * Assert that the SDT content is not locked (contentLocked / sdtContentLocked).
 * Used before operations that modify content within the wrapper.
 */
export function assertNotContentLocked(sdt: ResolvedSdt, operation: string): void {
  const mode = resolveLockMode(sdt.node.attrs as Record<string, unknown>);
  if (mode === 'contentLocked' || mode === 'sdtContentLocked') {
    throw new DocumentApiAdapterError(
      'LOCK_VIOLATION',
      `Content control "${sdt.node.attrs.id}" has lock mode "${mode}" which prevents ${operation}.`,
      { lockMode: mode, operation },
    );
  }
}

/**
 * Assert that the SDT is not fully locked (sdtContentLocked).
 *
 * This is the check for Document API content mutations. It intentionally allows
 * `contentLocked` SDTs to be updated programmatically via whole-node replacement
 * (see file-level docs for SD-3429 rationale).
 *
 * Only `sdtContentLocked` is blocked — this mode indicates the author explicitly
 * prohibited all modifications, including programmatic ones.
 */
export function assertNotFullyLocked(sdt: ResolvedSdt, operation: string): void {
  const mode = resolveLockMode(sdt.node.attrs as Record<string, unknown>);
  if (mode === 'sdtContentLocked') {
    throw new DocumentApiAdapterError(
      'LOCK_VIOLATION',
      `Content control "${sdt.node.attrs.id}" has lock mode "${mode}" which prevents ${operation}.`,
      { lockMode: mode, operation },
    );
  }
}

/**
 * Check if the SDT requires whole-node replacement for content updates.
 * `contentLocked` SDTs block inner-content modifications but allow replacing
 * the entire node (wrapper + content), which preserves attrs including id.
 */
export function requiresWholeNodeReplacement(sdt: ResolvedSdt): boolean {
  const mode = resolveLockMode(sdt.node.attrs as Record<string, unknown>);
  return mode === 'contentLocked';
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Assert that the SDT has an expected control type.
 * Throws TYPE_MISMATCH when the actual type does not match.
 */
export function assertControlType(
  sdt: ResolvedSdt,
  expected: ContentControlType | ContentControlType[],
  operation: string,
): void {
  const actual = resolveControlType(sdt.node.attrs as Record<string, unknown>);
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(actual)) {
    throw new DocumentApiAdapterError(
      'TYPE_MISMATCH',
      `Operation "${operation}" requires control type ${allowed.join(' or ')}, but found "${actual}".`,
      { expected: allowed, actual, operation },
    );
  }
}
