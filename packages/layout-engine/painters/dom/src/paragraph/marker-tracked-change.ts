// Plan 5 — list marker review decoration.
//
// A list marker (`.superdoc-paragraph-marker`) is generated chrome, not a text
// run, so the run-level tracked-change decoration path never reaches it. This
// module stamps a marker glyph span with the SAME review identity, classes, and
// element-scoped CSS variables the run path uses (so marker and run review
// metadata never drift), then paints Word-like review-mode marker glyph styling:
// paragraph foreground plus underline (or strikethrough for deletions).
//
// The styling is written as inline styles on the glyph span ONLY, so it never
// leaks into body text and is directly assertable in jsdom without a stylesheet.
// The shared classes + CSS variables are additive: in a real browser they keep
// the marker consistent with run decorations and let the existing host
// applicator focus the marker by `[data-track-change-id]`.

import type { TrackedChangeMeta } from '@superdoc/contracts';
import {
  TRACK_CHANGE_BASE_CLASS,
  TRACK_CHANGE_MODIFIER_CLASS,
  applySemanticTrackedChangeMetadata,
  applyTrackedChangeColorVariables,
} from '../runs/tracked-changes.js';
import type { TrackedChangesRenderConfig } from '../runs/types.js';

/**
 * Permissive view over both marker tracked-change shapes — the contracts
 * `MarkerTrackedChange` (resolved path) and the `@superdoc/common`
 * `MinimalMarkerTrackedChange` (legacy `wordLayout.marker` path). Both are
 * structurally assignable to this view, so neither paint path needs a cast.
 */
export interface MarkerTrackedChangeView {
  id: string;
  kind: 'insert' | 'delete' | 'format';
  groupedIds?: readonly string[];
  type?: string;
  subtype?: string;
  targetKind?: string;
  semanticColorKey?: string;
  semanticColor?: string;
  color?: string;
  author?: string;
  authorEmail?: string;
  date?: string;
  storyKey?: string;
}

/** Marker-specific marker class so CSS can target marker review chrome only. */
export const TRACK_CHANGE_MARKER_CLASS = 'track-list-marker-dec';

/**
 * Build the canonical {@link TrackedChangeMeta} the shared run helpers expect
 * from the permissive marker view. `semanticColorKey` widens to the contract
 * union here at the single bridge point.
 */
const toTrackedChangeMeta = (tc: MarkerTrackedChangeView): TrackedChangeMeta =>
  ({
    kind: tc.kind,
    id: tc.id,
    ...(tc.storyKey ? { storyKey: tc.storyKey } : {}),
    ...(tc.author ? { author: tc.author } : {}),
    ...(tc.authorEmail ? { authorEmail: tc.authorEmail } : {}),
    ...(tc.color ? { color: tc.color } : {}),
    ...(tc.semanticColor ? { semanticColor: tc.semanticColor } : {}),
    ...(tc.semanticColorKey ? { semanticColorKey: tc.semanticColorKey } : {}),
    ...(tc.type ? { type: tc.type } : {}),
    ...(tc.subtype ? { subtype: tc.subtype } : {}),
    ...(tc.targetKind ? { targetKind: tc.targetKind } : {}),
    ...(tc.date ? { date: tc.date } : {}),
  }) as TrackedChangeMeta;

/**
 * Stamp a marker glyph span with tracked-change review metadata + Word-like
 * styling. Shares the run vocabulary (`track-insert-dec` / `track-delete-dec` /
 * `track-format-dec`, the `--sd-tracked-changes-*` variable family, and the
 * semantic datasets) so marker and run review decorations stay consistent.
 *
 * @param markerEl - The `.superdoc-paragraph-marker` glyph span.
 * @param tc - The marker tracked-change metadata (resolved or legacy shape).
 */
export const applyMarkerTrackedChange = (
  markerEl: HTMLElement,
  tc: MarkerTrackedChangeView | undefined,
  config: TrackedChangesRenderConfig = { mode: 'review', enabled: true },
): void => {
  if (!tc) return;
  if (!config.enabled || config.mode === 'off') return;

  const meta = toTrackedChangeMeta(tc);

  // Shared review classes (kept in sync with the run path) + a marker-only class.
  const baseClass = TRACK_CHANGE_BASE_CLASS[tc.kind];
  if (baseClass) markerEl.classList.add(baseClass);
  markerEl.classList.add(TRACK_CHANGE_MARKER_CLASS);
  const modifier = TRACK_CHANGE_MODIFIER_CLASS[tc.kind]?.[config.mode];
  if (modifier) markerEl.classList.add(modifier);

  // Element-scoped CSS variable family (visual color), shared with run path.
  applyTrackedChangeColorVariables(markerEl, meta);
  // Semantic class + namespaced datasets (type / subtype / target-kind / key).
  applySemanticTrackedChangeMetadata(markerEl, meta);

  // Review identity datasets.
  markerEl.dataset.trackChangeId = tc.id;
  markerEl.dataset.trackChangeKind = tc.kind;
  const ids = tc.groupedIds && tc.groupedIds.length > 0 ? tc.groupedIds : [tc.id];
  markerEl.dataset.trackChangeIds = ids.join(',');
  // No 'body' default for a missing story key: an unknown owning story must not
  // masquerade as body (IT-1250; see runs/tracked-changes.ts).
  if (tc.storyKey) {
    markerEl.dataset.storyKey = tc.storyKey;
  }
  if (tc.author) markerEl.dataset.trackChangeAuthor = tc.author;
  if (tc.authorEmail) markerEl.dataset.trackChangeAuthorEmail = tc.authorEmail;
  if (tc.color) markerEl.dataset.trackChangeAuthorColor = tc.color;
  if (tc.date) markerEl.dataset.trackChangeDate = tc.date;
  // Mark this carrier as the list-marker review carrier for hit-testing/snapshots.
  markerEl.dataset.trackChangeMarker = 'list';

  // Word-like review glyph styling, inline on the glyph ONLY (no body-text
  // leakage). The marker must keep the paragraph's foreground color so a
  // tracked list icon does not drift from the text it labels; the review state
  // is carried by the decoration and metadata.
  if (modifier === 'highlighted') {
    markerEl.style.textDecorationColor = 'currentColor';
    markerEl.style.textDecorationLine = tc.kind === 'delete' ? 'line-through' : 'underline';
  }
};
