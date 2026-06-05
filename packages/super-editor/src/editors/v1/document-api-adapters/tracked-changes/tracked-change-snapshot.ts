/**
 * Canonical tracked-change snapshot — the single shape every downstream
 * consumer (sidebar, navigation, document-api list/get, review tools) reads
 * from the {@link TrackedChangeIndex}.
 */

import type {
  StoryLocator,
  TrackedChangeAddress,
  TrackChangeProvenanceOrigin,
  TrackChangeType,
  TrackChangeSubtype,
  TrackChangeOverlapInfo,
  TrackChangeWordRevisionIds,
} from '@superdoc/document-api';
import type { TrackedChangeRuntimeRef } from '../helpers/tracked-change-runtime-ref.js';

export interface TrackedChangeSnapshot {
  /** Public, story-aware address for contract use. */
  address: TrackedChangeAddress;
  /** Internal runtime ref for routing and caching. */
  runtimeRef: TrackedChangeRuntimeRef;
  /** Story locator for this snapshot. */
  story: StoryLocator;
  /** Tracked-change kind. */
  type: TrackChangeType;
  /** Finer classification for structural changes (e.g. `table-insert`). */
  subtype?: TrackChangeSubtype;
  /** Author display name, if captured on the mark. */
  author?: string;
  /** Author email, if captured. */
  authorEmail?: string;
  /** Author avatar URL, if captured. */
  authorImage?: string;
  /** Change creation timestamp, if captured. */
  date?: string;
  /** Short textual excerpt for sidebar display. */
  excerpt?: string;
  /** Raw imported Word revision IDs, if present. */
  wordRevisionIds?: TrackChangeWordRevisionIds;
  /** Source application or package family detected on import. */
  origin?: TrackChangeProvenanceOrigin;
  /** True when this tracked change came from an imported document revision. */
  imported?: boolean;
  /** Overlap metadata for nested tracked changes that share the same text range. */
  overlap?: TrackChangeOverlapInfo;
  /** Human-readable label for sidebar cards ("Footer · Section 3", "Footnote 12"). */
  storyLabel: string;
  /** Coarse classifier for UI decisions (icon, label). */
  storyKind: 'body' | 'headerFooter' | 'footnote' | 'endnote';
  /** Canonical shared-map anchor key (`tc::<storyKey>::<rawId>`). */
  anchorKey: string;
  /** Internal raw command id when distinct from the story-level raw id. */
  commandRawId?: string;
  /** Replacement metadata used by public projection helpers. */
  replacementGroupId?: string;
  replacementSideId?: string;
  /** Raw grouped-change shape retained for projection logic. */
  hasInsert: boolean;
  hasDelete: boolean;
  hasFormat: boolean;
  /** Absolute PM position range within the story editor. */
  range: { from: number; to: number };
}
