/**
 * Converts a preset color name (a:prstClr) to its hex value.
 * Per ECMA-376 Part 1, Section 20.1.10.47 (ST_PresetColorVal).
 * @param {string} name - The preset color name (e.g., 'black', 'white', 'red')
 * @returns {string|null} Hex color value, or null if not recognized
 */
export function getPresetColor(name) {
  const colors = {
    aliceBlue: '#f0f8ff',
    antiqueWhite: '#faebd7',
    aqua: '#00ffff',
    aquamarine: '#7fffd4',
    azure: '#f0ffff',
    beige: '#f5f5dc',
    bisque: '#ffe4c4',
    black: '#000000',
    blanchedAlmond: '#ffebcd',
    blue: '#0000ff',
    blueViolet: '#8a2be2',
    brown: '#a52a2a',
    burlyWood: '#deb887',
    cadetBlue: '#5f9ea0',
    chartreuse: '#7fff00',
    chocolate: '#d2691e',
    coral: '#ff7f50',
    cornflowerBlue: '#6495ed',
    cornsilk: '#fff8dc',
    crimson: '#dc143c',
    cyan: '#00ffff',
    dkBlue: '#00008b',
    dkCyan: '#008b8b',
    dkGoldenrod: '#b8860b',
    dkGray: '#a9a9a9',
    dkGreen: '#006400',
    dkKhaki: '#bdb76b',
    dkMagenta: '#8b008b',
    dkOliveGreen: '#556b2f',
    dkOrange: '#ff8c00',
    dkOrchid: '#9932cc',
    dkRed: '#8b0000',
    dkSalmon: '#e9967a',
    dkSeaGreen: '#8fbc8f',
    dkSlateBlue: '#483d8b',
    dkSlateGray: '#2f4f4f',
    dkTurquoise: '#00ced1',
    dkViolet: '#9400d3',
    deepPink: '#ff1493',
    deepSkyBlue: '#00bfff',
    dimGray: '#696969',
    dodgerBlue: '#1e90ff',
    firebrick: '#b22222',
    floralWhite: '#fffaf0',
    forestGreen: '#228b22',
    fuchsia: '#ff00ff',
    gainsboro: '#dcdcdc',
    ghostWhite: '#f8f8ff',
    gold: '#ffd700',
    goldenrod: '#daa520',
    gray: '#808080',
    green: '#008000',
    greenYellow: '#adff2f',
    honeydew: '#f0fff0',
    hotPink: '#ff69b4',
    indianRed: '#cd5c5c',
    indigo: '#4b0082',
    ivory: '#fffff0',
    khaki: '#f0e68c',
    lavender: '#e6e6fa',
    lavenderBlush: '#fff0f5',
    lawnGreen: '#7cfc00',
    lemonChiffon: '#fffacd',
    ltBlue: '#add8e6',
    ltCoral: '#f08080',
    ltCyan: '#e0ffff',
    ltGoldenrodYellow: '#fafad2',
    ltGray: '#d3d3d3',
    ltGreen: '#90ee90',
    ltPink: '#ffb6c1',
    ltSalmon: '#ffa07a',
    ltSeaGreen: '#20b2aa',
    ltSkyBlue: '#87cefa',
    ltSlateGray: '#778899',
    ltSteelBlue: '#b0c4de',
    ltYellow: '#ffffe0',
    lime: '#00ff00',
    limeGreen: '#32cd32',
    linen: '#faf0e6',
    magenta: '#ff00ff',
    maroon: '#800000',
    medAquamarine: '#66cdaa',
    medBlue: '#0000cd',
    medOrchid: '#ba55d3',
    medPurple: '#9370db',
    medSeaGreen: '#3cb371',
    medSlateBlue: '#7b68ee',
    medSpringGreen: '#00fa9a',
    medTurquoise: '#48d1cc',
    medVioletRed: '#c71585',
    midnightBlue: '#191970',
    mintCream: '#f5fffa',
    mistyRose: '#ffe4e1',
    moccasin: '#ffe4b5',
    navajoWhite: '#ffdead',
    navy: '#000080',
    oldLace: '#fdf5e6',
    olive: '#808000',
    oliveDrab: '#6b8e23',
    orange: '#ffa500',
    orangeRed: '#ff4500',
    orchid: '#da70d6',
    paleGoldenrod: '#eee8aa',
    paleGreen: '#98fb98',
    paleTurquoise: '#afeeee',
    paleVioletRed: '#db7093',
    papayaWhip: '#ffefd5',
    peachPuff: '#ffdab9',
    peru: '#cd853f',
    pink: '#ffc0cb',
    plum: '#dda0dd',
    powderBlue: '#b0e0e6',
    purple: '#800080',
    red: '#ff0000',
    rosyBrown: '#bc8f8f',
    royalBlue: '#4169e1',
    saddleBrown: '#8b4513',
    salmon: '#fa8072',
    sandyBrown: '#f4a460',
    seaGreen: '#2e8b57',
    seaShell: '#fff5ee',
    sienna: '#a0522d',
    silver: '#c0c0c0',
    skyBlue: '#87ceeb',
    slateBlue: '#6a5acd',
    slateGray: '#708090',
    snow: '#fffafa',
    springGreen: '#00ff7f',
    steelBlue: '#4682b4',
    tan: '#d2b48c',
    teal: '#008080',
    thistle: '#d8bfd8',
    tomato: '#ff6347',
    turquoise: '#40e0d0',
    violet: '#ee82ee',
    wheat: '#f5deb3',
    white: '#ffffff',
    whiteSmoke: '#f5f5f5',
    yellow: '#ffff00',
    yellowGreen: '#9acd32',
  };
  return colors[name] ?? null;
}

