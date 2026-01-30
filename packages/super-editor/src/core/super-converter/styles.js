// @ts-check
import {
  halfPointToPoints,
  ptToTwips,
  twipsToPt,
  twipsToPixels,
  twipsToLines,
  eighthPointsToPixels,
  linesToTwips,
} from '@converter/helpers.js';
import { isValidHexColor, getHexColorFromDocxSystem } from '@converter/helpers';
import { SuperConverter } from '@converter/SuperConverter.js';
import { getUnderlineCssString } from '@extensions/linked-styles/underline-css.js';
import {
  resolveDocxFontFamily,
  resolveRunProperties,
  resolveParagraphProperties,
  combineRunProperties,
} from '@superdoc/style-engine/ooxml';

export { resolveRunProperties, resolveParagraphProperties, combineRunProperties };

/**
 * Font family converter from SuperConverter (lazy getter to avoid circular import)
 * @returns {(fontName: string, docx?: Record<string, unknown>) => string}
 */
const getToCssFontFamily = () => {
  // @ts-expect-error - SuperConverter.toCssFontFamily exists but isn't typed
  return SuperConverter.toCssFontFamily;
};

/**
 * Font size scaling factor for subscript and superscript text.
 * This value (0.65 or 65%) matches Microsoft Word's default rendering behavior
 * for vertical alignment (w:vertAlign) when set to 'superscript' or 'subscript'.
 * Applied to the base font size to reduce text size for sub/superscripts.
 */
const SUBSCRIPT_SUPERSCRIPT_SCALE = 0.65;

/**
 * Encodes run property objects into mark definitions for the editor schema.
 * @param {Object} runProperties - Run properties extracted from DOCX.
 * @param {Object} docx - Parsed DOCX structure used for theme lookups.
 * @returns {Array<Object>} Mark definitions representing the run styling.
 */
export function encodeMarksFromRPr(runProperties, docx) {
  const marks = [];
  const textStyleAttrs = {};
  let highlightColor = null;
  let hasHighlightTag = false;
  Object.keys(runProperties).forEach((key) => {
    const value = runProperties[key];
    switch (key) {
      case 'strike':
      case 'italic':
      case 'bold':
        // case 'boldCs':
        marks.push({ type: key, attrs: { value } });
        break;
      case 'textTransform':
        textStyleAttrs[key] = value;
        break;
      case 'color':
        if (!value.val) {
          textStyleAttrs[key] = null;
        } else if (value.val.toLowerCase() === 'auto') {
          textStyleAttrs[key] = value.val;
        } else {
          textStyleAttrs[key] = `#${value['val'].replace('#', '').toUpperCase()}`;
        }
        break;
      case 'underline':
        let underlineType = value['w:val'];
        if (!underlineType) {
          break;
        }
        let underlineColor = value['w:color'];
        if (underlineColor && underlineColor.toLowerCase() !== 'auto' && !underlineColor.startsWith('#')) {
          underlineColor = `#${underlineColor}`;
        }
        marks.push({
          type: key,
          attrs: {
            underlineType,
            underlineColor,
          },
        });
        break;
      case 'styleId':
        textStyleAttrs[key] = value;
        break;
      case 'fontSize':
        // case 'fontSizeCs':
        const points = halfPointToPoints(value);
        textStyleAttrs[key] = `${points}pt`;
        break;
      case 'letterSpacing':
        const spacing = twipsToPt(value);
        textStyleAttrs[key] = `${spacing}pt`;
        break;
      case 'fontFamily':
        const fontFamily = resolveDocxFontFamily(value, docx, getToCssFontFamily());
        textStyleAttrs[key] = fontFamily;
        // value can be a string (from resolveRunPropertiesFromParagraphStyle) or an object
        const eastAsiaFamily = typeof value === 'object' && value !== null ? value['eastAsia'] : undefined;

        if (eastAsiaFamily) {
          const eastAsiaCss = getFontFamilyValue({ 'w:ascii': eastAsiaFamily }, docx);
          if (!fontFamily || eastAsiaCss !== textStyleAttrs.fontFamily) {
            textStyleAttrs.eastAsiaFontFamily = eastAsiaCss;
          }
        }
        break;
      case 'highlight':
        const color = getHighLightValue(value);
        if (color) {
          hasHighlightTag = true;
          highlightColor = color;
        }
        break;
      case 'shading': {
        if (hasHighlightTag) {
          break;
        }
        const fill = value['fill'];
        const shdVal = value['val'];
        if (fill && String(fill).toLowerCase() !== 'auto') {
          highlightColor = `#${String(fill).replace('#', '')}`;
        } else if (typeof shdVal === 'string') {
          const normalized = shdVal.toLowerCase();
          if (normalized === 'clear' || normalized === 'nil' || normalized === 'none') {
            highlightColor = 'transparent';
          }
        }
        break;
      }
      case 'vertAlign': {
        if (value) {
          textStyleAttrs.vertAlign = value;
        }
        break;
      }
      case 'position': {
        if (value != null && Number.isFinite(value)) {
          const points = halfPointToPoints(value);
          if (Number.isFinite(points)) {
            textStyleAttrs.position = `${points}pt`;
          }
        }
        break;
      }
    }
  });

  if (Object.keys(textStyleAttrs).length) {
    marks.push({ type: 'textStyle', attrs: textStyleAttrs });
  }

  if (highlightColor) {
    marks.push({ type: 'highlight', attrs: { color: highlightColor } });
  }

  return marks;
}

