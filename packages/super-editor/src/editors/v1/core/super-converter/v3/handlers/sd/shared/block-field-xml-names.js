// @ts-check

/**
 * XML element names emitted by the field-code preprocessors for block-level
 * fields (table of contents, index, bibliography, table of authorities).
 *
 * Shared so the paragraph importer (which hoists these out of their wrapper
 * paragraph) and the SDT classifier (which must treat a content control
 * wrapping one of these as block, not inline) agree on the same set.
 *
 * @type {Set<string>}
 */
export const BLOCK_FIELD_XML_NAMES = new Set([
  'sd:tableOfContents',
  'sd:index',
  'sd:bibliography',
  'sd:tableOfAuthorities',
]);
