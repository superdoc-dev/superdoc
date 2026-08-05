/* @vitest-environment jsdom */

/**
 * Full, unmocked importer-pipeline regression test for the "V1 w:ins loses
 * tracking when a run begins with w:noBreakHyphen" follow-up bug: Word shows
 * paragraphs 16/16A/16B as ONE tracked insertion ("Insertions: 1" in its
 * Reviewing pane — confirmed by a Word-vs-SuperDoc screenshot on the ticket),
 * but before this fix SuperDoc's review panel showed 7 separate cards, one
 * per underlying `<w:ins>` XML element that Word's own serializer split the
 * single revision into (run-boundary mechanics: a `w:noBreakHyphen` atom
 * starting a new run, or a tracked-inserted paragraph mark).
 *
 * Kept separate from tracked-change-resolver.test.ts, which globally mocks
 * `getTrackChanges()`/`enumerateStructuralRowChanges()` — that file is right
 * for unit-level coalescing logic, but a "real fixture" assertion placed
 * there would never actually exercise import/grouping on a live document.
 * This file loads the real fixture through the real Editor import path
 * instead, mirroring extract-adapter.consumer-simulation.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../../core/Editor.js';
import { groupTrackedChanges } from './tracked-change-resolver.js';

describe('groupTrackedChanges: repro_tracked_insert_nbh (real fixture, unmocked)', () => {
  let editor: Editor;

  afterEach(() => {
    if (editor) {
      editor.destroy();
      editor = undefined as unknown as Editor;
    }
  });

  it('groups the noBreakHyphen-split w:ins chain (paragraphs 16/16A/16B) into one tracked change', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(
      'behavior-fixtures/tracked-insert-nobreakhyphen.docx',
    );
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    const grouped = groupTrackedChanges(editor);
    const insertions = grouped.filter((change) => change.hasInsert && !change.hasDelete && !change.hasFormat);

    // Before the fix this fixture produced 7 separate cards (one per
    // original Word run: sourceIds 1, 2, 3, 5, 6, 7, 9). It must now be one.
    expect(insertions).toHaveLength(1);

    const [change] = insertions;
    expect(change?.wordRevisionIds?.insert).toBeTruthy();
    // The excerpt should span all three paragraphs' text, not just one run.
    // (Paragraph-mark boundaries in the fixture are joined with an en-space,
    // not a regular space, so match on paragraph-number prefixes instead of
    // full sentences.)
    expect(change?.excerpt).toContain('Notwithstanding any other provision');
    expect(change?.excerpt).toContain('16A.');
    expect(change?.excerpt).toContain('16B.');
    expect(change?.excerpt).toContain('This control paragraph only exists');
  });

  it('does not regress the control paragraph (16B, plain hyphen-minus, no noBreakHyphen)', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(
      'behavior-fixtures/tracked-insert-nobreakhyphen.docx',
    );
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    const grouped = groupTrackedChanges(editor);
    const insertions = grouped.filter((change) => change.hasInsert && !change.hasDelete && !change.hasFormat);

    // 16B is part of the same bridged chain (its own tracked paragraph mark
    // matches the preceding chain's author/date), so it must NOT appear as
    // a second, separate insertion entry.
    expect(insertions).toHaveLength(1);
  });

  it('leaves the tracked paragraph-mark insertion (w:pPr/w:rPr/w:ins) semantics untouched', async () => {
    // Regression guard: chaining the paragraph-mark element's *mark id* into
    // the shared UUID (trackedChangeIdMapper.js 1b) must not disturb the
    // separate, pre-existing mechanism that reads the paragraph mark's *raw*
    // w:id off `paragraphProperties.runProperties.trackInsert.id` (see
    // markImporter.js's isMatchingParagraphMarkInsertion / getInlineParagraphMarkInsertion,
    // used together with a `w:rPrChange` sibling — not present in this
    // fixture, but the raw-id field itself must still read correctly).
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(
      'behavior-fixtures/tracked-insert-nobreakhyphen.docx',
    );
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    const docJson = editor.getJSON();
    const paragraphMarkIds = (docJson.content || [])
      .filter((node: { type?: string }) => node.type === 'paragraph')
      .map(
        (node: { attrs?: { paragraphProperties?: { runProperties?: { trackInsert?: { id?: string } } } } }) =>
          node.attrs?.paragraphProperties?.runProperties?.trackInsert?.id,
      )
      .filter((id: string | undefined): id is string => Boolean(id));

    // The paragraph-mark tracked-insertions for paragraphs 16 and 16A (word
    // ids "0" and "4" in this fixture) must still read as their own raw
    // Word ids, untouched by the shared-chain UUID assigned internally by
    // trackedChangeIdMapper.js.
    expect(paragraphMarkIds).toEqual(expect.arrayContaining(['0', '4']));

    // Neither paragraph-mark insertion should surface as its own separate
    // tracked-change card in the review panel.
    const grouped = groupTrackedChanges(editor);
    const insertions = grouped.filter((change) => change.hasInsert && !change.hasDelete && !change.hasFormat);
    expect(insertions).toHaveLength(1);
  });
});
