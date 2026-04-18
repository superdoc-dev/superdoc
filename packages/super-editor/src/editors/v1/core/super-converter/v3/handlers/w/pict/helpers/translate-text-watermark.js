import { generateRandomSigned32BitIntStrId } from '@helpers/generateDocxRandomId';

/**
 * Translates a text watermark node back to w:pict XML with VML text path.
 *
 * @param {Object} params - The parameters for translation.
 * @returns {Object} The XML representation (w:pict).
 */
export function translateTextWatermark(params) {
  const { node } = params;
  const { attrs } = node;

  // Extract text from either stored data or VML attributes
  const text = attrs.textWatermarkData?.text || attrs.vmlTextpathAttributes?.string || '';

  // If we have the original VML attributes, use those for faithful round-tripping
  if (attrs.vmlAttributes && attrs.vmlTextpathAttributes) {
    const shapeElements = [];

    // Add v:path element
    if (attrs.vmlPathAttributes) {
      shapeElements.push({
        name: 'v:path',
        attributes: attrs.vmlPathAttributes,
      });
    }

    // Add v:textpath element
    shapeElements.push({
      name: 'v:textpath',
      attributes: {
        ...attrs.vmlTextpathAttributes,
        string: text,
      },
    });

    // Add v:fill element
    if (attrs.vmlFillAttributes && Object.keys(attrs.vmlFillAttributes).length > 0) {
      shapeElements.push({
        name: 'v:fill',
        attributes: attrs.vmlFillAttributes,
      });
    }

    // Add v:stroke element
    if (attrs.vmlStrokeAttributes && Object.keys(attrs.vmlStrokeAttributes).length > 0) {
      shapeElements.push({
        name: 'v:stroke',
        attributes: attrs.vmlStrokeAttributes,
      });
    }

    // Add w10:wrap element
    if (attrs.vmlWrapAttributes) {
      shapeElements.push({
        name: 'w10:wrap',
        attributes: attrs.vmlWrapAttributes,
      });
    }

    const shape = {
      name: 'v:shape',
      attributes: attrs.vmlAttributes,
      elements: shapeElements,
    };

    const pict = {
      name: 'w:pict',
      elements: [shape],
    };

    return pict;
  }

  // Fallback: construct VML from text watermark attributes
  // This path is used if the watermark was created programmatically rather than imported
  // Use textWatermarkData if available (from SVG import)
  const wmData = attrs.textWatermarkData || {};
  const style = buildVmlStyle(attrs, wmData);
  const textpathStyle = buildTextpathStyle(wmData);

  const shapeElements = [];

  // Add v:path element
  shapeElements.push({
    name: 'v:path',
    attributes: {
      textpathok: 't',
    },
  });

  // Add v:textpath element
  shapeElements.push({
    name: 'v:textpath',
    attributes: {
      on: 't',
      fitshape: 't',
      string: text,
      style: textpathStyle,
      ...(wmData.textpath?.trim !== undefined && { trim: wmData.textpath.trim ? 't' : 'f' }),
    },
  });

  // Add v:fill element
  const fillAttrs = {};
  const fill = wmData.fill || attrs.fill;
  if (fill) {
    if (fill.type) fillAttrs.type = fill.type;
    if (fill.color2) fillAttrs.color2 = fill.color2;
    if (fill.opacity !== undefined) fillAttrs.opacity = fill.opacity.toString();
    if (fill.detectmouseclick !== undefined) {
      fillAttrs['o:detectmouseclick'] = fill.detectmouseclick ? 't' : 'f';
    }
  }
  if (Object.keys(fillAttrs).length > 0) {
    shapeElements.push({
      name: 'v:fill',
      attributes: fillAttrs,
    });
  }

  // Add v:stroke element
  const stroke = wmData.stroke || attrs.stroke;
  if (stroke && stroke.enabled !== false) {
    const strokeAttrs = {};
    if (stroke.color) strokeAttrs.color = stroke.color;
    if (stroke.joinstyle) strokeAttrs.joinstyle = stroke.joinstyle;
    if (stroke.endcap) strokeAttrs.endcap = stroke.endcap;
    if (Object.keys(strokeAttrs).length > 0) {
      shapeElements.push({
        name: 'v:stroke',
        attributes: strokeAttrs,
      });
    }
  }

  // Add w10:wrap element
  shapeElements.push({
    name: 'w10:wrap',
    attributes: {
      type: attrs.wrap?.type?.toLowerCase() || 'none',
    },
  });

  const shape = {
    name: 'v:shape',
    attributes: {
      id: `PowerPlusWaterMarkObject${generateRandomSigned32BitIntStrId().replace('-', '')}`,
      'o:spid': `shape_${Math.floor(Math.random() * 10000)}`,
      type: '#_x0000_t136',
      style,
      fillcolor: fill?.color || 'silver',
      stroked: stroke?.enabled !== false ? 't' : 'f',
      'o:allowincell': 'f',
      ...(attrs.vmlAttributes?.adj && { adj: attrs.vmlAttributes.adj }),
    },
    elements: shapeElements,
  };

  const pict = {
    name: 'w:pict',
    elements: [shape],
  };

  return pict;
}

