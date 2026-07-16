/**
 * Editor-neutral translator for `word/theme/theme1.xml`. Produces a
 * concrete color palette plus the major/minor font scheme map.
 */
import { findChild, findChildren, type OoxmlElement } from './parse-xml.js';

export interface WordThemeColorPalette {
  readonly [colorName: string]: string;
}

export interface WordThemeFontScheme {
  readonly major?: WordThemeFontFamily;
  readonly minor?: WordThemeFontFamily;
}

export interface WordThemeFontFamily {
  readonly latin?: string;
  readonly ea?: string;
  readonly cs?: string;
}

export const DEFAULT_WORD_THEME_PALETTE: WordThemeColorPalette = {
  dk1: '#000000',
  lt1: '#FFFFFF',
  dk2: '#44546A',
  lt2: '#E7E6E6',
  accent1: '#5B9BD5',
  accent2: '#ED7D31',
  accent3: '#A5A5A5',
  accent4: '#FFC000',
  accent5: '#4472C4',
  accent6: '#70AD47',
  hlink: '#0563C1',
  folHlink: '#954F72',
};

export const DEFAULT_WORD_THEME_FONT_SCHEME: WordThemeFontScheme = {
  major: { latin: 'Calibri Light' },
  minor: { latin: 'Calibri' },
};

function parseColorPalette(theme: OoxmlElement | null | undefined): WordThemeColorPalette | undefined {
  if (!theme) return undefined;
  const themeElements = findChild(theme, 'a:themeElements');
  const clrScheme = findChild(themeElements, 'a:clrScheme');
  if (!clrScheme?.elements?.length) return undefined;
  const palette: Record<string, string> = {};
  for (const colorNode of clrScheme.elements) {
    const rawName = colorNode?.name;
    if (!rawName) continue;
    const colorName = rawName.replace(/^a:/, '');
    if (!colorName) continue;
    const valueNode = colorNode.elements?.find((el) => el.attributes && (el.attributes.val || el.attributes.lastClr));
    if (!valueNode) continue;
    // For a:sysClr, `val` is a logical name like "windowText" and `lastClr`
    // carries the actual hex. Prefer the hex when present.
    const valAttr = valueNode.attributes?.val;
    const lastClr = valueNode.attributes?.lastClr;
    const looksHex = valAttr ? /^[0-9A-Fa-f]{6}$/.test(String(valAttr).trim()) : false;
    const colorValue = lastClr ?? (looksHex ? valAttr : undefined) ?? valAttr;
    if (!colorValue) continue;
    const normalized = String(colorValue).trim();
    if (!normalized) continue;
    palette[colorName] = `#${normalized.toUpperCase()}`;
  }
  return Object.keys(palette).length ? palette : undefined;
}

function parseFontFamily(fontNode: OoxmlElement | undefined): WordThemeFontFamily | undefined {
  if (!fontNode) return undefined;
  const out: { latin?: string; ea?: string; cs?: string } = {};
  const latin = findChild(fontNode, 'a:latin');
  const typeface = latin?.attributes?.typeface;
  if (typeface) out.latin = typeface;
  const ea = findChild(fontNode, 'a:ea');
  if (ea?.attributes?.typeface) out.ea = ea.attributes.typeface;
  const cs = findChild(fontNode, 'a:cs');
  if (cs?.attributes?.typeface) out.cs = cs.attributes.typeface;
  return Object.keys(out).length ? out : undefined;
}

function parseFontScheme(theme: OoxmlElement | null | undefined): WordThemeFontScheme | undefined {
  if (!theme) return undefined;
  const themeElements = findChild(theme, 'a:themeElements');
  const fontScheme = findChild(themeElements, 'a:fontScheme');
  if (!fontScheme) return undefined;
  const majorRoot = findChild(fontScheme, 'a:majorFont');
  const minorRoot = findChild(fontScheme, 'a:minorFont');
  const major = parseFontFamily(majorRoot);
  const minor = parseFontFamily(minorRoot);
  if (!major && !minor) return undefined;
  return { major, minor };
}

export interface ThemeParseResult {
  palette?: WordThemeColorPalette;
  fontScheme?: WordThemeFontScheme;
}

/**
 * Parse the theme root (`a:theme`) into colors + font scheme. Returns an
 * empty object when the part is absent or unreadable.
 */
