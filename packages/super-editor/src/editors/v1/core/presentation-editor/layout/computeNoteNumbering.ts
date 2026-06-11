import type { EditorState } from 'prosemirror-state';

/** §17.11.11 — per-section overrides for a note's numFmt / numStart / numRestart. */
export type SectionNoteConfig = {
  numFmt?: string;
  numStart?: number;
  numRestart?: 'continuous' | 'eachPage' | 'eachSect';
};

export type NoteNumberingResult = {
  numberById: Record<string, number>;
  /** Set only when at least one section overrides numFmt; consumers prefer this map per-id. */
  formatById?: Record<string, string>;
  order: string[];
};

export type NumberingOptions = {
  /** Initial counter (document-wide w:numStart, default 1). */
  startCounter: number;
  /** Document-wide w:numFmt (used as fallback when no section override). */
  defaultNumFmt?: string;
  /** Document-wide w:numRestart (default 'continuous'). */
  defaultRestart?: 'continuous' | 'eachPage' | 'eachSect';
  /** §17.11.11 — section-index → override config. Sections without overrides are absent. */
  sectionConfigs?: Map<number, SectionNoteConfig>;
  /**
   * §17.11.19 eachPage — per-ref page assignment from a prior layout pass.
   * When provided AND the active restart is `eachPage`, the counter resets at
   * each page boundary. Refs not in the map are treated as page 0 (initial).
   *
   * NOTE: callers in the SuperDoc layout pipeline do not yet thread this map.
   * Numbering runs BEFORE pagination, so per-page assignments are not
   * available; the orchestrator coerces `eachPage` → `continuous` in that
   * scenario. Implementing this properly requires a two-pass pagination
   * handshake (numbering after layout + a stable re-flow). Filed for
   * follow-up — do not advertise `eachPage` as supported until then.
   */
  refPageById?: Map<string, number>;
};

/**
 * Computes visible footnote/endnote numbering by first appearance in the document.
 *
 * Per §17.11.14: refs with `customMarkFollows="1"` shall not increment the counter.
 * Per §17.11.11: section-level w:footnotePr overrides numFmt / numStart / numRestart.
 * Per §17.11.19: numRestart=eachSect resets the counter to numStart at each section.
 */
export function computeNoteNumbering(
  editorState: EditorState | null | undefined,
  noteTypeName: 'footnoteReference' | 'endnoteReference',
  options: NumberingOptions,
): NoteNumberingResult {
  const numberById: Record<string, number> = {};
  const formatById: Record<string, string> = {};
  const order: string[] = [];
  if (!editorState) return { numberById, order };

  const seen = new Set<string>();
  const sectionConfigs = options.sectionConfigs ?? new Map<number, SectionNoteConfig>();
  const refPageById = options.refPageById;
  let sectionIndex = 0;
  let lastPage: number | null = null;
  let anyOverride = false;

  const restartFor = (s: number) => sectionConfigs.get(s)?.numRestart ?? options.defaultRestart ?? 'continuous';
  const numStartFor = (s: number) => sectionConfigs.get(s)?.numStart ?? options.startCounter;
  const numFmtFor = (s: number) => sectionConfigs.get(s)?.numFmt ?? options.defaultNumFmt;

  // §17.11.11: section-0's w:footnotePr/w:numStart override applies to refs
  // BEFORE the first section boundary. The reset block below only fires on
  // sectionBreak nodes, so without seeding from numStartFor(0) here a single-
  // section doc with a numStart override silently uses options.startCounter
  // instead. numStartFor() already falls back to options.startCounter when
  // section 0 has no config, so this is safe for the no-override case too.
  let counter = numStartFor(0);

  try {
    editorState.doc?.descendants?.((node: any) => {
      const typeName = node?.type?.name;
      if (typeName === 'sectionBreak') {
        const nextSection = sectionIndex + 1;
        // §17.11.19 — at section boundary, reset the counter to the next section's numStart
        // when its restart policy is anything other than continuous. (For continuous, the counter
        // carries through from the previous section.) Also clears the page tracker so eachPage
        // logic restarts cleanly inside the new section.
        const nextRestart = restartFor(nextSection);
        if (nextRestart === 'eachSect' || nextRestart === 'eachPage') {
          counter = numStartFor(nextSection);
          lastPage = null;
        }
        sectionIndex = nextSection;
        return;
      }
      if (typeName !== noteTypeName) return;
      const rawId = node?.attrs?.id;
      if (rawId == null) return;
      const key = String(rawId);
      if (!key || seen.has(key)) return;
      seen.add(key);
      order.push(key);
      // §17.11.14 — customMarkFollows refs do not consume an ordinal.
      if (isCustomMarkFollows(node?.attrs?.customMarkFollows)) return;
      // §17.11.19 eachPage — reset counter when the ref crosses a page boundary.
      if (refPageById && restartFor(sectionIndex) === 'eachPage') {
        const thisPage = refPageById.get(key) ?? 0;
        if (lastPage !== null && thisPage !== lastPage) counter = numStartFor(sectionIndex);
        lastPage = thisPage;
      }
      numberById[key] = counter;
      const fmt = numFmtFor(sectionIndex);
      if (fmt) {
        formatById[key] = fmt;
        if (sectionConfigs.has(sectionIndex) && sectionConfigs.get(sectionIndex)?.numFmt) anyOverride = true;
      }
      counter += 1;
    });
  } catch (_) {
    // Surface a degraded result rather than crashing the layout pipeline.
  }

  return anyOverride ? { numberById, formatById, order } : { numberById, order };
}

/** OOXML on/off — accepts the same truthy forms as the inline ref converter. */
export function isCustomMarkFollows(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}
