/**
 * Converts a theme color name to its corresponding hex color value.
 * Uses the default Office theme color palette.
 * @param {string} name - The theme color name
 * @returns {string} Hex color value
 */
export function getThemeColor(name) {
  const colors = {
    accent1: '#5b9bd5',
    accent2: '#ed7d31',
    accent3: '#a5a5a5',
    accent4: '#ffc000',
    accent5: '#4472c4',
    accent6: '#70ad47',
    dk1: '#000000',
    lt1: '#ffffff',
    dk2: '#1f497d',
    lt2: '#eeece1',
    text1: '#000000',
    text2: '#1f497d',
    background1: '#ffffff',
    background2: '#eeece1',
    // Office XML shortcuts
    bg1: '#ffffff',
    bg2: '#eeece1',
  };
  return colors[name] ?? '#000000';
}

/**
 * Applies a color modifier to a hex color.
 * Used to transform Office theme colors according to DrawingML specifications.
 * @param {string} hexColor - The hex color to modify
 * @param {'shade'|'tint'|'lumMod'|'lumOff'} modifier - The type of color modification to apply
 * @param {string|number} value - The modifier value in Office format
 * @returns {string} The modified hex color
 */
export function applyColorModifier(hexColor, modifier, value) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const percent = parseInt(value) / 100000;

  let newR, newG, newB;
  if (modifier === 'shade' || modifier === 'lumMod') {
    newR = r * percent;
    newG = g * percent;
    newB = b * percent;
  } else if (modifier === 'tint') {
    newR = r + (255 - r) * percent;
    newG = g + (255 - g) * percent;
    newB = b + (255 - b) * percent;
  } else if (modifier === 'lumOff') {
    const offset = 255 * percent;
    newR = r + offset;
    newG = g + offset;
    newB = b + offset;
  } else {
    return hexColor;
  }

  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n) => n.toString(16).padStart(2, '0');

  newR = clamp(newR);
  newG = clamp(newG);
  newB = clamp(newB);

  const result = `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
  return result;
}

/**
 * Extracts the stroke width from a shape's properties (spPr).
 * @param {Object} spPr - The shape properties element
 * @returns {number} The stroke width in pixels, or 1 if not found
 */
export function extractStrokeWidth(spPr) {
  const ln = spPr?.elements?.find((el) => el.name === 'a:ln');
  const w = ln?.attributes?.['w'];
  if (!w) return 1;

  // Convert EMUs to pixels for stroke width using 72 DPI to match Word's rendering
  // Word appears to use 72 DPI for stroke widths rather than the standard 96 DPI
  // This gives us: 19050 EMUs * 72 / 914400 = 1.5 pixels (renders closer to 1px in browsers)
  const emu = typeof w === 'string' ? parseFloat(w) : w;
  const STROKE_DPI = 72;
  return (emu * STROKE_DPI) / 914400;
}

/**
 * Extracts line end marker configuration (arrowheads) from a shape's properties.
 * @param {Object} spPr - The shape properties element
 * @returns {{ head?: { type?: string, width?: string, length?: string }, tail?: { type?: string, width?: string, length?: string } }|null}
 *   Line end configuration, or null when not present.
 */
export function extractLineEnds(spPr) {
  const ln = spPr?.elements?.find((el) => el.name === 'a:ln');
  if (!ln?.elements) return null;

  const parseEnd = (name) => {
    const end = ln.elements.find((el) => el.name === name);
    if (!end?.attributes) return null;
    const type = end.attributes?.['type'];
    if (!type || type === 'none') return null;
    const width = end.attributes?.['w'];
    const length = end.attributes?.['len'];
    return { type, width, length };
  };

  const head = parseEnd('a:headEnd');
  const tail = parseEnd('a:tailEnd');

  if (!head && !tail) return null;
  return { head: head ?? undefined, tail: tail ?? undefined };
}

/**
 * Extracts the stroke color from a shape's properties.
 * Checks direct stroke definition in spPr first, then falls back to style reference.
 * @param {Object} spPr - The shape properties element
 * @param {Object} style - The shape style element (wps:style)
 * @returns {string|null} Hex color value
 */
export function extractStrokeColor(spPr, style) {
  const ln = spPr?.elements?.find((el) => el.name === 'a:ln');

  if (ln) {
    const noFill = ln.elements?.find((el) => el.name === 'a:noFill');
    if (noFill) {
      return null;
    }

    const solidFill = ln.elements?.find((el) => el.name === 'a:solidFill');
    if (solidFill) {
      const schemeClr = solidFill.elements?.find((el) => el.name === 'a:schemeClr');

      if (schemeClr) {
        const themeName = schemeClr.attributes?.['val'];
        let color = getThemeColor(themeName);

        const modifiers = schemeClr.elements || [];
        modifiers.forEach((mod) => {
          if (mod.name === 'a:shade') {
            color = applyColorModifier(color, 'shade', mod.attributes['val']);
          } else if (mod.name === 'a:tint') {
            color = applyColorModifier(color, 'tint', mod.attributes['val']);
          } else if (mod.name === 'a:lumMod') {
            color = applyColorModifier(color, 'lumMod', mod.attributes['val']);
          }
        });
        return color;
      }

      const srgbClr = solidFill.elements?.find((el) => el.name === 'a:srgbClr');
      if (srgbClr) {
        return '#' + srgbClr.attributes?.['val'];
      }
    }
  }

  // No stroke specified in spPr, check style reference
  // Per ECMA-376: when no stroke is specified and no style exists, shape should have no stroke
  if (!style) {
    return null;
  }

  const lnRef = style.elements?.find((el) => el.name === 'a:lnRef');
  if (!lnRef) {
    // No lnRef in style means no stroke specified - return null
    return null;
  }

  // Per OOXML spec, lnRef idx="0" means "no stroke" - return null
  const lnRefIdx = lnRef.attributes?.['idx'];
  if (lnRefIdx === '0') {
    return null;
  }

  const schemeClr = lnRef.elements?.find((el) => el.name === 'a:schemeClr');
  if (!schemeClr) {
    // No schemeClr in lnRef - return null rather than default black
    return null;
  }

  const themeName = schemeClr.attributes?.['val'];
  let color = getThemeColor(themeName);

  const modifiers = schemeClr.elements || [];
  modifiers.forEach((mod) => {
    if (mod.name === 'a:shade') {
      color = applyColorModifier(color, 'shade', mod.attributes['val']);
    } else if (mod.name === 'a:tint') {
      color = applyColorModifier(color, 'tint', mod.attributes['val']);
    } else if (mod.name === 'a:lumMod') {
      color = applyColorModifier(color, 'lumMod', mod.attributes['val']);
    } else if (mod.name === 'a:lumOff') {
      color = applyColorModifier(color, 'lumOff', mod.attributes['val']);
    }
  });

  return color;
}

/**
 * Extracts the fill color from a shape's properties.
 * Checks direct fill definition in spPr first, then falls back to style reference.
 * @param {Object} spPr - The shape properties element
 * @param {Object} style - The shape style element (wps:style)
 * @returns {string|null} Hex color value
 */
export function extractFillColor(spPr, style) {
  const noFill = spPr?.elements?.find((el) => el.name === 'a:noFill');
  if (noFill) {
    return null;
  }

  const solidFill = spPr?.elements?.find((el) => el.name === 'a:solidFill');
  if (solidFill) {
    const schemeClr = solidFill.elements?.find((el) => el.name === 'a:schemeClr');

    if (schemeClr) {
      const themeName = schemeClr.attributes?.['val'];
      let color = getThemeColor(themeName);
      let alpha = null;

      const modifiers = schemeClr.elements || [];
      modifiers.forEach((mod) => {
        if (mod.name === 'a:shade') {
          color = applyColorModifier(color, 'shade', mod.attributes['val']);
        } else if (mod.name === 'a:tint') {
          color = applyColorModifier(color, 'tint', mod.attributes['val']);
        } else if (mod.name === 'a:lumMod') {
          color = applyColorModifier(color, 'lumMod', mod.attributes['val']);
        } else if (mod.name === 'a:lumOff') {
          color = applyColorModifier(color, 'lumOff', mod.attributes['val']);
        } else if (mod.name === 'a:alpha') {
          alpha = parseInt(mod.attributes['val']) / 100000;
        }
      });

      // Return object with alpha if present, otherwise just the color string
      if (alpha !== null && alpha < 1) {
        return { type: 'solidWithAlpha', color, alpha };
      }
      return color;
    }

    const srgbClr = solidFill.elements?.find((el) => el.name === 'a:srgbClr');
    if (srgbClr) {
      let alpha = null;
      const alphaEl = srgbClr.elements?.find((el) => el.name === 'a:alpha');
      if (alphaEl) {
        alpha = parseInt(alphaEl.attributes?.['val'] || '100000', 10) / 100000;
      }

      const color = '#' + srgbClr.attributes?.['val'];
      if (alpha !== null && alpha < 1) {
        return { type: 'solidWithAlpha', color, alpha };
      }
      return color;
    }
  }

  const gradFill = spPr?.elements?.find((el) => el.name === 'a:gradFill');
  if (gradFill) {
    return extractGradientFill(gradFill);
  }

  const blipFill = spPr?.elements?.find((el) => el.name === 'a:blipFill');
  if (blipFill) {
    return '#cccccc'; // placeholder color for now
  }

  // No fill specified in spPr, check style reference
  // Per ECMA-376: when no fill is specified and no style exists, shape should be transparent
  if (!style) {
    return null;
  }

  const fillRef = style.elements?.find((el) => el.name === 'a:fillRef');
  if (!fillRef) {
    // No fillRef in style means no fill specified - return transparent
    return null;
  }

  // Per OOXML spec, fillRef idx="0" means "no fill" - return null to indicate transparent
  const fillRefIdx = fillRef.attributes?.['idx'];

  if (fillRefIdx === '0') {
    return null;
  }

  const schemeClr = fillRef.elements?.find((el) => el.name === 'a:schemeClr');
  if (!schemeClr) {
    // No schemeClr in fillRef - return transparent rather than default blue
    return null;
  }

  const themeName = schemeClr.attributes?.['val'];
  let color = getThemeColor(themeName);

  const modifiers = schemeClr.elements || [];
  modifiers.forEach((mod) => {
    if (mod.name === 'a:shade') {
      color = applyColorModifier(color, 'shade', mod.attributes['val']);
    } else if (mod.name === 'a:tint') {
      color = applyColorModifier(color, 'tint', mod.attributes['val']);
    } else if (mod.name === 'a:lumMod') {
      color = applyColorModifier(color, 'lumMod', mod.attributes['val']);
    }
  });

  return color;
}

/**
 * Extracts gradient fill information from a:gradFill element
 * @param {Object} gradFill - The a:gradFill element
 * @returns {Object} Gradient fill data with type, stops, and angle
 */
function extractGradientFill(gradFill) {
  const gradient = {
    type: 'gradient',
    stops: [],
    angle: 0,
  };

  // Extract gradient stops
  const gsLst = gradFill.elements?.find((el) => el.name === 'a:gsLst');
  if (gsLst) {
    const stops = gsLst.elements?.filter((el) => el.name === 'a:gs') || [];
    gradient.stops = stops.map((stop) => {
      const pos = parseInt(stop.attributes?.['pos'] || '0', 10) / 100000; // Convert from 0-100000 to 0-1

      // Extract color from the stop
      const srgbClr = stop.elements?.find((el) => el.name === 'a:srgbClr');
      let color = '#000000';
      let alpha = 1;

      if (srgbClr) {
        color = '#' + srgbClr.attributes?.['val'];

        // Extract alpha if present
        const alphaEl = srgbClr.elements?.find((el) => el.name === 'a:alpha');
        if (alphaEl) {
          alpha = parseInt(alphaEl.attributes?.['val'] || '100000', 10) / 100000;
        }
      }

      return { position: pos, color, alpha };
    });
  }

  // Extract gradient direction (linear angle)
  const lin = gradFill.elements?.find((el) => el.name === 'a:lin');
  if (lin) {
    // Convert from 60000ths of a degree to degrees
    const ang = parseInt(lin.attributes?.['ang'] || '0', 10) / 60000;
    gradient.angle = ang;
  }

  // Check if it's a radial gradient
  const path = gradFill.elements?.find((el) => el.name === 'a:path');
  if (path) {
    gradient.gradientType = 'radial';
    gradient.path = path.attributes?.['path'] || 'circle';
  } else {
    gradient.gradientType = 'linear';
  }

  return gradient;
}
