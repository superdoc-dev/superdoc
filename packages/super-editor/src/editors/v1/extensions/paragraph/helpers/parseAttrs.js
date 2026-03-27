const CSS_LENGTH_TO_PT = { pt: 1, px: 72 / 96, in: 72, cm: 28.3465, mm: 2.83465 };
const CSS_ALIGN_TO_OOXML = { center: 'center', right: 'right', justify: 'justify', end: 'right' };

/**
 * Parse a CSS length value and return { points, unit }.
 * Returns null for empty or unrecognized-unit values.
 * Negative values are allowed (needed for text-indent hanging indents).
 */
function parseCssLength(value) {
  if (!value) return null;
  const match = value.match(/^(-?[0-9]*\.?[0-9]+)\s*(%|[a-z]*)$/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const unit = match[2];
  if (!unit) return { points: num, unit: '' };
  if (unit === '%') return { points: num, unit: '%' };
  const factor = CSS_LENGTH_TO_PT[unit];
  return factor != null ? { points: num * factor, unit } : null;
}

export function parseAttrs(node) {
  const numberingProperties = {};
  let indent, spacing;
  const { styleid: styleId, ...extraAttrs } = Array.from(node.attributes).reduce((acc, attr) => {
    if (attr.name === 'data-num-id') {
      numberingProperties.numId = parseInt(attr.value);
    } else if (attr.name === 'data-level') {
      numberingProperties.ilvl = parseInt(attr.value);
    } else if (attr.name === 'data-indent') {
      try {
        indent = JSON.parse(attr.value);
        // Ensure numeric values
        Object.keys(indent).forEach((key) => {
          indent[key] = Number(indent[key]);
        });
      } catch {
        // ignore invalid indent value
      }
    } else if (attr.name === 'data-spacing') {
      try {
        spacing = JSON.parse(attr.value);
        // Ensure numeric values (skip lineRule which is a string like 'auto')
        Object.keys(spacing).forEach((key) => {
          if (key !== 'lineRule') spacing[key] = Number(spacing[key]);
        });
      } catch {
        // ignore invalid spacing value
      }
    } else {
      acc[attr.name] = attr.value;
    }
    return acc;
  }, {});

  // CSS inline style fallback for spacing (e.g. Google Docs paste)
  if (!spacing && node.style) {
    const cssSpacing = {};

    const lh = parseCssLength(node.style.lineHeight);
    if (lh && lh.points > 0) {
      if (lh.unit === '' || lh.unit === '%') {
        // Unitless (1.5) or percentage (115%) → auto multiplier
        const multiplier = lh.unit === '%' ? lh.points / 100 : lh.points;
        // Invert pm-adapter's normalizeLineValue (value * 1.15 / 240) so
        // values round-trip correctly through import → render → export.
        cssSpacing.line = Math.round((multiplier * 240) / 1.15);
        cssSpacing.lineRule = 'auto';
      } else {
        // Absolute length (pt, px, in, cm, mm) → exact twips
        cssSpacing.line = Math.round(lh.points * 20);
        cssSpacing.lineRule = 'exact';
      }
    }

    const mt = parseCssLength(node.style.marginTop);
    if (mt && mt.unit !== '%' && mt.points >= 0) cssSpacing.before = Math.round(mt.points * 20);

    const mb = parseCssLength(node.style.marginBottom);
    if (mb && mb.unit !== '%' && mb.points >= 0) cssSpacing.after = Math.round(mb.points * 20);

    if (Object.keys(cssSpacing).length > 0) {
      spacing = cssSpacing;
    }
  }

  // CSS inline style fallback for indent (e.g. Google Docs paste)
  if (!indent && node.style) {
    const cssIndent = {};

    const ml = parseCssLength(node.style.marginLeft);
    if (ml && ml.unit !== '%' && ml.points >= 0) cssIndent.left = Math.round(ml.points * 20);

    const ti = parseCssLength(node.style.textIndent);
    if (ti && ti.unit !== '%') {
      if (ti.points >= 0) {
        cssIndent.firstLine = Math.round(ti.points * 20);
      } else {
        cssIndent.hanging = Math.round(Math.abs(ti.points) * 20);
      }
    }

    if (Object.keys(cssIndent).length > 0) {
      indent = cssIndent;
    }
  }

  // CSS inline style fallback for text-align (e.g. Google Docs paste)
  // Skip 'left' — Google Docs sets text-align: left on every paragraph,
  // and storing it would bake in unnecessary direct formatting on export.
  let justification;
  if (!justification && node.style) {
    const textAlign = node.style.textAlign;
    if (textAlign && CSS_ALIGN_TO_OOXML[textAlign]) {
      justification = CSS_ALIGN_TO_OOXML[textAlign];
    }
  }

  let attrs = {
    paragraphProperties: {
      styleId: styleId || null,
    },
    extraAttrs,
  };

  if (indent && Object.keys(indent).length > 0) {
    attrs.paragraphProperties.indent = indent;
  }

  if (spacing && Object.keys(spacing).length > 0) {
    attrs.paragraphProperties.spacing = spacing;
  }

  if (justification) {
    attrs.paragraphProperties.justification = justification;
  }

  if (Object.keys(numberingProperties).length > 0) {
    attrs.paragraphProperties.numberingProperties = numberingProperties;
  }

  return attrs;
}