/**
 * Converts paragraph properties into a CSS declaration map.
 * @param {Object} paragraphProperties - Paragraph properties after resolution.
 * @param {boolean} hasPreviousParagraph - Whether there is a preceding paragraph.
 * @param {Object | null} nextParagraphProps - Resolved properties of the next paragraph.
 * @returns {Object} CSS properties keyed by CSS property name.
 */
export function encodeCSSFromPPr(paragraphProperties, hasPreviousParagraph, nextParagraphProps) {
  if (!paragraphProperties || typeof paragraphProperties !== 'object') {
    return {};
  }

  let css = {};
  const { spacing, indent, borders, justification } = paragraphProperties;
  const nextStyleId = nextParagraphProps?.styleId;

  if (spacing) {
    const getEffectiveBefore = (nextSpacing, isListItem) => {
      if (!nextSpacing) return 0;
      if (nextSpacing.beforeAutospacing && isListItem) {
        return 0;
      }
      return nextSpacing.before || 0;
    };

    const isDropCap = Boolean(paragraphProperties.framePr?.dropCap);
    const spacingCopy = { ...spacing };
    if (hasPreviousParagraph) {
      delete spacingCopy.before; // Has already been handled by the previous paragraph
    }
    if (isDropCap) {
      spacingCopy.line = linesToTwips(1.0);
      spacingCopy.lineRule = 'auto';
      delete spacingCopy.after;
    } else {
      const nextBefore = getEffectiveBefore(
        nextParagraphProps?.spacing,
        Boolean(nextParagraphProps?.numberingProperties),
      );
      spacingCopy.after = Math.max(spacingCopy.after || 0, nextBefore);
      if (paragraphProperties.contextualSpacing && nextStyleId != null && nextStyleId === paragraphProperties.styleId) {
        spacingCopy.after -= paragraphProperties.spacing?.after || 0;
      }

      if (nextParagraphProps?.contextualSpacing && nextStyleId != null && nextStyleId === paragraphProperties.styleId) {
        spacingCopy.after -= nextBefore;
      }

      spacingCopy.after = Math.max(spacingCopy.after, 0);
    }
    const spacingStyle = getSpacingStyle(spacingCopy, Boolean(paragraphProperties.numberingProperties));
    css = { ...css, ...spacingStyle };
  }

  if (indent && typeof indent === 'object') {
    const hasIndentValue = Object.values(indent).some((value) => value != null && Number(value) !== 0);
    if (hasIndentValue) {
      const { left, right, firstLine, hanging } = indent;
      if (left != null) {
        css['margin-left'] = `${twipsToPixels(left)}px`;
      }
      if (right != null) {
        css['margin-right'] = `${twipsToPixels(right)}px`;
      }
      if (firstLine != null && !hanging) {
        css['text-indent'] = `${twipsToPixels(firstLine)}px`;
      }
      if (firstLine != null && hanging != null) {
        css['text-indent'] = `${twipsToPixels(firstLine - hanging)}px`;
      }
      if (firstLine == null && hanging != null) {
        css['text-indent'] = `${twipsToPixels(-hanging)}px`;
      }
    }
  }

  if (borders && typeof borders === 'object') {
    const sideOrder = ['top', 'right', 'bottom', 'left'];
    const valToCss = {
      single: 'solid',
      dashed: 'dashed',
      dotted: 'dotted',
      double: 'double',
    };

    sideOrder.forEach((side) => {
      const b = borders[side];
      if (!b) return;
      if (['nil', 'none', undefined, null].includes(b.val)) {
        css[`border-${side}`] = 'none';
        return;
      }

      const width = b.size != null ? `${eighthPointsToPixels(b.size)}px` : '1px';
      const cssStyle = valToCss[b.val] || 'solid';
      const color = !b.color || b.color === 'auto' ? '#000000' : `#${b.color}`;

      css[`border-${side}`] = `${width} ${cssStyle} ${color}`;

      if (b.space != null && side === 'bottom') {
        css[`padding-bottom`] = `${eighthPointsToPixels(b.space)}px`;
      }
    });
  }

  if (justification) {
    if (justification === 'both') {
      css['text-align'] = 'justify';
    } else {
      css['text-align'] = justification;
    }
  }

  return css;
}

