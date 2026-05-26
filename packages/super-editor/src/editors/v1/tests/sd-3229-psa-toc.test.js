import { describe, expect, it } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from './helpers/helpers.js';
import { SuperConverter } from '@core/super-converter/SuperConverter.js';
import { parseTocInstruction } from '@core/super-converter/field-references/shared/toc-switches.ts';
import { collectTocSources, buildTocEntryParagraphs } from '../document-api-adapters/helpers/toc-entry-builder.ts';

/**
 * SD-3229 end-to-end regression: loading the PSA_Anonymised TRUNCATED.docx
 * (a mixed-source TOC backed by `\t "Heading 1,1"` for articles and `\f C`
 * for sections) and rebuilding/installing the TOC content must mirror the
 * shape the importer emits — body-bookmark anchors (`_Toc230123326` …),
 * multi-run entries, and real `pageReference` nodes rather than bare
 * `tocPageNumber` marks. Re-installing the rebuilt content via the PM
 * command also verifies the encoder accepts the new shape.
 */
describe('SD-3229 PSA mixed-source TOC repro', () => {
  async function loadEditor() {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('PSA_Anonymised TRUNCATED.docx');
    const converter = new SuperConverter({ docx, media, mediaFiles, fonts });
    const { editor } = initTestEditor({ converter, loadFromSchema: false });
    return editor;
  }

  function findToc(doc) {
    let toc;
    doc.descendants((node) => {
      if (!toc && node.type.name === 'tableOfContents') toc = node;
      return !toc;
    });
    return toc;
  }

  /** Walks an entry paragraph and reports its anchor + child-type sequence + text marks. */
  function describeEntryParagraph(paragraph) {
    const styleId = paragraph?.attrs?.paragraphProperties?.styleId;
    if (paragraph.type.name !== 'paragraph' || !/^TOC[1-9]$/.test(String(styleId ?? ''))) {
      return { kind: 'non-entry' };
    }
    const childTypes = [];
    const textMarksPerRun = [];
    let anchor;
    let hasPageReference = false;
    let hasTocPageNumberMark = false;
    paragraph.descendants((node) => {
      if (node.type.name === 'pageReference') {
        hasPageReference = true;
        childTypes.push('pageReference');
        return false;
      }
      if (node.marks?.some((m) => m.type.name === 'tocPageNumber')) hasTocPageNumberMark = true;
      if (node.type.name === 'text') {
        const link = node.marks?.find((m) => m.type.name === 'link');
        if (link && !anchor) anchor = link.attrs?.anchor;
        childTypes.push('text');
        textMarksPerRun.push({
          text: node.text,
          markTypes: (node.marks ?? []).map((m) => m.type.name),
        });
      } else if (node.type.name === 'tab') {
        childTypes.push('tab');
      }
      return true;
    });
    return { styleId, anchor, childTypes, textMarksPerRun, hasPageReference, hasTocPageNumberMark };
  }

  function describeTocNode(tocNode) {
    const entries = [];
    tocNode.forEach((child) => entries.push(describeEntryParagraph(child)));
    return entries;
  }

  it('rebuild output mirrors the importer shape (anchors, multi-run entries, pageReference field)', async () => {
    const editor = await loadEditor();
    const toc = findToc(editor.state.doc);
    expect(toc).toBeDefined();

    const config = parseTocInstruction(toc.attrs?.instruction ?? '');
    const sources = collectTocSources(editor.state.doc, config);
    expect(sources.length).toBe(5);

    const entries = buildTocEntryParagraphs(sources, config);
    expect(entries.length).toBe(5);

    // Install the rebuilt content via the PM command — this is the same code
    // path `tocUpdateWrapper` exercises in production, minus the plan-engine
    // wrapper. Driving it directly catches any schema-validation issues in
    // the rebuilt JSON.
    const tocId = toc.attrs.sdBlockId;
    const replaced = editor.commands.replaceTableOfContentsContentById({ sdBlockId: tocId, content: entries });
    expect(replaced).toBe(true);

    const tocAfter = findToc(editor.state.doc);
    const after = describeTocNode(tocAfter);
    const styledEntries = after.filter((e) => e.styleId);
    expect(styledEntries.length).toBe(5);

    // Anchors must reuse the existing body bookmarks, not synthetic `_Toc<uuid>` names.
    expect(styledEntries.map((e) => e.anchor)).toEqual([
      '_Toc230123326',
      '_Toc230123327',
      '_Toc230123328',
      '_Toc230123329',
      '_Toc230123330',
    ]);

    // Every entry has a real pageReference field; nothing relies on the legacy tocPageNumber mark.
    expect(styledEntries.every((e) => e.hasPageReference)).toBe(true);
    expect(styledEntries.every((e) => !e.hasTocPageNumberMark)).toBe(true);

    // TOC1 (Articles): marker run + heading text run + tab + pageReference.
    const articles = styledEntries.filter((e) => e.styleId === 'TOC1');
    expect(articles.length).toBe(2);
    for (const e of articles) {
      expect(e.childTypes).toEqual(['text', 'text', 'tab', 'pageReference']);
      // Heading marks (bold / textStyle / underline) must NOT leak into the
      // TOC1 entry — TOC1 paragraph style supplies the typography.
      for (const run of e.textMarksPerRun) {
        expect(run.markTypes).not.toContain('bold');
        expect(run.markTypes).not.toContain('underline');
        expect(run.markTypes).not.toContain('textStyle');
      }
    }

    // TOC2 (Sections): section number + tab + title + tab + pageReference.
    const sections = styledEntries.filter((e) => e.styleId === 'TOC2');
    expect(sections.length).toBe(3);
    for (const e of sections) {
      expect(e.childTypes).toEqual(['text', 'tab', 'text', 'tab', 'pageReference']);
      // The section title text (second `text` entry) inherits bold/underline
      // from the Heading2 source — but never `textStyle`, which would override
      // the TOC2 style's font.
      const numberRun = e.textMarksPerRun[0];
      const titleRun = e.textMarksPerRun[1];
      expect(numberRun.markTypes).toEqual(['link']);
      expect(titleRun.markTypes).toContain('bold');
      expect(titleRun.markTypes).toContain('underline');
      expect(titleRun.markTypes).not.toContain('textStyle');
    }
  });
});