/**
 * Applies color modifiers (shade, tint, lumMod, lumOff) and extracts alpha from
 * a color element's child modifier elements.
 * @param {string} color - The base hex color
 * @param {Array} elements - Child elements of the color node (e.g., a:shade, a:alpha)
 * @returns {{ color: string, alpha: number|null }}
 */
function applyModifiersAndAlpha(color, elements) {
  let alpha = null;
  const modifiers = elements || [];
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
  return { color, alpha };
}

/**
 * Extracts color and alpha from an element containing a color child
 * (a:schemeClr, a:srgbClr, or a:prstClr). Works with a:solidFill, style
 * reference elements (a:lnRef, a:fillRef), or any parent that hosts a color child.
 * @param {Object} element - The parent element (e.g., a:solidFill, a:lnRef, a:fillRef)
 * @returns {{ color: string, alpha: number|null }|null} Color and optional alpha, or null if no color found
 */
function extractColorFromElement(element) {
  if (!element?.elements) return null;

  const schemeClr = element.elements.find((el) => el.name === 'a:schemeClr');
  if (schemeClr) {
    const themeName = schemeClr.attributes?.['val'];
    const baseColor = getThemeColor(themeName);
    return applyModifiersAndAlpha(baseColor, schemeClr.elements);
  }

  const srgbClr = element.elements.find((el) => el.name === 'a:srgbClr');
  if (srgbClr) {
    const baseColor = '#' + srgbClr.attributes?.['val'];
    return applyModifiersAndAlpha(baseColor, srgbClr.elements);
  }

  const prstClr = element.elements.find((el) => el.name === 'a:prstClr');
  if (prstClr) {
    const presetName = prstClr.attributes?.['val'];
    const baseColor = getPresetColor(presetName);
    if (!baseColor) return null;
    return applyModifiersAndAlpha(baseColor, prstClr.elements);
  }

  return null;
}

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
 * In OOXML, a:ln w="0" means "hairline" (thinnest visible line), not invisible.
 * Word renders hairline strokes at approximately 0.75px.
 * @param {Object} spPr - The shape properties element
 * @returns {number} The stroke width in pixels, or 1 if not found
 */
export function extractStrokeWidth(spPr) {
  const ln = spPr?.elements?.find((el) => el.name === 'a:ln');
  if (!ln) return 1;

  const w = ln.attributes?.['w'];
  if (w == null) return 1;

  // Convert EMUs to pixels for stroke width using 72 DPI to match Word's rendering
  // Word appears to use 72 DPI for stroke widths rather than the standard 96 DPI
  // This gives us: 19050 EMUs * 72 / 914400 = 1.5 pixels (renders closer to 1px in browsers)
  const emu = typeof w === 'string' ? parseFloat(w) : w;

  // w="0" in OOXML means "hairline" — the thinnest visible stroke.
  // Word renders this as roughly 0.75pt (~1px). Use 0.75 as minimum.
  if (emu === 0) return 0.75;

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
      const result = extractColorFromElement(solidFill);
      if (result) return result.color;
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

  // Try extracting color from the lnRef element using the shared helper
  const lnRefResult = extractColorFromElement(lnRef);
  if (lnRefResult) return lnRefResult.color;

  return null;
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
    const result = extractColorFromElement(solidFill);
    if (result) {
      if (result.alpha !== null && result.alpha < 1) {
        return { type: 'solidWithAlpha', color: result.color, alpha: result.alpha };
      }
      return result.color;
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

  // Try extracting color from the fillRef element using the shared helper
  const fillRefResult = extractColorFromElement(fillRef);
  if (fillRefResult) {
    if (fillRefResult.alpha !== null && fillRefResult.alpha < 1) {
      return { type: 'solidWithAlpha', color: fillRefResult.color, alpha: fillRefResult.alpha };
    }
    return fillRefResult.color;
  }

  return null;
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
