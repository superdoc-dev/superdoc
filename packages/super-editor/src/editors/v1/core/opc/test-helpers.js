/**
 * Shared test helpers for OPC package metadata tests.
 *
 * These parse XML strings and extract Override / Relationship entries
 * for assertions. Used by both unit tests and integration tests.
 */

import * as xmljs from 'xml-js';

/** Parse Override elements from a [Content_Types].xml string. */
export function getOverrides(xmlString) {
  const parsed = xmljs.xml2js(xmlString, { compact: false });
  const types = parsed.elements?.find((el) => el.name === 'Types');
  return (types?.elements || [])
    .filter((el) => el.name === 'Override')
    .map((el) => ({
      partName: el.attributes.PartName,
      contentType: el.attributes.ContentType,
    }));
}

/** Parse Relationship elements from a _rels/.rels string. */
export function getRelationships(xmlString) {
  const parsed = xmljs.xml2js(xmlString, { compact: false });
  const rels = parsed.elements?.find((el) => el.name === 'Relationships');
  return (rels?.elements || [])
    .filter((el) => el.name === 'Relationship')
    .map((el) => ({
      id: el.attributes.Id,
      type: el.attributes.Type,
      target: el.attributes.Target,
    }));
}
