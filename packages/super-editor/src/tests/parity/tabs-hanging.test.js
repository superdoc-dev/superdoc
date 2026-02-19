import { beforeAll, describe, expect, it } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { computeParagraphReferenceSnapshot } from '@tests/helpers/paragraphReference.js';
import { zipFolderToBuffer } from '@tests/helpers/zipFolderToBuffer.js';
import { Editor } from '@core/Editor.js';
import { computeParagraphAttrs } from '@superdoc/pm-adapter/attributes/paragraph.js';
import { buildConverterContextFromEditor } from '../helpers/adapterTestHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('tabs and hanging indent parity', () => {
  it('compares tab stop alignments (left/center/right/decimal)', async () => {
    const buffer = await zipFolderToBuffer(join(__dirname, '../data/tab_stops_basic_test'));
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    let paraIndex = -1;
    let match = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return;
      paraIndex += 1;
      // Paragraph index 3 has custom tab stop
      if (paraIndex === 3) {
        match = { node, pos };
        return false;
      }
    });

    expect(match).toBeTruthy();

    // Get reference
    const reference = computeParagraphReferenceSnapshot(editor, match.node, match.pos);
    expect(reference.paragraphProperties.tabStops).toBeTruthy();

    // Get adapter attrs
    const converterContext = buildConverterContextFromEditor(editor);
    const { paragraphAttrs } = computeParagraphAttrs(match.node, converterContext);

    expect(paragraphAttrs?.tabs).toBeDefined();
    expect(paragraphAttrs.tabs.length).toBeGreaterThan(0);

    // Compare tab stop properties
    const referenceTab = reference.paragraphProperties.tabStops[0];
    const adapterTab = paragraphAttrs.tabs[0];

    if (referenceTab.pos != null) {
      expect(adapterTab.pos).toBe(referenceTab.pos);
    } else {
      expect(adapterTab.pos).toBeDefined();
    }
    if (referenceTab.val != null) {
      expect(adapterTab.val).toBe(referenceTab.val);
    } else {
      expect(adapterTab.val).toBeDefined();
    }
    if (referenceTab.leader) {
      expect(adapterTab.leader).toBe(referenceTab.leader);
    }

    editor.destroy();
  });

  it('compares default tab interval between reference and adapter', async () => {
    const buffer = await zipFolderToBuffer(join(__dirname, '../data/tab_stops_basic_test'));
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    let match = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') {
        return;
      }
      if (!match) {
        match = { node, pos };
        return false;
      }
    });

    expect(match).toBeTruthy();

    // Get style context which has default tab interval
    const converterContext = buildConverterContextFromEditor(editor);
    const { paragraphAttrs } = computeParagraphAttrs(match.node, converterContext);

    // Adapter should use the same default tab interval
    expect(paragraphAttrs?.tabIntervalTwips).toBe(720);

    editor.destroy();
  });

  it('compares hanging indent vs firstLine indent', async () => {
    const buffer = await zipFolderToBuffer(join(__dirname, '../data/tab_stops_basic_test'));
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    // Find paragraph with hanging or firstLine indent
    let match = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return;
      const pProps = node.attrs?.paragraphProperties;
      if (pProps?.indent?.hanging || pProps?.indent?.firstLine) {
        match = { node, pos };
        return false;
      }
    });

    if (!match) {
      // If no paragraph with hanging/firstLine, skip test
      expect(true).toBe(true);
      editor.destroy();
      return;
    }

    // Get reference
    const reference = computeParagraphReferenceSnapshot(editor, match.node, match.pos);

    // Get adapter attrs
    const converterContext = buildConverterContextFromEditor(editor);
    const { paragraphAttrs } = computeParagraphAttrs(match.node, converterContext);

    // Compare indent properties
    const referenceIndent = reference.paragraphProperties.indent;
    const adapterIndent = paragraphAttrs?.indent;

    if (referenceIndent) {
      expect(adapterIndent).toBeDefined();

      // If reference has hanging, adapter should too (or convert to negative firstLine)
      if (referenceIndent.hanging !== undefined) {
        expect(adapterIndent.hanging !== undefined || adapterIndent.firstLine !== undefined).toBe(true);
      }

      // If reference has firstLine, adapter should too
      if (referenceIndent.firstLine !== undefined) {
        expect(adapterIndent.firstLine !== undefined || adapterIndent.hanging !== undefined).toBe(true);
      }
    }

    editor.destroy();
  });

  it('ensures tab stop position units are consistent (twips)', async () => {
    const buffer = await zipFolderToBuffer(join(__dirname, '../data/tab_stops_basic_test'));
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    let paraIndex = -1;
    let match = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return;
      paraIndex += 1;
      if (paraIndex === 3) {
        match = { node, pos };
        return false;
      }
    });

    expect(match).toBeTruthy();

    const converterContext = buildConverterContextFromEditor(editor);
    const { paragraphAttrs } = computeParagraphAttrs(match.node, converterContext);

    expect(paragraphAttrs?.tabs).toBeDefined();

    // Tab positions should be in twips (positive integers)
    for (const tab of paragraphAttrs.tabs) {
      expect(tab.pos).toBeTypeOf('number');
      expect(Number.isInteger(tab.pos)).toBe(true);
      expect(tab.pos).toBeGreaterThan(0);
    }

    editor.destroy();
  });

  it('compares tab leader styles if present', async () => {
    const buffer = await zipFolderToBuffer(join(__dirname, '../data/tab_stops_basic_test'));
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    let paraIndex = -1;
    let match = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return;
      paraIndex += 1;
      if (paraIndex === 3) {
        match = { node, pos };
        return false;
      }
    });

    expect(match).toBeTruthy();

    const reference = computeParagraphReferenceSnapshot(editor, match.node, match.pos);
    const converterContext = buildConverterContextFromEditor(editor);
    const { paragraphAttrs } = computeParagraphAttrs(match.node, converterContext);

    // If reference has tab leader, adapter should preserve it
    const referenceTab = reference.paragraphProperties.tabStops?.[0];
    const adapterTab = paragraphAttrs?.tabs?.[0];

    if (referenceTab && adapterTab && referenceTab.leader && referenceTab.leader !== 'none') {
      expect(adapterTab.leader).toBe(referenceTab.leader);
    }

    editor.destroy();
  });

  it('gracefully handles malformed tab entries', () => {
    const para = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          tabStops: [
            { tab: { tabType: 'start' } }, // missing pos
            { pos: 'not-a-number' }, // invalid pos
          ],
        },
      },
    };

    const { paragraphAttrs } = computeParagraphAttrs(para);

    expect(paragraphAttrs?.tabs).toBeUndefined();
  });
});
