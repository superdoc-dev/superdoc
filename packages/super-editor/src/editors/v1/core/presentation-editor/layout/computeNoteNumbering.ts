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
  let counter = options.startCounter;
  let sectionIndex = 0;
  let anyOverride = false;

  const restartFor = (s: number) => sectionConfigs.get(s)?.numRestart ?? options.defaultRestart ?? 'continuous';
  const numStartFor = (s: number) => sectionConfigs.get(s)?.numStart ?? options.startCounter;
  const numFmtFor = (s: number) => sectionConfigs.get(s)?.numFmt ?? options.defaultNumFmt;

  try {
    editorState.doc?.descendants?.((node: any) => {
      const typeName = node?.type?.name;
      if (typeName === 'sectionBreak') {
        const nextSection = sectionIndex + 1;
        // §17.11.19 — eachSect resets counter at SECTION BOUNDARY to the next section's numStart.
        if (restartFor(nextSection) === 'eachSect') {
          counter = numStartFor(nextSection);
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