/**
 * Converts run properties into a CSS declaration map.
 * @param {Object} runProperties - Run properties after resolution.
 * @param {Object} docx - Parsed DOCX content used for theme lookups.
 * @returns {Object} CSS properties keyed by CSS property name.
 */
export function encodeCSSFromRPr(runProperties, docx) {
  if (!runProperties || typeof runProperties !== 'object') {
    return {};
  }

  const css = {};
  const textDecorationLines = new Set();
  let hasTextDecorationNone = false;
  let highlightColor = null;
  let hasHighlightTag = false;
  let verticalAlignValue;
  let fontSizeOverride;

  Object.keys(runProperties).forEach((key) => {
    const value = runProperties[key];
    switch (key) {
      case 'bold': {
        const normalized = normalizeToggleValue(value);
        if (normalized === true) {
          css['font-weight'] = 'bold';
        } else if (normalized === false) {
          css['font-weight'] = 'normal';
        }
        break;
      }
      case 'italic': {
        const normalized = normalizeToggleValue(value);
        if (normalized === true) {
          css['font-style'] = 'italic';
        } else if (normalized === false) {
          css['font-style'] = 'normal';
        }
        break;
      }
      case 'strike': {
        const normalized = normalizeToggleValue(value);
        if (normalized === true) {
          addTextDecorationEntries(textDecorationLines, 'line-through');
        } else if (normalized === false) {
          css['text-decoration'] = 'none';
          hasTextDecorationNone = true;
        }
        break;
      }
      case 'textTransform': {
        if (value != null) {
          css['text-transform'] = value;
        }
        break;
      }
      case 'color': {
        const colorVal = value?.val;
        if (colorVal == null || colorVal === '') {
          break;
        }
        if (String(colorVal).toLowerCase() === 'auto') {
          css['color'] = 'auto';
        } else {
          css['color'] = `#${String(colorVal).replace('#', '').toUpperCase()}`;
        }
        break;
      }
      case 'underline': {
        const underlineType = value?.['w:val'];
        if (!underlineType) break;
        let underlineColor = value?.['w:color'];
        if (
          underlineColor &&
          typeof underlineColor === 'string' &&
          underlineColor.toLowerCase() !== 'auto' &&
          !underlineColor.startsWith('#')
        ) {
          underlineColor = `#${underlineColor}`;
        }

        const underlineCssString = getUnderlineCssString({ type: underlineType, color: underlineColor });
        const underlineCss = parseCssDeclarations(underlineCssString);

        Object.entries(underlineCss).forEach(([prop, propValue]) => {
          if (!propValue) return;
          if (prop === 'text-decoration') {
            css[prop] = propValue;
            if (propValue === 'none') {
              hasTextDecorationNone = true;
            }
            return;
          }
          if (prop === 'text-decoration-line') {
            addTextDecorationEntries(textDecorationLines, propValue);
            return;
          }
          css[prop] = propValue;
        });
        break;
      }
      case 'fontSize': {
        if (value == null) break;
        const points = halfPointToPoints(value);
        if (Number.isFinite(points)) {
          css['font-size'] = `${points}pt`;
        }
        break;
      }
      case 'letterSpacing': {
        if (value == null) break;
        const spacing = twipsToPt(value);
        if (Number.isFinite(spacing)) {
          css['letter-spacing'] = `${spacing}pt`;
        }
        break;
      }
      case 'fontFamily': {
        if (!value) break;
        const fontFamily = resolveDocxFontFamily(value, docx, getToCssFontFamily());
        if (fontFamily) {
          css['font-family'] = fontFamily;
        }
        // value can be a string (from resolveRunPropertiesFromParagraphStyle) or an object
        const eastAsiaFamily = typeof value === 'object' && value !== null ? value['eastAsia'] : undefined;
        if (eastAsiaFamily) {
          const eastAsiaCss = getFontFamilyValue({ 'w:ascii': eastAsiaFamily }, docx);
          if (eastAsiaCss && (!fontFamily || eastAsiaCss !== fontFamily)) {
            css['font-family'] = css['font-family'] || eastAsiaCss;
          }
        }
        break;
      }
      case 'highlight': {
        const color = getHighLightValue(value);
        if (color) {
          hasHighlightTag = true;
          highlightColor = color;
        }
        break;
      }
      case 'shading': {
        if (hasHighlightTag) {
          break;
        }
        const fill = value?.['fill'];
        const shdVal = value?.['val'];
        if (fill && String(fill).toLowerCase() !== 'auto') {
          highlightColor = `#${String(fill).replace('#', '')}`;
        } else if (typeof shdVal === 'string') {
          const normalized = shdVal.toLowerCase();
          if (normalized === 'clear' || normalized === 'nil' || normalized === 'none') {
            highlightColor = 'transparent';
          }
        }
        break;
      }
      case 'vertAlign': {
        // Skip if position is present - position takes precedence over vertAlign
        if (runProperties.position != null && Number.isFinite(runProperties.position)) {
          break;
        }
        if (value === 'superscript' || value === 'subscript') {
          verticalAlignValue = value === 'superscript' ? 'super' : 'sub';
          if (runProperties.fontSize != null && Number.isFinite(runProperties.fontSize)) {
            const scaledPoints = halfPointToPoints(runProperties.fontSize * SUBSCRIPT_SUPERSCRIPT_SCALE);
            if (Number.isFinite(scaledPoints)) {
              fontSizeOverride = `${scaledPoints}pt`;
            }
          } else {
            fontSizeOverride = `${SUBSCRIPT_SUPERSCRIPT_SCALE * 100}%`;
          }
        } else if (value === 'baseline') {
          verticalAlignValue = 'baseline';
        }
        break;
      }
      case 'position': {
        if (value != null && Number.isFinite(value)) {
          const points = halfPointToPoints(value);
          if (Number.isFinite(points)) {
            verticalAlignValue = `${points}pt`;
            // Position takes precedence over vertAlign, so clear font-size override
            fontSizeOverride = undefined;
          }
        }
        break;
      }
      default:
        break;
    }
  });

  if (!hasTextDecorationNone && textDecorationLines.size) {
    const combined = new Set();
    addTextDecorationEntries(combined, css['text-decoration-line']);
    textDecorationLines.forEach((entry) => combined.add(entry));
    css['text-decoration-line'] = Array.from(combined).join(' ');
  }

  if (highlightColor) {
    css['background-color'] = highlightColor;
    if (!('color' in css)) {
      // @ts-expect-error - CSS object allows string indexing
      css['color'] = 'inherit';
    }
  }

  if (fontSizeOverride) {
    css['font-size'] = fontSizeOverride;
  }

  if (verticalAlignValue) {
    css['vertical-align'] = verticalAlignValue;
  }

  return css;
}

