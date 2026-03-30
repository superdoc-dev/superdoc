import { describe, expect, it } from 'vitest';

import {
  DOM_CLASS_NAMES,
  DATA_ATTRS,
  DATASET_KEYS,
  buildImagePmSelector,
  buildInlineImagePmSelector,
} from './index.js';

describe('@superdoc/dom-contract', () => {
  it('exports the stable DOM class names used by the painter and DOM observers', () => {
    expect(DOM_CLASS_NAMES).toEqual({
      PAGE: 'superdoc-page',
      FRAGMENT: 'superdoc-fragment',
      LINE: 'superdoc-line',
      INLINE_SDT_WRAPPER: 'superdoc-structured-content-inline',
      BLOCK_SDT: 'superdoc-structured-content-block',
      TABLE_FRAGMENT: 'superdoc-table-fragment',
      DOCUMENT_SECTION: 'superdoc-document-section',
      SDT_HOVER: 'sdt-hover',
      IMAGE_FRAGMENT: 'superdoc-image-fragment',
      INLINE_IMAGE: 'superdoc-inline-image',
      INLINE_IMAGE_CLIP_WRAPPER: 'superdoc-inline-image-clip-wrapper',
    });
  });

  it('exports the stable data attribute names and dataset keys', () => {
    expect(DATA_ATTRS).toEqual({
      PM_START: 'data-pm-start',
      PM_END: 'data-pm-end',
      LAYOUT_EPOCH: 'data-layout-epoch',
      TABLE_BOUNDARIES: 'data-table-boundaries',
    });

    expect(DATASET_KEYS).toEqual({
      PM_START: 'pmStart',
      PM_END: 'pmEnd',
      LAYOUT_EPOCH: 'layoutEpoch',
      TABLE_BOUNDARIES: 'tableBoundaries',
    });
  });

  it('builds the full image selector for a rendered pm-start value', () => {
    expect(buildImagePmSelector(42)).toBe(
      '.superdoc-image-fragment[data-pm-start="42"], .superdoc-inline-image-clip-wrapper[data-pm-start="42"], .superdoc-inline-image[data-pm-start="42"]',
    );
  });

  it('builds the inline image selector in clip-wrapper-first order', () => {
    expect(buildInlineImagePmSelector('99')).toBe(
      '.superdoc-inline-image-clip-wrapper[data-pm-start="99"], .superdoc-inline-image[data-pm-start="99"]',
    );
  });
});
