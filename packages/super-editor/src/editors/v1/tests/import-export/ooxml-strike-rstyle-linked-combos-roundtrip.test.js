import { describe, it, expect, beforeAll } from 'vitest';
import { getTestDataByFileName, loadTestDataForEditorTests, initTestEditor } from '../helpers/helpers.js';
import { getExportedResult } from '../export/export-helpers/index.js';

const stOnOff = (raw) => {
  if (raw === undefined || raw === null) return true;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  const v = String(raw).trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  if (v === '1' || v === 'true' || v === 'on') return true;
  return true;
};

const find = (el, name) => (el?.elements || []).find((e) => e.name === name);

const buildStrikeStyleSet = (stylesDoc) => {
  const strikeStyles = new Set();
  const stylesRoot = stylesDoc?.elements?.find((el) => el.name === 'w:styles');
  const styleElements = stylesRoot?.elements?.filter((el) => el.name === 'w:style') || [];
  styleElements.forEach((styleEl) => {
    const styleId = styleEl.attributes?.['w:styleId'];
    if (!styleId) return;
    const rPr = find(styleEl, 'w:rPr');
    if (!rPr) return;
    const strikeEl = find(rPr, 'w:strike');
    const doubleStrikeEl = find(rPr, 'w:dstrike');
    const mark = strikeEl || doubleStrikeEl;
    if (!mark) return;
    if (stOnOff(mark.attributes?.['w:val'])) strikeStyles.add(styleId.toLowerCase());
  });
  return strikeStyles;
};

const collectExpectedRunsFromImport = async (fileName, strikeStyleSet) => {
  const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(fileName);
  const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });
  const runs = [];
  editor.state.doc.descendants((node) => {
    if (!node.isText || !node.text) return;
    const findMark = (names) =>
      node.marks?.find((mark) => {
        const markName = mark.type?.name || mark.type;
        return names.includes(markName);
      });

    const strikeMark = findMark(['strike', 'doubleStrike']);
    const strikeValue = strikeMark?.attrs?.value;
    let strike;
    if (strikeMark) {
      strike = strikeValue !== '0';
    } else {
      const textStyleMark = node.marks?.find((mark) => (mark.type?.name || mark.type) === 'textStyle');
      const styleId = textStyleMark?.attrs?.styleId?.toLowerCase();
      strike = styleId ? strikeStyleSet?.has(styleId) : false;
    }
    runs.push({ text: node.text, strike });
  });
  editor.destroy();
  return runs;
};

const collectStrikeFromExport = (doc, strikeStyleSet) => {
  const runs = [];

  const processParagraph = (paragraph) => {
    (paragraph.elements || []).forEach((child) => {
      if (child.name !== 'w:r') return;
      const rPr = find(child, 'w:rPr');
      const strikeEl = find(rPr, 'w:strike');
      const doubleStrikeEl = find(rPr, 'w:dstrike');
      let strike = false;
      if (strikeEl) strike = stOnOff(strikeEl.attributes?.['w:val']);
      else if (doubleStrikeEl) strike = stOnOff(doubleStrikeEl.attributes?.['w:val']);
      else {
        const rStyle = find(rPr, 'w:rStyle');
        const styleId = rStyle?.attributes?.['w:val'];
        strike = styleId ? strikeStyleSet.has(styleId.toLowerCase()) : false;
      }
      const textEl = find(child, 'w:t');
      const text = textEl?.elements?.find((e) => e.type === 'text')?.text;
      if (!text) return;
      runs.push({ text, strike: Boolean(strike) });
    });
  };

  const walk = (node) => {
    (node?.elements || []).forEach((child) => {
      if (child.name === 'w:p') processParagraph(child);
      else if (child.elements) walk(child);
    });
  };

  walk(doc);
  return runs;
};

describe('OOXML strike + rStyle + linked combinations round-trip', () => {
  const fileName = 'ooxml-strike-rstyle-linked-combos-demo.docx';
  let sourceRuns = [];
  let exportedRuns = [];

  beforeAll(async () => {
    const sourceXmlMap = await getTestDataByFileName(fileName);
    const strikeStyleSet = buildStrikeStyleSet(sourceXmlMap['word/styles.xml']);
    sourceRuns = await collectExpectedRunsFromImport(fileName, strikeStyleSet);

    const exported = await getExportedResult(fileName);
    exportedRuns = collectStrikeFromExport(exported, strikeStyleSet);
  });

  it('preserves strike mark state through import/export, including style-driven runs', () => {
    const aggregate = (runs) => {
      const map = new Map();
      runs.forEach(({ text, strike }) => {
        const current = map.get(text) || false;
        map.set(text, current || Boolean(strike));
      });
      return map;
    };

    const sourceMap = aggregate(sourceRuns);
    const exportedMap = aggregate(exportedRuns);

    const expectedImport = new Map([
      ['Strikethrough sample', true],
      ['Styled strike', true],
      ['No-strike style overridden on', true],
      ['Linked Char style applied', true],
      ['Struck cell', true],
      ['Should be struck', true],
    ]);

    const expectedExport = new Map([
      ['Strikethrough sample', true],
      ['Styled strike', true],
      ['Strike style overridden off', false],
      ['No-strike style overridden on', true],
      ['Linked Char style applied', true],
      ['This part should NOT be struck', false],
      ['Struck cell', true],
      ['Should be struck', true],
      ['Double-struck sample', true],
    ]);

    expectedImport.forEach((value, text) => {
      expect(sourceMap.get(text)).toBe(value);
    });

    expectedExport.forEach((value, text) => {
      expect(exportedMap.get(text)).toBe(value);
    });
  });
});