/**
 * Decodes mark definitions back into run property objects.
 * @param {Array<Object>} marks - Mark array from the editor schema.
 * @returns {Object} Run property object.
 */
export function decodeRPrFromMarks(marks) {
  const runProperties = {};
  if (!marks) {
    return runProperties;
  }

  marks.forEach((mark) => {
    const type = mark.type.name ?? mark.type;
    switch (type) {
      case 'strike':
      case 'italic':
      case 'bold':
        runProperties[type] = mark.attrs.value !== '0' && mark.attrs.value !== false;
        break;
      case 'underline': {
        const { underlineType, underlineColor } = mark.attrs;
        const underlineAttrs = {};
        if (underlineType) {
          underlineAttrs['w:val'] = underlineType;
        }
        if (underlineColor) {
          underlineAttrs['w:color'] = underlineColor.replace('#', '');
        }
        if (Object.keys(underlineAttrs).length > 0) {
          runProperties.underline = underlineAttrs;
        }
        break;
      }
      case 'highlight':
        if (mark.attrs.color) {
          if (mark.attrs.color.toLowerCase() === 'transparent') {
            runProperties.highlight = { 'w:val': 'none' };
          } else {
            runProperties.highlight = { 'w:val': mark.attrs.color };
          }
        }
        break;
      case 'link':
        runProperties.styleId = 'Hyperlink';
        break;
      case 'textStyle':
        Object.keys(mark.attrs).forEach((attr) => {
          const value = mark.attrs[attr];
          switch (attr) {
            case 'textTransform':
              if (value != null) {
                runProperties[attr] = value;
              }
              break;
            case 'color':
              if (value != null) {
                runProperties.color = { val: value.replace('#', '') };
              }
              break;
            case 'fontSize': {
              const points = parseFloat(value);
              if (!isNaN(points)) {
                runProperties.fontSize = points * 2;
              }
              break;
            }
            case 'letterSpacing': {
              const ptValue = parseFloat(value);
              if (!isNaN(ptValue)) {
                // convert to twips
                runProperties.letterSpacing = ptToTwips(ptValue);
              }
              break;
            }
            case 'fontFamily':
              if (value != null) {
                const cleanValue = value.split(',')[0].trim();
                const result = {};
                ['ascii', 'eastAsia', 'hAnsi', 'cs'].forEach((attr) => {
                  result[attr] = cleanValue;
                });
                runProperties.fontFamily = result;
              }
              break;
            case 'vertAlign':
              if (value != null) {
                runProperties.vertAlign = value;
              }
              break;
            case 'position': {
              if (value != null) {
                const numeric = parseFloat(value);
                if (!isNaN(numeric)) {
                  runProperties.position = numeric * 2;
                }
              }
              break;
            }
          }
        });
        break;
    }
  });

  return runProperties;
}

