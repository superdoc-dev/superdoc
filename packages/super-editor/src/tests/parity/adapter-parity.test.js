import { beforeAll, describe, expect, it } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { computeParagraphReferenceSnapshot } from '@tests/helpers/paragraphReference.js';
import { zipFolderToBuffer } from '@tests/helpers/zipFolderToBuffer.js';
import { Editor } from '@core/Editor.js';
import { computeParagraphAttrs } from '@superdoc/pm-adapter/attributes/paragraph.js';
import { buildConverterContextFromEditor } from '../helpers/adapterTestHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const findParagraphAt = (doc, predicate) => {
  let match = null;
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    if (predicate(node)) {
      match = { node, pos };
      return false;
    }
  });
  return match;
};

describe('adapter parity (computeParagraphAttrs)', () => {
  let basicDocx;
  let listDocx;
  let spacingDocx;

  beforeAll(async () => {
    const basic = await loadTestDataForEditorTests('basic-paragraph.docx');
    basicDocx = basic;
    const list = await loadTestDataForEditorTests('basic-list.docx');
    listDocx = list;
    spacingDocx = await loadTestDataForEditorTests('doc_with_spacing.docx');
  });

  it('computes attrs matching reference for plain paragraph', () => {
    const { editor } = initTestEditor({
      content: basicDocx.docx,
      media: basicDocx.media,
      mediaFiles: basicDocx.mediaFiles,
      fonts: basicDocx.fonts,
    });

    const match = findParagraphAt(editor.state.doc, () => true);
    expect(match).toBeTruthy();

    // Get reference snapshot from NodeView logic
    const reference = computeParagraphReferenceSnapshot(editor, match.node, match.pos);

    // Compute attrs via layout-engine adapter
    const converterContext = buildConverterContextFromEditor(editor);
    const { paragraphAttrs } = computeParagraphAttrs(match.node, converterContext);

    // Compare spacing: adapter should produce px numbers when reference defines spacing
    const refSpacing = reference.paragraphProperties.spacing;
    if (refSpacing) {
      expect(paragraphAttrs?.spacing).toBeDefined();
      if (refSpacing.before != null) {
        expect(typeof paragraphAttrs?.spacing?.before).toBe('number');
        expect(paragraphAttrs.spacing.before).toBeGreaterThanOrEqual(0);
      }
      if (refSpacing.after != null) {
        expect(typeof paragraphAttrs?.spacing?.after).toBe('number');
        expect(paragraphAttrs.spacing.after).toBeGreaterThanOrEqual(0);
      }
    }

    // Compare indent: ensure adapter returns object with matching keys
    const refIndent = reference.paragraphProperties.indent;
    if (refIndent) {
      expect(paragraphAttrs?.indent).toBeDefined();
      if (refIndent.left != null) {
        expect(paragraphAttrs.indent?.left).toBeDefined();
      }
      if (refIndent.right != null) {
        expect(paragraphAttrs.indent?.right).toBeDefined();
      }
      if (refIndent.firstLine != null) {
        expect(paragraphAttrs.indent?.firstLine ?? paragraphAttrs.indent?.hanging).toBeDefined();
      }
      if (refIndent.hanging != null) {
        expect(paragraphAttrs.indent?.hanging ?? paragraphAttrs.indent?.firstLine).toBeDefined();
      }
    }

    // Compare alignment (justification)
    if (reference.paragraphProperties.justification) {
      const referenceAlign = reference.paragraphProperties.justification;
      expect(paragraphAttrs?.alignment).toBe(referenceAlign);
    }

    editor.destroy();
  });

  it('computes attrs matching reference for list paragraph', () => {
    const { editor } = initTestEditor({
      content: listDocx.docx,
      media: listDocx.media,
      mediaFiles: listDocx.mediaFiles,
      fonts: listDocx.fonts,
    });

    const match = findParagraphAt(editor.state.doc, (node) => Boolean(node.attrs?.listRendering));
    expect(match).toBeTruthy();

    // Get reference snapshot
    const reference = computeParagraphReferenceSnapshot(editor, match.node, match.pos);
    expect(reference.list).not.toBeNull();

    // Compute attrs via adapter
    const converterContext = buildConverterContextFromEditor(editor);
    const { paragraphAttrs } = computeParagraphAttrs(match.node, converterContext);

    // Verify numberingProperties are present and correct
    expect(paragraphAttrs?.numberingProperties).toBeDefined();
    expect(paragraphAttrs?.numberingProperties.ilvl).toEqual(reference.paragraphProperties.numberingProperties.ilvl);
    expect(paragraphAttrs?.numberingProperties.numId).toEqual(reference.paragraphProperties.numberingProperties.numId);

    // Verify wordLayout is computed and matches reference
    expect(paragraphAttrs?.wordLayout).toBeDefined();
    if (reference.list.markerText) {
      expect(paragraphAttrs?.wordLayout?.marker?.markerText).toBe(reference.list.markerText);
    }
    if (reference.list.justification) {
      expect(paragraphAttrs?.wordLayout?.marker?.justification).toBe(reference.list.justification);
    }
    if (reference.list.suffix) {
      expect(paragraphAttrs?.wordLayout?.marker?.suffix).toBe(reference.list.suffix);
    }

    editor.destroy();
  });

  it('computes spacing/indent matching reference', () => {
    const { editor } = initTestEditor({
      content: spacingDocx.docx,
      media: spacingDocx.media,
      mediaFiles: spacingDocx.mediaFiles,
      fonts: spacingDocx.fonts,
    });

    let referenceMatch = null;
    let paraNode = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return;
      const snapshot = computeParagraphReferenceSnapshot(editor, node, pos);
      if (snapshot.paragraphProperties.spacing || snapshot.paragraphProperties.indent) {
        referenceMatch = snapshot;
        paraNode = node;
        return false;
      }
    });

    expect(referenceMatch).toBeTruthy();
    expect(paraNode).toBeTruthy();

    // Compute adapter attrs
    const converterContext = buildConverterContextFromEditor(editor);
    const { paragraphAttrs } = computeParagraphAttrs(paraNode, converterContext);

    // Verify spacing precedence
    if (referenceMatch.paragraphProperties.spacing) {
      expect(paragraphAttrs?.spacing).toBeDefined();

      // Check for contextualSpacing if present
      if (referenceMatch.paragraphProperties.spacing.contextualSpacing != null) {
        expect(paragraphAttrs?.contextualSpacing).toBe(referenceMatch.paragraphProperties.spacing.contextualSpacing);
      }
    }

    // Verify indent precedence
    if (referenceMatch.paragraphProperties.indent) {
      expect(paragraphAttrs?.indent).toBeDefined();
      const { indent } = referenceMatch.paragraphProperties;
      if (indent.left != null) {
        expect(paragraphAttrs.indent?.left).toBeDefined();
        expect(paragraphAttrs.indent?.left).toBeGreaterThanOrEqual(0);
      }
      if (indent.right != null) {
        expect(paragraphAttrs.indent?.right).toBeDefined();
        expect(paragraphAttrs.indent?.right).toBeGreaterThanOrEqual(0);
      }
      if (indent.firstLine != null) {
        expect(paragraphAttrs.indent?.firstLine ?? paragraphAttrs.indent?.hanging).toBeDefined();
      }
      if (indent.hanging != null) {
        expect(paragraphAttrs.indent?.hanging ?? paragraphAttrs.indent?.firstLine).toBeDefined();
      }
    }

    editor.destroy();
  });

  it('computes tab stops when present', async () => {
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

    // Compute adapter attrs
    const converterContext = buildConverterContextFromEditor(editor);
    const { paragraphAttrs } = computeParagraphAttrs(match.node, converterContext);

    // Verify tabs are present and correct shape/values
    expect(paragraphAttrs?.tabs).toBeDefined();
    expect(Array.isArray(paragraphAttrs.tabs)).toBe(true);
    const refTab = reference.paragraphProperties.tabStops[0];
    const adapterTab = paragraphAttrs.tabs?.[0];
    if (refTab.pos != null) {
      expect(adapterTab?.pos).toBe(refTab.pos);
    } else {
      expect(adapterTab?.pos).toBeDefined();
    }
    if (refTab.val != null) {
      expect(adapterTab?.val).toBe(refTab.val);
    } else {
      expect(adapterTab?.val).toBeDefined();
    }
    if (refTab.leader) {
      expect(adapterTab?.leader).toBe(refTab.leader);
    }

    // Verify tabIntervalTwips default is set
    expect(paragraphAttrs?.tabIntervalTwips).toBe(720);

    editor.destroy();
  });

  it('propagates tab interval defaults correctly', () => {
    const { editor } = initTestEditor({
      content: basicDocx.docx,
      media: basicDocx.media,
      mediaFiles: basicDocx.mediaFiles,
      fonts: basicDocx.fonts,
    });

    const match = findParagraphAt(editor.state.doc, () => true);
    expect(match).toBeTruthy();

    const converterContext = buildConverterContextFromEditor(editor);
    const { paragraphAttrs } = computeParagraphAttrs(match.node, converterContext);

    // Tab interval should be set from styleContext defaults
    expect(paragraphAttrs?.tabIntervalTwips).toBe(720);

    editor.destroy();
  });

  it('returns minimal attrs for empty paragraph (defaults only)', () => {
    const emptyPara = { type: { name: 'paragraph' }, attrs: {} };
    const { paragraphAttrs } = computeParagraphAttrs(emptyPara);
    // Even empty paragraphs get default alignment and tab interval from styleContext.defaults
    expect(paragraphAttrs).toBeDefined();
    expect(paragraphAttrs?.tabIntervalTwips).toBe(720);
  });

  it('extracts framePr flags correctly', () => {
    const paraWithFramePr = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          framePr: { xAlign: 'right' },
        },
      },
    };

    const { paragraphAttrs } = computeParagraphAttrs(paraWithFramePr);

    expect(paragraphAttrs?.floatAlignment).toBe('right');
  });

  it('extracts framePr from paragraphProperties', () => {
    const paraWithFramePr = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          framePr: { xAlign: 'center' },
        },
      },
    };

    const { paragraphAttrs } = computeParagraphAttrs(paraWithFramePr);

    expect(paragraphAttrs?.floatAlignment).toBe('center');
  });
});
