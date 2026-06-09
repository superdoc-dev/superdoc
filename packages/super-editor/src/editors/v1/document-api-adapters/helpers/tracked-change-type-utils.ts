import type { TrackChangeType } from '@superdoc/document-api';

export type InternalTrackChangeType = TrackChangeType | 'structural';
export type InternalTrackChangeSubtype = 'table-insert' | 'table-delete';
export type InternalStructuralChangeSide = 'insertion' | 'deletion';

type StructuralDescriptor =
  | {
      subtype?: InternalTrackChangeSubtype;
      side?: InternalStructuralChangeSide;
    }
  | null
  | undefined;

/**
 * Keep structural tracked changes internal-only while preserving the stable
 * public document-api union.
 */
export function projectInternalTrackChangeType(
  type: InternalTrackChangeType,
  structural?: StructuralDescriptor,
): TrackChangeType {
  if (type !== 'structural') return type;
  if (structural?.subtype === 'table-delete' || structural?.side === 'deletion') return 'delete';
  return 'insert';
}