/**
 * Resolves a DOCX font family entry (including theme links) to a CSS font-family string.
 * @param {Object} attributes - Font family attributes from run properties.
 * @param {Object} docx - Parsed DOCX package for theme lookups.
 * @returns {string|null} CSS-ready font-family string or null if unresolved.
 */
function getFontFamilyValue(attributes, docx) {
  const ascii = attributes['w:ascii'] ?? attributes['ascii'];
  const themeAscii = attributes['w:asciiTheme'] ?? attributes['asciiTheme'];

  let resolved = ascii;

  if (docx && themeAscii) {
    const theme = docx['word/theme/theme1.xml'];
    if (theme?.elements?.length) {
      const { elements: topElements } = theme;
      const { elements } = topElements[0] || {};
      const themeElements = elements?.find((el) => el.name === 'a:themeElements');
      const fontScheme = themeElements?.elements?.find((el) => el.name === 'a:fontScheme');
      const prefix = themeAscii.startsWith('minor') ? 'minor' : 'major';
      const font = fontScheme?.elements?.find((el) => el.name === `a:${prefix}Font`);
      const latin = font?.elements?.find((el) => el.name === 'a:latin');
      resolved = latin?.attributes?.typeface || resolved;
    }
  }

  if (!resolved) return null;

  // @ts-expect-error - toCssFontFamily is a static method on SuperConverter
  return SuperConverter.toCssFontFamily(resolved, docx);
}

