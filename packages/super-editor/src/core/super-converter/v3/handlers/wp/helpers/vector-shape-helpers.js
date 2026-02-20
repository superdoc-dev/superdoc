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
 * Returns the built-in OOXML guide constants for a given path coordinate space.
 * These are pre-defined names that can appear as coordinate or angle values in custGeom.
 *
 * Coordinates are in the path's own coordinate space (path.w × path.h).
 * Angles are in 60,000ths of a degree.
 *
 * @param {number} pathW - Path coordinate space width (a:path @w)
 * @param {number} pathH - Path coordinate space height (a:path @h)
 * @returns {Record<string, number>}
 */
function buildBuiltinGuides(pathW, pathH) {
  const ss = Math.min(pathW, pathH);
  const ls = Math.max(pathW, pathH);
  return {
    l: 0,
    t: 0,
    r: pathW,
    b: pathH,
    w: pathW,
    h: pathH,
    hc: Math.round(pathW / 2),
    vc: Math.round(pathH / 2),
    wd2: Math.round(pathW / 2),
    hd2: Math.round(pathH / 2),
    wd3: Math.round(pathW / 3),
    hd3: Math.round(pathH / 3),
    wd4: Math.round(pathW / 4),
    hd4: Math.round(pathH / 4),
    wd5: Math.round(pathW / 5),
    hd5: Math.round(pathH / 5),
    wd6: Math.round(pathW / 6),
    hd6: Math.round(pathH / 6),
    wd8: Math.round(pathW / 8),
    hd8: Math.round(pathH / 8),
    wd10: Math.round(pathW / 10),
    wd32: Math.round(pathW / 32),
    ss,
    ls,
    ssd2: Math.round(ss / 2),
    ssd4: Math.round(ss / 4),
    ssd6: Math.round(ss / 6),
    ssd8: Math.round(ss / 8),
    ssd16: Math.round(ss / 16),
    ssd32: Math.round(ss / 32),
    // Angle constants (in 60,000ths of a degree)
    cd2: 10800000,
    cd4: 5400000,
    cd8: 2700000,
    '3cd4': 16200000,
    '3cd8': 8100000,
    '5cd8': 13500000,
    '7cd8': 18900000,
  };
}

/**
 * Evaluates a single OOXML guide formula against a resolved guide map.
 * Supports all 17 formula operators from the ECMA-376 spec.
 *
 * @param {string} fmla - Formula string, e.g. "*\/ w 1 2"
 * @param {Record<string, number>} guides - Already-resolved guide values
 * @returns {number}
 */
function evalGuideFormula(fmla, guides) {
  const parts = fmla.trim().split(/\s+/);
  const op = parts[0];
  const resolve = (v) => {
    const n = Number(v);
    if (!isNaN(n)) return n;
    return guides[v] ?? 0;
  };
  const a = () => resolve(parts[1]);
  const b = () => resolve(parts[2]);
  const c = () => resolve(parts[3]);
  switch (op) {
    case '*/':
      return Math.round((a() * b()) / c());
    case '+-':
      return a() + b() - c();
    case '+/':
      return Math.round((a() + b()) / c());
    case '?:':
      return a() > 0 ? b() : c();
    case 'abs':
      return Math.abs(a());
    case 'val':
      return a();
    case 'cos':
      return Math.round(a() * Math.cos((b() / 60000) * (Math.PI / 180)));
    case 'sin':
      return Math.round(a() * Math.sin((b() / 60000) * (Math.PI / 180)));
    case 'tan':
      return Math.round(a() * Math.tan((b() / 60000) * (Math.PI / 180)));
    case 'sqrt':
      return Math.round(Math.sqrt(a()));
    case 'max':
      return Math.max(a(), b());
    case 'min':
      return Math.min(a(), b());
    case 'pin':
      return Math.max(a(), Math.min(c(), b()));
    case 'mod':
      return Math.round(Math.sqrt(a() ** 2 + b() ** 2 + c() ** 2));
    case 'at2':
      return Math.round((Math.atan2(b(), a()) * 180 * 60000) / Math.PI);
    case 'cat2':
      return Math.round(a() * Math.cos(Math.atan2(c(), b())));
    case 'sat2':
      return Math.round(a() * Math.sin(Math.atan2(c(), b())));
    default:
      return 0;
  }
}

