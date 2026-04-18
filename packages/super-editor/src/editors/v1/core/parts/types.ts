/**
 * Core type definitions for the centralized document parts system.
 *
 * All non-`word/document.xml` part mutations route through this system.
 * Canonical storage is OOXML JSON per part — no alternate domain models.
 */

import type { Editor } from '../Editor.js';

// ---------------------------------------------------------------------------
// Part Identity
// ---------------------------------------------------------------------------

/** Full OOXML zip path. No aliases, no short names, no enums. */
export type PartId = `${string}.xml` | `${string}.rels` | '[Content_Types].xml';

/** Relationship ID scoping a part family instance (headers, footers). Undefined for single-instance parts. */
export type PartSectionId = string | undefined;

// ---------------------------------------------------------------------------
// Part Descriptor
// ---------------------------------------------------------------------------

/** Commit context passed to afterCommit hooks. */
export interface CommitContext<TPart = unknown> {
  editor: Editor;
  partId: PartId;
  sectionId: PartSectionId;
  part: TPart;
  source: string;
}

/** Delete context passed to onDelete hooks. */
export interface DeleteContext {
  editor: Editor;
  partId: PartId;
  sectionId: PartSectionId;
  part: unknown;
  source: string;
}

/**
 * Declarative descriptor for a document part.
 *
 * Hooks are added progressively as migration phases land:
 *   Phase 0: id, ensurePart
 *   Phase 1: afterCommit (derived model sync for styles)
 *   Phase 3: normalizePart (ordering invariants for numbering)
 *   Phase 4: afterCommit, onDelete (header/footer lifecycle)
 *   Phase 6: validatePart (hardening)
 */
export interface PartDescriptor<TPart = unknown> {
  id: PartId;
  ensurePart: (editor: Editor, sectionId?: string) => TPart;
  validatePart?: (part: unknown) => asserts part is TPart;
  normalizePart?: (part: TPart) => TPart | void;
  afterCommit?: (ctx: CommitContext<TPart>) => void;
  onDelete?: (ctx: DeleteContext) => void;
}

// ---------------------------------------------------------------------------
// Mutation Requests
// ---------------------------------------------------------------------------

/** Mutate (update) an existing part. */
export interface MutatePartRequest<TPart = unknown, TResult = unknown> {
  editor: Editor;
  partId: PartId;
  sectionId?: PartSectionId;
  operation: 'mutate';
  source: string;
  dryRun?: boolean;
  expectedRevision?: string;
  mutate: (ctx: { part: TPart; dryRun: boolean }) => TResult;
}

/** Create a new part. */
export interface CreatePartRequest<TPart = unknown> {
  editor: Editor;
  partId: PartId;
  sectionId?: PartSectionId;
  operation: 'create';
  source: string;
  dryRun?: boolean;
  expectedRevision?: string;
  initial: TPart;
}

/** Delete an existing part. */
export interface DeletePartRequest {
  editor: Editor;
  partId: PartId;
  sectionId?: PartSectionId;
  operation: 'delete';
  source: string;
  dryRun?: boolean;
  expectedRevision?: string;
}

/** Any single-part operation. */
export type PartOperation = MutatePartRequest | CreatePartRequest | DeletePartRequest;

// ---------------------------------------------------------------------------
// Multi-Part Transaction
// ---------------------------------------------------------------------------

export interface MutatePartsRequest {
  editor: Editor;
  source: string;
  dryRun?: boolean;
  expectedRevision?: string;
  operations: PartOperation[];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface MutatePartResult<TResult = unknown> {
  changed: boolean;
  changedPaths: string[];
  /** True if the mutation committed but an `afterCommit` hook failed. */
  degraded: boolean;
  result: TResult;
}

export interface MutatePartsResult {
  changed: boolean;
  /** True if the mutation committed but an `afterCommit` hook failed. */
  degraded: boolean;
  parts: Array<{
    partId: PartId;
    operation: 'mutate' | 'create' | 'delete';
    changed: boolean;
    changedPaths: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface PartChangedEvent {
  parts: Array<{
    partId: PartId;
    sectionId?: PartSectionId;
    operation: 'mutate' | 'create' | 'delete';
    changedPaths: string[];
  }>;
  source: string;
  degraded?: boolean;
}