/**
 * Build VML style string from text watermark attributes.
 * @param {Object} attrs - Text watermark node attributes (image attrs)
 * @param {Object} wmData - Text watermark specific data
 * @returns {string} VML style string
 */
function buildVmlStyle(attrs, wmData) {
  const styles = [];

  // Position
  styles.push('position:absolute');

  // Margins/offsets
  if (attrs.marginOffset) {
    if (attrs.marginOffset.horizontal !== undefined) {
      styles.push(`margin-left:${convertToPt(attrs.marginOffset.horizontal)}pt`);
    }
    if (attrs.marginOffset.top !== undefined) {
      styles.push(`margin-top:${convertToPt(attrs.marginOffset.top)}pt`);
    }
  } else {
    styles.push('margin-left:0.05pt');
    styles.push('margin-top:315.7pt');
  }

  // Dimensions
  if (attrs.size) {
    if (attrs.size.width) {
      styles.push(`width:${convertToPt(attrs.size.width)}pt`);
    }
    if (attrs.size.height) {
      styles.push(`height:${convertToPt(attrs.size.height)}pt`);
    }
  }

  // Wrap style - map wrap.type to mso-wrap-style
  // wrap.type can be: None, Square, TopAndBottom, Tight, Through
  // mso-wrap-style can be: none, square, tight, through, top-and-bottom
  const wrapType = attrs.wrap?.type;
  let msoWrapStyle = 'none';
  if (wrapType) {
    const wrapTypeLower = wrapType.toLowerCase();
    if (wrapTypeLower === 'topandbottom') {
      msoWrapStyle = 'top-and-bottom';
    } else if (['square', 'tight', 'through'].includes(wrapTypeLower)) {
      msoWrapStyle = wrapTypeLower;
    }
  }
  styles.push(`mso-wrap-style:${msoWrapStyle}`);

  // Text anchor
  const textAnchor = wmData.textStyle?.textAnchor || attrs.textStyle?.textAnchor;
  if (textAnchor) {
    styles.push(`v-text-anchor:${textAnchor}`);
  }

  // Rotation
  const rotation = wmData.rotation || attrs.rotation;
  if (rotation !== undefined && rotation !== 0) {
    styles.push(`rotation:${rotation}`);
  }

  // MSO positioning
  if (attrs.anchorData) {
    if (attrs.anchorData.alignH) {
      styles.push(`mso-position-horizontal:${attrs.anchorData.alignH}`);
    }
    if (attrs.anchorData.alignV) {
      styles.push(`mso-position-vertical:${attrs.anchorData.alignV}`);
    }
    if (attrs.anchorData.hRelativeFrom) {
      styles.push(`mso-position-horizontal-relative:${attrs.anchorData.hRelativeFrom}`);
    }
    if (attrs.anchorData.vRelativeFrom) {
      styles.push(`mso-position-vertical-relative:${attrs.anchorData.vRelativeFrom}`);
    }
  }

  return styles.join(';');
}

/**
 * Build textpath style string from text watermark attributes.
 * @param {Object} wmData - Text watermark specific data
 * @returns {string} Textpath style string
 */
function buildTextpathStyle(wmData) {
  const styles = [];

  if (wmData.textStyle) {
    if (wmData.textStyle.fontFamily) {
      styles.push(`font-family:"${wmData.textStyle.fontFamily}"`);
    }
    if (wmData.textStyle.fontSize) {
      styles.push(`font-size:${wmData.textStyle.fontSize}`);
    }
  }

  return styles.join(';');
}

/**
 * Convert pixels to points (pt).
 * @param {number} pixels
 * @returns {number} Value in points
 */
function convertToPt(pixels) {
  if (typeof pixels === 'number') {
    return (pixels * 72) / 96; // 72 points per inch, 96 pixels per inch
  }
  return parseFloat(pixels) || 0;
}