/**
 * Parses the a:gdLst (guide list) element and returns a map of resolved guide names to values.
 * Guides are processed in declaration order — guides can reference earlier guides.
 *
 * @param {Object|undefined} gdLst - The a:gdLst element
 * @param {Record<string, number>} baseGuides - Built-in constants to seed the context
 * @returns {Record<string, number>}
 */
function parseGuideList(gdLst, baseGuides) {
  const guides = { ...baseGuides };
  if (!gdLst?.elements) return guides;
  for (const gd of gdLst.elements) {
    if (gd.name !== 'a:gd') continue;
    const name = gd.attributes?.name;
    const fmla = gd.attributes?.fmla;
    if (name && fmla) {
      guides[name] = evalGuideFormula(fmla, guides);
    }
  }
  return guides;
}

/**
 * Resolves a coordinate or angle value that may be a literal number or a guide name.
 *
 * @param {string|number|undefined} value
 * @param {Record<string, number>} guides
 * @returns {number}
 */
function resolveValue(value, guides) {
  if (value === undefined || value === null) return 0;
  const n = Number(value);
  if (!isNaN(n)) return n;
  return guides[String(value)] ?? 0;
}

/**
 * Extracts custom geometry path data from a shape's properties (spPr).
 * Parses OOXML a:custGeom/a:pathLst into SVG-compatible path data.
 *
 * Supports all OOXML path commands:
 *   a:moveTo/a:pt       → M x y
 *   a:lnTo/a:pt         → L x y
 *   a:cubicBezTo/3×a:pt → C x1 y1 x2 y2 x y
 *   a:quadBezTo/2×a:pt  → Q cx cy x y
 *   a:arcTo             → A wR hR 0 largeArc sweep ex ey
 *   a:close             → Z
 *
 * Also resolves OOXML built-in guide constants (w, h, wd2, hd2, r, b, cd4, etc.)
 * and user-defined guide formulas from a:gdLst.
 *
 * @param {Object} spPr - The shape properties element (a:spPr or wps:spPr)
 * @returns {{ paths: Array<{ d: string, fill: string, stroke: boolean }>, width: number, height: number }|null}
 */
