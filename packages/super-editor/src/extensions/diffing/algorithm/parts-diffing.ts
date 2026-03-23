/**
 * Generic part-level diff payload.
 *
 * This is intentionally coarse-grained: callers can upsert or delete
 * normalized parts without requiring OOXML tree diffs.
 */
export interface PartsDiff {
  upserts: Record<
    string,
    | {
        kind: 'xml';
        content: Record<string, unknown>;
      }
    | {
        kind: 'binary';
        encoding: 'base64';
        content: string;
      }
  >;
  deletes: string[];
}

/**
 * Placeholder parts diff computation.
 *
 * The first implementation slice only threads partsDiff through the
 * diff/replay pipeline so later changes can populate it without reshaping
 * the service contract again.
 */
export function diffParts(): PartsDiff | null {
  return null;
}
