/**
 * Canonical tracked-change snapshot — the single shape every downstream
 * consumer (sidebar, navigation, document-api list/get, review tools) reads
 * from the {@link TrackedChangeIndex}.
 */

import type {
  StoryLocator,
  TrackedChangeAddress,
  TrackChangeType,
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
  /** Human-readable label for sidebar cards ("Footer · Section 3", "Footnote 12"). */
  storyLabel: string;
  /** Coarse classifier for UI decisions (icon, label). */
  storyKind: 'body' | 'headerFooter' | 'footnote' | 'endnote';
  /** Canonical shared-map anchor key (`tc::<storyKey>::<rawId>`). */
  anchorKey: string;
  /** Absolute PM position range within the story editor. */
  range: { from: number; to: number };
}
