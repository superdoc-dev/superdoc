import { inchesToTwips, twipsToInches } from './helpers.js';

/**
 * Read section type from a sectPr node.
 * Maps OOXML w:type values to our internal section break types.
 *
 * @param {Object} sectPr - The OOXML JSON for a <w:sectPr> element.
 * @returns {'continuous' | 'nextPage' | 'evenPage' | 'oddPage' | undefined}
 */
export function getSectPrType(sectPr) {
  if (!sectPr || sectPr.name !== 'w:sectPr') return undefined;
  const typeEl = sectPr.elements?.find((el) => el?.name === 'w:type');
  if (!typeEl?.attributes) return undefined;

  const val = typeEl.attributes['w:val'];
  // Map OOXML values to our types
  switch (val) {
    case 'continuous':
      return 'continuous';
    case 'nextPage':
      return 'nextPage';
    case 'evenPage':
      return 'evenPage';
    case 'oddPage':
      return 'oddPage';
    default:
      return undefined; // Will use default behavior
  }
}

/**
 * Read page size and orientation from a sectPr node.
 * Returns dimensions in inches and orientation string.
 *
 * @param {Object} sectPr - The OOXML JSON for a <w:sectPr> element.
 * @returns {{ width?: number, height?: number, orientation?: 'portrait' | 'landscape' } | undefined}
 */
