/**
 * Placement and nesting policy types for structural insert/replace operations.
 */

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** Where to place structural content relative to the target. */
export type Placement = 'before' | 'after' | 'insideStart' | 'insideEnd';

/** Valid placement values for runtime validation. */
export const PLACEMENT_VALUES: ReadonlySet<string> = new Set<Placement>([
  'before',
  'after',
  'insideStart',
  'insideEnd',
]);

/** Default placement for structural insert when not specified. */
export const DEFAULT_PLACEMENT: Placement = 'after';

// ---------------------------------------------------------------------------
// Nesting policy
// ---------------------------------------------------------------------------

/** Policy controlling whether nested tables are permitted. */
export type TableNestingPolicy = 'forbid' | 'allow';

/** Valid table nesting policy values for runtime validation. */
export const TABLE_NESTING_POLICY_VALUES: ReadonlySet<string> = new Set<TableNestingPolicy>(['forbid', 'allow']);

/** Policy object for controlling structural nesting behavior. */
export interface NestingPolicy {
  tables?: TableNestingPolicy;
}

/** Default nesting policy: nested tables are forbidden. */
export const DEFAULT_NESTING_POLICY: Readonly<Required<NestingPolicy>> = Object.freeze({
  tables: 'forbid',
});

// ---------------------------------------------------------------------------
// Structural failure codes
// ---------------------------------------------------------------------------

/**
 * Failure codes specific to structural placement violations.
 * These extend the existing ReceiptFailureCode vocabulary.
 */
export type StructuralFailureCode = 'INVALID_NESTING' | 'INVALID_PLACEMENT' | 'EMPTY_FRAGMENT' | 'INVALID_FRAGMENT';
