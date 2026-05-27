/**
 * @ooxml w:bidi (paragraph) / w:bidi (section) / w:bidiVisual (table) /
 *        w:textDirection (paragraph, section, cell) / w:rtlGutter
 * @spec ECMA-376 §17.6.1, §17.3.1.6, §17.4.1, §17.3.1.41, §17.6.16
 *
 * Direction resolver chain. Produces typed direction contexts that
 * downstream consumers (DomPainter, layout-bridge, hit testing) read.
 *
 * Usage pattern:
 *
 *   const sectionContext = resolveSectionDirection(sectPr);
 *   const tableContext = resolveTableDirection(tblPr, sectionContext);
 *   const cellContext = resolveCellDirection(tcPr, tableContext);
 *   const paragraphContext = resolveParagraphDirection(pPr, sectionContext, cellContext);
 *
 * The orthogonal axes do not collapse: section page direction is not
 * paragraph inline direction, table visual direction is not cell paragraph
 * direction, run rtl is not paragraph direction. See README.md.
 */

export { resolveSectionDirection } from './resolveSectionDirection.js';
export { resolveTableDirection } from './resolveTableDirection.js';
export { resolveCellDirection } from './resolveCellDirection.js';
export { resolveParagraphDirection } from './resolveParagraphDirection.js';
export type { ParagraphPropertiesLike } from './resolveParagraphDirection.js';
export type { TablePropertiesLike } from './resolveTableDirection.js';
export type { CellPropertiesLike } from './resolveCellDirection.js';
export { resolveLogicalAlignment, resolveLogicalIndent, physicalSide, isRtl, toBaseDirection } from './logicalSides.js';
