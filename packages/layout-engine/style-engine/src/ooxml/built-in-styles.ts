/**
 * Built-in (latent) Word style defaults.
 *
 * Word ships with ~260 built-in style ids that documents are allowed to reference
 * without including a matching `w:style` entry in `styles.xml`. ECMA-376 §17.7.4.9
 * expects a reading application to fall back to the built-in defaults in that case.
 *
 * In the wild this happens with documents emitted by python-docx, pandoc and other
 * generators: they set `<w:pStyle w:val="Heading1"/>` on a paragraph but never write
 * the corresponding style block, and SuperDoc was rendering the headings as plain
 * body text (issue #2805).
 *
 * The values below mirror the Word 2016+ default template (Calibri / Calibri Light
 * with the standard blue accents). They intentionally cover only the most common
 * case — Heading 1 through Heading 9 — since those are the ones that actually move
 * the needle for users. Other latent styles can be added on demand.
 *
 * Each definition has `basedOn: 'Normal'`, so the existing cascade keeps working
 * naturally: if the document does define `Normal`, those properties still flow in,
 * and if it doesn't, the chain just terminates without throwing.
 */

import type { StyleDefinition } from './styles-types.ts';

/** Half-points (Word's `w:sz` unit). 28 → 14pt, 26 → 13pt, etc. */
const HP = (pt: number): number => Math.round(pt * 2);

/** Twentieths of a point (Word's `w:before` / `w:after` unit). */
const TWIPS = (pt: number): number => Math.round(pt * 20);

const HEADING_BLUE = '2F5496';
const HEADING_DARK_BLUE = '1F3864';
const HEADING_DARK_GREY = '272727';

const buildHeading = (
  level: number,
  fontSize: number,
  color: string,
  options: { bold?: boolean; italic?: boolean; spacingBeforePt?: number } = {},
): StyleDefinition => {
  const { bold = false, italic = false, spacingBeforePt = 2 } = options;
  return {
    type: 'paragraph',
    styleId: `Heading${level}`,
    name: `heading ${level}`,
    basedOn: 'Normal',
    next: 'Normal',
    qFormat: true,
    uiPriority: 9,
    paragraphProperties: {
      keepNext: true,
      keepLines: true,
      spacing: { before: TWIPS(spacingBeforePt), after: 0 },
      outlineLvl: level - 1,
    },
    runProperties: {
      ...(bold ? { bold: true } : {}),
      ...(italic ? { italic: true } : {}),
      fontSize: HP(fontSize),
      color: { val: color },
    },
  };
};

/**
 * Word 2016+ default heading styles.
 * Heading 1 gets a more generous spacing-before; the lower levels share the
 * tighter 2pt spacing the Office template uses.
 */
const BUILT_IN_STYLES: Readonly<Record<string, StyleDefinition>> = {
  Heading1: buildHeading(1, 14, HEADING_BLUE, { bold: true, spacingBeforePt: 12 }),
  Heading2: buildHeading(2, 13, HEADING_BLUE, { bold: true }),
  Heading3: buildHeading(3, 12, HEADING_DARK_BLUE, { bold: true }),
  Heading4: buildHeading(4, 11, HEADING_BLUE, { bold: true, italic: true }),
  Heading5: buildHeading(5, 11, HEADING_BLUE, { bold: true }),
  Heading6: buildHeading(6, 11, HEADING_DARK_BLUE, { bold: true }),
  Heading7: buildHeading(7, 11, HEADING_DARK_BLUE, { italic: true }),
  Heading8: buildHeading(8, 10.5, HEADING_DARK_GREY),
  Heading9: buildHeading(9, 10.5, HEADING_DARK_GREY, { italic: true }),
};

/**
 * Returns the built-in `StyleDefinition` for a well-known styleId, or `undefined`
 * if `styleId` is not one of the recognized latent styles.
 *
 * The returned object is owned by this module — callers must not mutate it.
 */
export function getBuiltInStyleDefinition(styleId: string | undefined): StyleDefinition | undefined {
  if (!styleId) return undefined;
  return BUILT_IN_STYLES[styleId];
}

/** Test-only: list of styleIds that have a built-in default. */
export function listBuiltInStyleIds(): string[] {
  return Object.keys(BUILT_IN_STYLES);
}
