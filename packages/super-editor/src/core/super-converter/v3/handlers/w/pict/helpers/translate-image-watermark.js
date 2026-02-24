import { generateRandomSigned32BitIntStrId } from '@helpers/generateDocxRandomId';

/**
 * Translates an image node with VML watermark attributes back to w:pict XML.
 *
 * @param {Object} params - The parameters for translation.
 * @returns {Object} The XML representation (w:pict).
 */
export function translateImageWatermark(params) {
  const { node } = params;
  const { attrs } = node;

  // If we have the original VML attributes, use those for faithful round-tripping
  if (attrs.vmlAttributes && attrs.vmlImagedata) {
    const shape = {
      name: 'v:shape',
      attributes: attrs.vmlAttributes,
      elements: [
        {
          name: 'v:imagedata',
          attributes: {
            ...attrs.vmlImagedata,
            'r:id': attrs.rId,
          },
        },
      ],
    };

    const pict = {
      name: 'w:pict',
      attributes: {
        'w14:anchorId': generateRandomSigned32BitIntStrId(),
      },
      elements: [shape],
    };

    return pict;
  }

  // Fallback: construct VML from image attributes
  // This path is used if the image was created programmatically rather than imported
  const style = buildVmlStyle(attrs);

  const shape = {
    name: 'v:shape',
    attributes: {
      id: `WordPictureWatermark${generateRandomSigned32BitIntStrId().replace('-', '')}`,
      'o:spid': `_x0000_s${Math.floor(Math.random() * 10000)}`,
      type: '#_x0000_t75',
      style,
      'o:allowincell': 'f',
    },
    elements: [
      {
        name: 'v:imagedata',
        attributes: {
          'r:id': attrs.rId,
          'o:title': attrs.title || attrs.alt || 'Watermark',
          ...(attrs.gain && { gain: attrs.gain }),
          ...(attrs.blacklevel && { blacklevel: attrs.blacklevel }),
        },
      },
    ],
  };

  const pict = {
    name: 'w:pict',
    attributes: {
      'w14:anchorId': generateRandomSigned32BitIntStrId(),
    },
    elements: [shape],
  };

  return pict;
}

/**
 * Build VML style string from image attributes.
 * @param {Object} attrs - Image node attributes
 * @returns {string} VML style string
 */
function buildVmlStyle(attrs) {
  const styles = [];

  // Position
  styles.push('position:absolute');

  // Dimensions
  if (attrs.size) {
    if (attrs.size.width) {
      styles.push(`width:${convertToPt(attrs.size.width)}pt`);
    }
    if (attrs.size.height) {
      styles.push(`height:${convertToPt(attrs.size.height)}pt`);
    }
  }

  // Margins/offsets
  if (attrs.marginOffset) {
    if (attrs.marginOffset.horizontal !== undefined) {
      styles.push(`margin-left:${convertToPt(attrs.marginOffset.horizontal)}pt`);
    }
    if (attrs.marginOffset.top !== undefined) {
      styles.push(`margin-top:${convertToPt(attrs.marginOffset.top)}pt`);
    }
  }

  // Z-index (negative for behind-doc watermarks)
  if (attrs.wrap?.attrs?.behindDoc) {
    styles.push('z-index:-251653120');
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

  // Width/height percent (default to 0 for watermarks)
  styles.push('mso-width-percent:0');
  styles.push('mso-height-percent:0');

  return styles.join(';');
}

/**
 * Convert pixels to points (pt).
 * @param {number} pixels
 * @returns {number} Value in points
 */
function convertToPt(pixels) {
  return (pixels * 72) / 96; // 72 points per inch, 96 pixels per inch
}
