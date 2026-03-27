// @ts-check

/**
 * Normalize wrap attribute ensuring backward compatibility with legacy wrap fields.
 * @param {Object} attrs
 * @returns {{ type: string, attrs: Record<string, any> }}
 */
export const normalizeWrap = (attrs = {}) => {
  const wrap = attrs.wrap;
  if (wrap?.type && wrap.type !== 'Inline') {
    return {
      type: wrap.type,
      attrs: wrap.attrs ?? {},
    };
  }
  // If the document already has an explicit inline wrap with attrs, keep it.
  // The generic inline branch below only handles empty/default inline wraps, so we need
  // this early exit to avoid falling through to legacy wrapText fallbacks.
  if (wrap?.type === 'Inline' && Object.keys(wrap.attrs ?? {}).length) {
    return {
      type: 'Inline',
      attrs: wrap.attrs,
    };
  }

  if (!wrap && attrs.wrapText) {
    return {
      type: 'Square',
      attrs: {
        wrapText: attrs.wrapText,
      },
    };
  }

  if (!wrap && attrs.wrapTopAndBottom) {
    return {
      type: 'TopAndBottom',
      attrs: {},
    };
  }

  if (wrap?.type === 'Inline') {
    return {
      type: 'Inline',
      attrs: wrap.attrs ?? {},
    };
  }

  return {
    type: 'Inline',
    attrs: {},
  };
};

/**
 * Normalize margin offsets ensuring backward compatibility with legacy left offset.
 * @param {Object} marginOffset
 * @returns {{ horizontal?: number, top?: number, right?: number, bottom?: number }}
 */
export const normalizeMarginOffset = (marginOffset = {}) => {
  const { left, horizontal, ...rest } = marginOffset;
  return {
    ...rest,
    horizontal: horizontal ?? left,
  };
};

/**
 * Convenience helper returning normalized wrap and marginOffset.
 * @param {Object} attrs
 * @returns {{ wrap: { type: string, attrs: Record<string, any> }, marginOffset: Record<string, any> }}
 */
export const getNormalizedImageAttrs = (attrs = {}) => {
  return {
    wrap: normalizeWrap(attrs),
    marginOffset: normalizeMarginOffset(attrs.marginOffset ?? {}),
  };
};
