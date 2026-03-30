import { describe, expect, it } from 'vitest';

import {
  DOM_CLASS_NAMES,
  DATA_ATTRS,
  DATASET_KEYS,
  buildImagePmSelector,
  buildInlineImagePmSelector,
  buildSdtBlockSelector,
  buildSdtInlineSelector,
  buildAnnotationSelector,
  buildAnnotationTypeSelector,
  buildAnnotationPmSelector,
  SDT_BLOCK_WITH_ID_SELECTOR,
  DRAGGABLE_SELECTOR,
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
      SDT_GROUP_HOVER: 'sdt-group-hover',
      IMAGE_FRAGMENT: 'superdoc-image-fragment',
      INLINE_IMAGE: 'superdoc-inline-image',
      INLINE_IMAGE_CLIP_WRAPPER: 'superdoc-inline-image-clip-wrapper',
      ANNOTATION: 'annotation',
      ANNOTATION_CONTENT: 'annotation-content',
      ANNOTATION_CARET_ANCHOR: 'annotation-caret-anchor',
    });
  });

  it('exports the stable data attribute names and dataset keys', () => {
    expect(DATA_ATTRS).toEqual({
      PM_START: 'data-pm-start',
      PM_END: 'data-pm-end',
      LAYOUT_EPOCH: 'data-layout-epoch',
      TABLE_BOUNDARIES: 'data-table-boundaries',
      SDT_ID: 'data-sdt-id',
      SDT_TYPE: 'data-sdt-type',
      FIELD_ID: 'data-field-id',
      FIELD_TYPE: 'data-field-type',
      DRAGGABLE: 'data-draggable',
      DISPLAY_LABEL: 'data-display-label',
      VARIANT: 'data-variant',
      TYPE: 'data-type',
    });

    expect(DATASET_KEYS).toEqual({
      PM_START: 'pmStart',
      PM_END: 'pmEnd',
      LAYOUT_EPOCH: 'layoutEpoch',
      TABLE_BOUNDARIES: 'tableBoundaries',
      SDT_ID: 'sdtId',
      SDT_TYPE: 'sdtType',
      FIELD_ID: 'fieldId',
      FIELD_TYPE: 'fieldType',
      DRAGGABLE: 'draggable',
      DISPLAY_LABEL: 'displayLabel',
      VARIANT: 'variant',
      TYPE: 'type',
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

  it('builds a block SDT selector by escaped id', () => {
    expect(buildSdtBlockSelector('abc')).toBe('.superdoc-structured-content-block[data-sdt-id="abc"]');
  });

  it('builds an inline SDT selector by escaped id', () => {
    expect(buildSdtInlineSelector('abc')).toBe('.superdoc-structured-content-inline[data-sdt-id="abc"]');
  });

  it('builds the annotation selector with pm-start', () => {
    expect(buildAnnotationSelector()).toBe('.annotation[data-pm-start]');
  });

  it('builds an annotation type selector', () => {
    expect(buildAnnotationTypeSelector('html')).toBe('.annotation[data-type="html"]');
  });

  it('builds an annotation pm selector', () => {
    expect(buildAnnotationPmSelector(42)).toBe('.annotation[data-pm-start="42"]');
  });

  it('exports SDT_BLOCK_WITH_ID_SELECTOR constant', () => {
    expect(SDT_BLOCK_WITH_ID_SELECTOR).toBe('.superdoc-structured-content-block[data-sdt-id]');
  });

  it('exports DRAGGABLE_SELECTOR constant', () => {
    expect(DRAGGABLE_SELECTOR).toBe('[data-draggable="true"]');
  });
});