export function extractCustomGeometry(spPr) {
  const custGeom = spPr?.elements?.find((el) => el.name === 'a:custGeom');
  if (!custGeom) return null;

  const pathLst = custGeom.elements?.find((el) => el.name === 'a:pathLst');
  if (!pathLst?.elements?.length) return null;

  const paths = [];
  let maxWidth = 0;
  let maxHeight = 0;

  for (const pathEl of pathLst.elements) {
    if (pathEl.name !== 'a:path') continue;

    const w = parseInt(pathEl.attributes?.['w'] || '0', 10);
    const h = parseInt(pathEl.attributes?.['h'] || '0', 10);
    const fill = pathEl.attributes?.['fill'] || 'norm';
    // stroke attribute: "0" or "false" means no stroke; default is true
    const strokeAttr = pathEl.attributes?.['stroke'];
    const stroke = strokeAttr !== '0' && strokeAttr !== 'false';

    if (w > maxWidth) maxWidth = w;
    if (h > maxHeight) maxHeight = h;

    // Build guide context: built-in constants for this path's coordinate space,
    // then any user-defined guides from a:gdLst (processed in declaration order)
    const builtins = buildBuiltinGuides(w, h);
    const gdLst = custGeom.elements?.find((el) => el.name === 'a:gdLst');
    const guides = parseGuideList(gdLst, builtins);

    const segments = [];
    // Track current pen position — needed for a:arcTo center computation
    let penX = 0;
    let penY = 0;

    if (pathEl.elements) {
      for (const cmd of pathEl.elements) {
        switch (cmd.name) {
          case 'a:moveTo': {
            const pt = cmd.elements?.find((el) => el.name === 'a:pt');
            if (pt) {
              const x = resolveValue(pt.attributes?.['x'], guides);
              const y = resolveValue(pt.attributes?.['y'], guides);
              penX = x;
              penY = y;
              segments.push(`M ${x} ${y}`);
            }
            break;
          }
          case 'a:lnTo': {
            const pt = cmd.elements?.find((el) => el.name === 'a:pt');
            if (pt) {
              const x = resolveValue(pt.attributes?.['x'], guides);
              const y = resolveValue(pt.attributes?.['y'], guides);
              penX = x;
              penY = y;
              segments.push(`L ${x} ${y}`);
            }
            break;
          }
          case 'a:cubicBezTo': {
            const pts = cmd.elements?.filter((el) => el.name === 'a:pt') || [];
            if (pts.length === 3) {
              const coords = pts.map((p) => [
                resolveValue(p.attributes?.['x'], guides),
                resolveValue(p.attributes?.['y'], guides),
              ]);
              penX = coords[2][0];
              penY = coords[2][1];
              segments.push(
                `C ${coords[0][0]} ${coords[0][1]} ${coords[1][0]} ${coords[1][1]} ${coords[2][0]} ${coords[2][1]}`,
              );
            }
            break;
          }
          case 'a:quadBezTo': {
            // Two a:pt children: control point + end point → SVG Q command
            const pts = cmd.elements?.filter((el) => el.name === 'a:pt') || [];
            if (pts.length === 2) {
              const cx = resolveValue(pts[0].attributes?.['x'], guides);
              const cy = resolveValue(pts[0].attributes?.['y'], guides);
              const ex = resolveValue(pts[1].attributes?.['x'], guides);
              const ey = resolveValue(pts[1].attributes?.['y'], guides);
              penX = ex;
              penY = ey;
              segments.push(`Q ${cx} ${cy} ${ex} ${ey}`);
            }
            break;
          }
          case 'a:arcTo': {
            // OOXML arcTo: the current pen position lies on the ellipse at stAng.
            // The ellipse center is derived from the pen position and stAng.
            // Angles are in 60,000ths of a degree.
            const wR = resolveValue(cmd.attributes?.['wR'], guides);
            const hR = resolveValue(cmd.attributes?.['hR'], guides);
            const stAngRaw = resolveValue(cmd.attributes?.['stAng'], guides);
            const swAngRaw = resolveValue(cmd.attributes?.['swAng'], guides);

            const stAngDeg = stAngRaw / 60000;
            const swAngDeg = swAngRaw / 60000;
            const stAngRad = (stAngDeg * Math.PI) / 180;
            const swAngRad = (swAngDeg * Math.PI) / 180;

            // Compute ellipse center: pen = center + (wR*cos(stAng), hR*sin(stAng))
            const cx = penX - wR * Math.cos(stAngRad);
            const cy = penY - hR * Math.sin(stAngRad);

            // Compute arc end point
            const endAngRad = stAngRad + swAngRad;
            const ex = cx + wR * Math.cos(endAngRad);
            const ey = cy + hR * Math.sin(endAngRad);

            // SVG large-arc-flag: 1 if |sweep| > 180°
            const largeArcFlag = Math.abs(swAngDeg) > 180 ? 1 : 0;
            // SVG sweep-flag: 1 = clockwise (positive swAng)
            const sweepFlag = swAngDeg > 0 ? 1 : 0;

            penX = Math.round(ex);
            penY = Math.round(ey);
            segments.push(`A ${wR} ${hR} 0 ${largeArcFlag} ${sweepFlag} ${penX} ${penY}`);
            break;
          }
          case 'a:close': {
            segments.push('Z');
            break;
          }
        }
      }
    }

    if (segments.length > 0) {
      paths.push({ d: segments.join(' '), fill, stroke });
    }
  }

  if (paths.length === 0 || (maxWidth === 0 && maxHeight === 0)) return null;

  return { paths, width: maxWidth, height: maxHeight };
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
