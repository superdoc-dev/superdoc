// @ts-check
import { describe, expect, it } from 'vitest';
import * as xmljs from 'xml-js';
import { getDefaultStyleDefinition } from './get-default-style-definition.js';

/**
 * Incomplete leaf properties in `word/styles.xml` (issue #3861).
 *
 * AIDEV-NOTE: Asserts the parsed values, not just that parsing survived. An
 * earlier pass returned NaN for outlineLevel and half-formed tab stops, both of
 * which a survival-only test would have missed. Fixtures parse real XML because
 * xml-js omits the `elements` key on empty elements.
 */

const WORDPROCESSING_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** @param {string} styleChildren Raw XML placed inside `<w:style w:styleId="Target">`. */
const parseStyle = (styleChildren) =>
  getDefaultStyleDefinition('Target', {
    'word/styles.xml': xmljs.xml2js(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
       <w:styles xmlns:w="${WORDPROCESSING_NS}">
         <w:style w:type="paragraph" w:styleId="Target">${styleChildren}</w:style>
       </w:styles>`,
      { compact: false },
    ),
  });

describe('getDefaultStyleDefinition with incomplete properties', () => {
  describe('w:outlineLvl', () => {
    it('reads a valid level', () => {
      expect(parseStyle('<w:pPr><w:outlineLvl w:val="2"/></w:pPr>').attrs.outlineLevel).toBe(2);
    });

    // w:val is required on CT_DecimalNumber; parseInt of a missing value yielded NaN.
    it.each([
      ['no w:val', '<w:outlineLvl/>'],
      ['a non-numeric w:val', '<w:outlineLvl w:val="abc"/>'],
    ])('reports null rather than NaN for %s', (_label, outlineLvl) => {
      expect(parseStyle(`<w:pPr>${outlineLvl}</w:pPr>`).attrs.outlineLevel).toBeNull();
    });
  });

  describe('w:tab', () => {
    it('reads a complete tab stop', () => {
      expect(parseStyle('<w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>').styles.tabStops).toEqual([
        { val: 'start', pos: 48, leader: undefined },
      ]);
    });

    // w:val and w:pos are both required on CT_TabStop.
    it.each([
      ['no attributes', '<w:tab/>'],
      ['only w:val', '<w:tab w:val="left"/>'],
      ['only w:pos', '<w:tab w:pos="720"/>'],
    ])('drops a tab stop with %s', (_label, tab) => {
      expect(parseStyle(`<w:pPr><w:tabs>${tab}</w:tabs></w:pPr>`).styles.tabStops).toBeNull();
    });

    it('keeps complete stops alongside incomplete ones', () => {
      const styles = parseStyle(
        '<w:pPr><w:tabs><w:tab w:val="left"/><w:tab w:val="right" w:pos="1440"/></w:tabs></w:pPr>',
      ).styles;

      expect(styles.tabStops).toEqual([{ val: 'end', pos: 96, leader: undefined }]);
    });
  });

  describe('duplicate w:styleId records', () => {
    const duplicated = `
      <w:style w:type="paragraph" w:styleId="Target"><w:qFormat/></w:style>
      <w:style w:type="paragraph" w:styleId="Target">
        <w:name w:val="FromSecond"/>
        <w:basedOn w:val="BaseFromSecond"/>
        <w:pPr><w:jc w:val="center"/><w:ind w:left="720"/></w:pPr>
      </w:style>`;

    const parsed = () =>
      getDefaultStyleDefinition('Target', {
        'word/styles.xml': xmljs.xml2js(
          `<?xml version="1.0"?><w:styles xmlns:w="${WORDPROCESSING_NS}">${duplicated}</w:styles>`,
          { compact: false },
        ),
      });

    it('takes identity properties from whichever record declares them', () => {
      expect(parsed().attrs).toMatchObject({ name: 'FromSecond', basedOn: 'BaseFromSecond', qFormat: true });
    });

    // Documents the current boundary: only the identity children above look past
    // the first record. Paragraph properties are not merged across duplicates.
    it('still reads paragraph properties from the first record only', () => {
      expect(parsed().styles.textAlign).toBeUndefined();
    });
  });
});