export function getSectPrPageSize(sectPr) {
  if (!sectPr || sectPr.name !== 'w:sectPr') return undefined;
  const pgSz = sectPr.elements?.find((el) => el?.name === 'w:pgSz');
  if (!pgSz?.attributes) return undefined;

  const a = pgSz.attributes;
  const result = {};

  // Width and height are in twips
  if (a['w:w'] != null) result.width = twipsToInches(a['w:w']);
  if (a['w:h'] != null) result.height = twipsToInches(a['w:h']);

  // Orientation attribute
  const orient = a['w:orient'];
  if (orient === 'portrait' || orient === 'landscape') {
    result.orientation = orient;
  } else if (result.width != null && result.height != null) {
    // Infer orientation from dimensions if not explicitly set
    result.orientation = result.height > result.width ? 'portrait' : 'landscape';
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Read column configuration from a sectPr node.
 * Maps OOXML w:cols element to our internal column structure.
 *
 * @param {Object} sectPr - The OOXML JSON for a <w:sectPr> element.
 * @returns {{ count?: number, gap?: number } | undefined}
 */
export function getSectPrColumns(sectPr) {
  if (!sectPr || sectPr.name !== 'w:sectPr') return undefined;
  const cols = sectPr.elements?.find((el) => el?.name === 'w:cols');
  if (!cols?.attributes) return undefined;

  const a = cols.attributes;
  const result = {};

  // w:num = number of columns
  if (a['w:num'] != null) {
    const count = Number(a['w:num']);
    if (Number.isFinite(count) && count > 0) {
      result.count = count;
    }
  }

  // w:space = gap between columns in twips
  if (a['w:space'] != null) {
    result.gap = twipsToInches(a['w:space']);
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Read page margin values from a sectPr node (in inches).
 * Returns only margins present on the node; missing values are omitted.
 *
 * @param {Object} sectPr - The OOXML JSON for a <w:sectPr> element.
 * @returns {{top?: number, right?: number, bottom?: number, left?: number, header?: number, footer?: number, gutter?: number}}
 */
export function getSectPrMargins(sectPr) {
  if (!sectPr || sectPr.name !== 'w:sectPr') return {};
  const pgMar = sectPr.elements?.find((el) => el?.name === 'w:pgMar');
  if (!pgMar?.attributes) return {};

  const a = pgMar.attributes;
  const result = {};
  if (a['w:top'] != null) result.top = twipsToInches(a['w:top']);
  if (a['w:right'] != null) result.right = twipsToInches(a['w:right']);
  if (a['w:bottom'] != null) result.bottom = twipsToInches(a['w:bottom']);
  if (a['w:left'] != null) result.left = twipsToInches(a['w:left']);
  if (a['w:header'] != null) result.header = twipsToInches(a['w:header']);
  if (a['w:footer'] != null) result.footer = twipsToInches(a['w:footer']);
  if (a['w:gutter'] != null) result.gutter = twipsToInches(a['w:gutter']);
  return result;
}

/**
 * Ensure a <w:pgMar> child exists on a sectPr node and return it.
 * Mutates sectPr as needed to add missing nodes/attributes objects.
 *
 * @param {Object} sectPr - The OOXML JSON for a <w:sectPr> element.
 * @returns {Object} The <w:pgMar> node (created if necessary).
 */
function ensurePgMar(sectPr) {
  if (!sectPr || sectPr.name !== 'w:sectPr') throw new Error('ensurePgMar: invalid sectPr node');
  if (!Array.isArray(sectPr.elements)) sectPr.elements = [];
  let pgMar = sectPr.elements.find((el) => el?.name === 'w:pgMar');
  if (!pgMar) {
    pgMar = { type: 'element', name: 'w:pgMar', attributes: {} };
    sectPr.elements.push(pgMar);
  } else if (!pgMar.attributes) {
    pgMar.attributes = {};
  }
  return pgMar;
}

/**
 * Update header/footer and/or other page margins on a given <w:sectPr>.
 * Values are specified in inches; underlying OOXML is stored in twips.
 *
 * @param {Object} sectPr - The OOXML JSON for a <w:sectPr> element.
 * @param {{
 *   topInches?: number,
 *   rightInches?: number,
 *   bottomInches?: number,
 *   leftInches?: number,
 *   headerInches?: number,
 *   footerInches?: number,
 *   gutterInches?: number,
 * }} updates - Margin updates in inches.
 * @returns {Object} The mutated sectPr node (same reference).
 */
export function updateSectPrMargins(sectPr, updates = {}) {
  if (!sectPr || sectPr.name !== 'w:sectPr') throw new Error('updateSectPrMargins: invalid sectPr node');
  const pgMar = ensurePgMar(sectPr);
  const a = pgMar.attributes;

  if (updates.topInches != null) a['w:top'] = String(inchesToTwips(updates.topInches));
  if (updates.rightInches != null) a['w:right'] = String(inchesToTwips(updates.rightInches));
  if (updates.bottomInches != null) a['w:bottom'] = String(inchesToTwips(updates.bottomInches));
  if (updates.leftInches != null) a['w:left'] = String(inchesToTwips(updates.leftInches));
  if (updates.headerInches != null) a['w:header'] = String(inchesToTwips(updates.headerInches));
  if (updates.footerInches != null) a['w:footer'] = String(inchesToTwips(updates.footerInches));
  if (updates.gutterInches != null) a['w:gutter'] = String(inchesToTwips(updates.gutterInches));

  return sectPr;
}

/**
 * Unified API to update section margins, targeting either the document body defaults
 * (via converter.pageStyles.pageMargins) or a specific paragraph-level sectPr JSON node.
 *
 * - Body target: { type: 'body', converter }
 *   Updates converter.pageStyles.pageMargins.{header/footer/...} in inches.
 *   Export will reflect changes through ensureSectionLayoutDefaults.
 *
 * - SectPr target: { type: 'sectPr', sectPr }
 *   Mutates the provided sectPr JSON (pass-through on export) setting margins in twips.
 *
 * @param {{
 *   type: 'body',
 *   converter: any,
 * } | {
 *   type: 'sectPr',
 *   sectPr: Object,
 * }} target - Update target descriptor.
 * @param {{
 *   topInches?: number,
 *   rightInches?: number,
 *   bottomInches?: number,
 *   leftInches?: number,
 *   headerInches?: number,
 *   footerInches?: number,
 *   gutterInches?: number,
 * }} updates - Margin updates in inches.
 * @returns {{ kind: 'body', pageMargins: any } | { kind: 'sectPr', sectPr: Object }} A summary of what was updated.
 */
export function updateSectionMargins(target, updates = {}) {
  if (!target || !target.type) throw new Error('updateSectionMargins: missing or invalid target');

  if (target.type === 'body') {
    const { converter } = target;
    if (!converter) throw new Error('updateSectionMargins: body target missing converter');
    if (!converter.pageStyles) converter.pageStyles = {};
    if (!converter.pageStyles.pageMargins) converter.pageStyles.pageMargins = {};

    const m = converter.pageStyles.pageMargins;
    if (updates.topInches != null) m.top = updates.topInches;
    if (updates.rightInches != null) m.right = updates.rightInches;
    if (updates.bottomInches != null) m.bottom = updates.bottomInches;
    if (updates.leftInches != null) m.left = updates.leftInches;
    if (updates.headerInches != null) m.header = updates.headerInches;
    if (updates.footerInches != null) m.footer = updates.footerInches;
    if (updates.gutterInches != null) m.gutter = updates.gutterInches;

    return { kind: 'body', pageMargins: { ...m } };
  }

  if (target.type === 'sectPr') {
    const { sectPr } = target;
    if (!sectPr || sectPr.name !== 'w:sectPr')
      throw new Error('updateSectionMargins: sectPr target missing/invalid sectPr');
    updateSectPrMargins(sectPr, updates);
    return { kind: 'sectPr', sectPr };
  }

  throw new Error(`updateSectionMargins: unsupported target type: ${target.type}`);
}
