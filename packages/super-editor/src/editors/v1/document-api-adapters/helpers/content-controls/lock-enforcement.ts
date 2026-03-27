/**
 * Lock enforcement and type guards for content control mutations.
 *
 * Centralized lock-check logic used by all mutation wrappers.
 * The plan mandates that lock checks happen pre-apply (before PM dispatch),
 * throwing LOCK_VIOLATION for locks and TYPE_MISMATCH for type guards.
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