export function compileThemeFromRoot(root: OoxmlElement | null | undefined): ThemeParseResult {
  if (!root) return {};
  // Accept either the `a:theme` root directly or a wrapper.
  let themeRoot: OoxmlElement | null | undefined = root;
  if (root.name !== 'a:theme') {
    themeRoot = findChild(root, 'a:theme') ?? root;
  }
  const out: ThemeParseResult = {};
  const palette = parseColorPalette(themeRoot);
  if (palette) out.palette = palette;
  const fontScheme = parseFontScheme(themeRoot);
  if (fontScheme) out.fontScheme = fontScheme;
  return out;
}

/**
 * Build the v1-shaped `docx[word/theme/theme1.xml]` object that
 * existing helpers like `resolveDocxFontFamily(...)` know how to walk.
 * Preserves the original xml-js element tree so callers needing legacy
 * compatibility do not have to reimplement font resolution.
 */
export function buildLegacyThemeShape(root: OoxmlElement | null | undefined): Record<string, unknown> | undefined {
  if (!root) return undefined;
  // The v1 helper expects the file root with `.elements = [a:theme]`.
  // xml-js gives us the top element; wrap it so `theme.elements[0]` is a:theme.
  return { elements: [root] };
}

function colorSchemeEntry(name: string, value: string): OoxmlElement {
  return {
    type: 'element',
    name: `a:${name}`,
    elements: [
      {
        type: 'element',
        name: 'a:srgbClr',
        attributes: {
          val: value.replace(/^#/, '').toUpperCase(),
        },
      },
    ],
  };
}

function fontSchemeEntry(name: 'a:majorFont' | 'a:minorFont', fontFamily?: WordThemeFontFamily): OoxmlElement {
  return {
    type: 'element',
    name,
    elements: [
      {
        type: 'element',
        name: 'a:latin',
        attributes: {
          typeface: fontFamily?.latin ?? '',
        },
      },
      {
        type: 'element',
        name: 'a:ea',
        attributes: {
          typeface: fontFamily?.ea ?? '',
        },
      },
      {
        type: 'element',
        name: 'a:cs',
        attributes: {
          typeface: fontFamily?.cs ?? '',
        },
      },
    ],
  };
}

export function buildFallbackThemeShape(
  theme: ThemeParseResult = {
    palette: DEFAULT_WORD_THEME_PALETTE,
    fontScheme: DEFAULT_WORD_THEME_FONT_SCHEME,
  },
): Record<string, unknown> {
  const palette = theme.palette ?? DEFAULT_WORD_THEME_PALETTE;
  const fontScheme = theme.fontScheme ?? DEFAULT_WORD_THEME_FONT_SCHEME;

  return {
    elements: [
      {
        type: 'element',
        name: 'a:theme',
        elements: [
          {
            type: 'element',
            name: 'a:themeElements',
            elements: [
              {
                type: 'element',
                name: 'a:clrScheme',
                elements: [
                  colorSchemeEntry('dk1', palette.dk1 ?? DEFAULT_WORD_THEME_PALETTE.dk1),
                  colorSchemeEntry('lt1', palette.lt1 ?? DEFAULT_WORD_THEME_PALETTE.lt1),
                  colorSchemeEntry('dk2', palette.dk2 ?? DEFAULT_WORD_THEME_PALETTE.dk2),
                  colorSchemeEntry('lt2', palette.lt2 ?? DEFAULT_WORD_THEME_PALETTE.lt2),
                  colorSchemeEntry('accent1', palette.accent1 ?? DEFAULT_WORD_THEME_PALETTE.accent1),
                  colorSchemeEntry('accent2', palette.accent2 ?? DEFAULT_WORD_THEME_PALETTE.accent2),
                  colorSchemeEntry('accent3', palette.accent3 ?? DEFAULT_WORD_THEME_PALETTE.accent3),
                  colorSchemeEntry('accent4', palette.accent4 ?? DEFAULT_WORD_THEME_PALETTE.accent4),
                  colorSchemeEntry('accent5', palette.accent5 ?? DEFAULT_WORD_THEME_PALETTE.accent5),
                  colorSchemeEntry('accent6', palette.accent6 ?? DEFAULT_WORD_THEME_PALETTE.accent6),
                  colorSchemeEntry('hlink', palette.hlink ?? DEFAULT_WORD_THEME_PALETTE.hlink),
                  colorSchemeEntry('folHlink', palette.folHlink ?? DEFAULT_WORD_THEME_PALETTE.folHlink),
                ],
              },
              {
                type: 'element',
                name: 'a:fontScheme',
                elements: [
                  fontSchemeEntry('a:majorFont', fontScheme.major),
                  fontSchemeEntry('a:minorFont', fontScheme.minor),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

// Re-export findChildren so test code can introspect.
export { findChildren };
