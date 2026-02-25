/**
 * Shared types and helpers for the standardized discovery envelope.
 *
 * All discovery operations (query.match, comments.list, trackChanges.list,
 * lists.list, find) return a `DiscoveryResult<DiscoveryItem<TDomain>>` —
 * a uniform envelope with pagination, revision tracking, and mutation-ready
 * handles.
 *
 * See plans/master-api-unification-plan.md for design rationale.
 */

// ---------------------------------------------------------------------------
// Target kinds
// ---------------------------------------------------------------------------

export type KnownTargetKind =
  | 'text'
  | 'node'
  | 'list'
  | 'comment'
  | 'trackedChange'
  | 'table'
  | 'tableCell'
  | 'section'
  | 'sdt'
  | 'field';

export type ExtensionTargetKind = `ext:${string}`;

export type TargetKind = KnownTargetKind | ExtensionTargetKind;

// ---------------------------------------------------------------------------
// Resolved handle — mutation-ready reference
// ---------------------------------------------------------------------------

export type RefStability = 'stable' | 'ephemeral';

export interface ResolvedHandle {
  /** Mutation-ready ref string (e.g., V3 encoded ref, stable nodeId, 'comment:<id>'). */
  ref: string;
  /** Whether the ref survives across revisions. */
  refStability: RefStability;
  /** Semantic type of the target this handle points to. */
  targetKind: TargetKind;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PageInfo {
  /** Maximum items requested per page. */
  limit: number;
  /** Zero-based offset into the total result set. */
  offset: number;
  /** Actual number of items returned in this page. Invariant: `returned === items.length`. */
  returned: number;
}

// ---------------------------------------------------------------------------
// Discovery item + result
// ---------------------------------------------------------------------------

/**
 * A single discoverable entity with a mutation-ready handle and domain payload.
 *
 * `TDomain` carries the operation-specific fields (e.g., `snippet`, `address`,
 * `blocks` for query.match; `status`, `text` for comments.list).
 */
export type DiscoveryItem<TDomain> = {
  /** Deterministic identity, scoped to the evaluated revision. */
  id: string;
  /** Mutation-ready handle for chaining into `mutations.apply` or direct operations. */
  handle: ResolvedHandle;
} & TDomain;

/**
 * Standard discovery result envelope returned by all discovery operations.
 *
 * Provides revision tracking, total count, paginated items, and page metadata.
 */
export interface DiscoveryResult<TItem> {
  /** Document revision at which the query was evaluated. */
  evaluatedRevision: string;
  /** Total number of matching entities (before pagination). */
  total: number;
  /** Paginated list of discovery items. */
  items: TItem[];
  /** Pagination metadata. Invariant: `page.returned === items.length`. */
  page: PageInfo;
}

/**
 * Convenience alias: `DiscoveryResult` wrapping `DiscoveryItem<TDomain>`.
 *
 * This is the return type of every standardized discovery operation.
 */
export type DiscoveryOutput<TDomain> = DiscoveryResult<DiscoveryItem<TDomain>>;

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

/**
 * Constructs a {@link ResolvedHandle}.
 */
export function buildResolvedHandle(ref: string, refStability: RefStability, targetKind: TargetKind): ResolvedHandle {
  return { ref, refStability, targetKind };
}

/**
 * Constructs a {@link DiscoveryItem} from an id, handle, and domain payload.
 */
export function buildDiscoveryItem<TDomain>(
  id: string,
  handle: ResolvedHandle,
  domain: TDomain,
): DiscoveryItem<TDomain> {
  return { id, handle, ...domain };
}

/**
 * Constructs a {@link DiscoveryResult} with invariant enforcement.
 *
 * @throws {Error} if `page.returned !== items.length`
 */
export function buildDiscoveryResult<TItem>(params: {
  evaluatedRevision: string;
  total: number;
  items: TItem[];
  page: PageInfo;
}): DiscoveryResult<TItem> {
  if (params.page.returned !== params.items.length) {
    throw new Error(
      `DiscoveryResult invariant violated: page.returned (${params.page.returned}) !== items.length (${params.items.length})`,
    );
  }
  return {
    evaluatedRevision: params.evaluatedRevision,
    total: params.total,
    items: params.items,
    page: params.page,
  };
}

/**
 * Derives a mutation target from a discovery item, suitable for passing to
 * `mutations.apply` step `where` clauses.
 */
export function toMutationTarget(
  item: DiscoveryItem<unknown>,
  evaluatedRevision: string,
): { where: { by: 'ref'; ref: string }; expectedRevision: string } {
  return {
    where: { by: 'ref', ref: item.handle.ref },
    expectedRevision: evaluatedRevision,
  };
}