/**
 * Normalizes highlight/shading attributes to a CSS color value.
 * @param {Object} attributes - Highlight attributes from run properties.
 * @returns {string|null} Hex color string, 'transparent', or null when unsupported.
 */
function getHighLightValue(attributes) {
  const fill = attributes['w:fill'];
  if (fill && fill !== 'auto') return `#${fill}`;
  if (attributes?.['w:val'] === 'none') return 'transparent';
  if (isValidHexColor(attributes?.['w:val'])) return `#${attributes['w:val']}`;
  return getHexColorFromDocxSystem(attributes?.['w:val']) || null;
}

/**
 * Normalizes various toggle representations into booleans.
 * @param {unknown} value - Toggle value from DOCX (bool/number/string).
 * @returns {boolean|null} Normalized boolean or null when indeterminate.
 */
function normalizeToggleValue(value) {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === '0' || normalized === 'false' || normalized === 'off') return false;
    if (normalized === '1' || normalized === 'true' || normalized === 'on') return true;
  }
  return Boolean(value);
}

/**
 * Parses a CSS declaration string into an object map.
 * @param {string} cssString - CSS string such as "color: red; font-size: 12pt".
 * @returns {Object} Key/value pairs for CSS declarations.
 */
function parseCssDeclarations(cssString) {
  if (!cssString || typeof cssString !== 'string') {
    return {};
  }
  return cssString
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, declaration) => {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex === -1) return acc;
      const property = declaration.slice(0, separatorIndex).trim();
      const value = declaration.slice(separatorIndex + 1).trim();
      if (!property || !value) return acc;
      acc[property] = value;
      return acc;
    }, {});
}

/**
 * Adds one or more text-decoration entries to a target Set.
 * @param {Set<string>} targetSet - Set collecting decoration keywords.
 * @param {string|Set<string>} value - Decoration string or Set to merge.
 */
function addTextDecorationEntries(targetSet, value) {
  if (!value) return;
  if (value instanceof Set) {
    value.forEach((entry) => addTextDecorationEntries(targetSet, entry));
    return;
  }
  String(value)
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => targetSet.add(entry));
}

/**
 * Converts paragraph spacing values into a CSS style object.
 * @param {Object} spacing - Spacing values expressed in twips.
 * @param {boolean} [isListItem] - Whether the spacing belongs to a list item (affects autospacing).
 * @returns {Object} CSS properties keyed by CSS property name.
 */
export const getSpacingStyle = (spacing, isListItem) => {
  let { before, after, line, lineRule, beforeAutospacing, afterAutospacing } = spacing;
  line = twipsToLines(line);
  // Prevent values less than 1 to avoid squashed text
  if (line != null && line < 1) {
    line = 1;
  }
  if (lineRule === 'exact' && line) {
    line = String(line);
  }

  before = twipsToPixels(before);
  if (beforeAutospacing) {
    if (isListItem) {
      before = 0; // Lists do not apply before autospacing
    }
  }

  after = twipsToPixels(after);
  if (afterAutospacing) {
    if (isListItem) {
      after = 0; // Lists do not apply after autospacing
    }
  }

  const css = {};
  if (before) {
    css['margin-top'] = `${before}px`;
  }
  if (after) {
    css['margin-bottom'] = `${after}px`;
  }
  if (line) {
    if (lineRule !== 'atLeast' || line >= 1) {
      // Prevent values less than 1 to avoid squashed text (unless using explicit units like pt)
      line = Math.max(line, 1);
      css['line-height'] = String(line);
    }
  }

  return css;
};
