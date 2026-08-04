// @ts-check
import { describe, expect, it } from 'vitest';
import * as xmljs from 'xml-js';
import { _getReferencedTableStyles } from './tbl-translator.js';

/**
 * Empty property containers in `word/styles.xml` used to abort table import (issue #3861).
 *
 * AIDEV-NOTE: These fixtures parse real XML strings on purpose. xml-js omits the
 * `elements` key for empty elements, and hand-authored nodes using `elements: []`
 * do NOT reproduce that shape, so object-literal fixtures pass against the bug.
 * Keep building these from XML.
 */

const WORDPROCESSING_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/**
 * Build a `docx` bundle whose Table Grid style carries the given child XML.
 * @param {string} tableGridChildren Raw XML placed inside `<w:style w:styleId="TableGrid">`.
 * @param {string} [extraStyles] Raw XML for sibling `<w:style>` elements.
 */
const docxWithTableGrid = (tableGridChildren, extraStyles = '') => ({
  'word/styles.xml': xmljs.xml2js(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <w:styles xmlns:w="${WORDPROCESSING_NS}">
       <w:style w:type="table" w:styleId="TableNormal"><w:name w:val="Normal Table"/></w:style>
       ${extraStyles}
       <w:style w:type="table" w:styleId="TableGrid">
         <w:name w:val="Table Grid"/>
         ${tableGridChildren}
       </w:style>
     </w:styles>`,
    { compact: false },
  ),
});

const resolve = (docx, styleId = 'TableGrid') => _getReferencedTableStyles(styleId, { docx });

describe('_getReferencedTableStyles with empty style properties', () => {
  describe('empty run properties (the reported case)', () => {
    it.each([
      ['self-closing', '<w:rPr/>'],
      ['self-closing with space', '<w:rPr />'],
      ['paired', '<w:rPr></w:rPr>'],
      ['whitespace only', '<w:rPr>\n  </w:rPr>'],
    ])('treats a %s w:rPr as a no-op', (_label, rPr) => {
      const styles = resolve(docxWithTableGrid(rPr));

      expect(styles).not.toBeNull();
      expect(styles?.fonts).toBeUndefined();
      expect(styles?.fontSize).toBeUndefined();
    });

    it('still reads populated run properties', () => {
      const styles = resolve(
        docxWithTableGrid('<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="24"/></w:rPr>'),
      );

      expect(styles?.fonts).toEqual({ ascii: 'Arial', hAnsi: 'Arial', cs: 'Arial' });
      expect(styles?.fontSize).toBe('12pt');
    });

    it('treats a w:rFonts without attributes as a no-op', () => {
      const styles = resolve(docxWithTableGrid('<w:rPr><w:rFonts/></w:rPr>'));

      expect(styles?.fonts).toBeUndefined();
    });
  });

  describe('empty paragraph properties', () => {
    it.each([
      ['self-closing', '<w:pPr/>'],
      ['paired', '<w:pPr></w:pPr>'],
    ])('treats a %s w:pPr as a no-op', (_label, pPr) => {
      const styles = resolve(docxWithTableGrid(pPr));

      expect(styles?.justification).toBeUndefined();
    });

    it('still reads justification from a populated w:pPr', () => {
      const styles = resolve(docxWithTableGrid('<w:pPr><w:jc w:val="center"/></w:pPr>'));

      expect(styles?.justification).toBe('center');
    });
  });

  describe('inherited styles', () => {
    it('tolerates a w:basedOn target that has no children', () => {
      const docx = docxWithTableGrid(
        '<w:basedOn w:val="BareBase"/><w:rPr/>',
        '<w:style w:type="table" w:styleId="BareBase"/>',
      );

      expect(() => resolve(docx)).not.toThrow();
    });

    it('tolerates a w:basedOn target that does not exist', () => {
      expect(() => resolve(docxWithTableGrid('<w:basedOn w:val="Missing"/>'))).not.toThrow();
    });

    it('still inherits table properties from a populated base style', () => {
      const docx = docxWithTableGrid(
        '<w:basedOn w:val="BorderedBase"/><w:tblPr><w:tblStyleRowBandSize w:val="1"/></w:tblPr>',
        `<w:style w:type="table" w:styleId="BorderedBase">
           <w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>
         </w:style>`,
      );

      expect(resolve(docx)?.borders?.top).toMatchObject({ val: 'single' });
    });
  });

  describe('conditional formatting', () => {
    it('skips a w:tblStylePr that has no w:type to key it by', () => {
      const styles = resolve(docxWithTableGrid('<w:tblStylePr><w:tcPr/></w:tblStylePr>'));

      expect(styles).not.toBeNull();
      expect(Object.keys(styles ?? {})).not.toContain('undefined');
    });

    it('still reads a typed w:tblStylePr', () => {
      const styles = resolve(docxWithTableGrid('<w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr></w:tblStylePr>'));

      expect(styles?.firstRow).toBeDefined();
    });

    it('treats empty conditional property containers as no-ops', () => {
      const styles = resolve(
        docxWithTableGrid('<w:tblStylePr w:type="firstRow"><w:tcPr/><w:rPr/><w:pPr/><w:trPr/></w:tblStylePr>'),
      );

      expect(styles?.firstRow).toBeDefined();
    });
  });

  describe('malformed style records', () => {
    it('tolerates a matched style element with no children', () => {
      const docx = {
        'word/styles.xml': xmljs.xml2js(
          `<?xml version="1.0"?><w:styles xmlns:w="${WORDPROCESSING_NS}">
             <w:style w:type="table" w:styleId="TableGrid"/>
           </w:styles>`,
          { compact: false },
        ),
      };

      expect(() => resolve(docx)).not.toThrow();
    });

    it('ignores style elements that carry no attributes', () => {
      const docx = {
        'word/styles.xml': xmljs.xml2js(
          `<?xml version="1.0"?><w:styles xmlns:w="${WORDPROCESSING_NS}">
             <w:style><w:name w:val="Orphan"/></w:style>
             <w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>
           </w:styles>`,
          { compact: false },
        ),
      };

      expect(resolve(docx)?.name).toBeDefined();
    });

    it('returns null when styles.xml is absent', () => {
      expect(resolve({})).toBeNull();
    });

    it('treats empty w:tblPr, w:tcPr and w:trPr as no-ops', () => {
      const styles = resolve(docxWithTableGrid('<w:tblPr/><w:tcPr/><w:trPr/>'));

      expect(styles?.borders).toBeUndefined();
      expect(styles?.cellMargins).toBeUndefined();
    });
  });
});
