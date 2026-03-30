/**
 * Reconcile document-level singleton relationships.
 *
 * Document-level singletons (e.g., word/numbering.xml) need a Relationship
 * entry in word/_rels/document.xml.rels when present in the package. Parts
 * auto-created at runtime (via mutatePart/ensurePart) may not have one.
 *
 * This module defines which parts require a document relationship and provides
 * a reconciliation function that adds missing entries with collision-free rId
 * allocation.
 *
 * Analogous to managed-parts-registry.js + sync-package-metadata.js, but for
 * document-level (word/_rels/document.xml.rels) rather than package-level
 * (_rels/.rels) relationships.
 *
 * @module opc/reconcile-document-relationships
 */

import * as xmljs from 'xml-js';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ManagedDocumentPartEntry
 * @property {string} zipPath          - Path inside the zip (e.g. "word/numbering.xml")
 * @property {string} contentType      - Required Override ContentType value
 * @property {string} relationshipType - Required document Relationship Type URI
 * @property {string} relTarget        - Relationship Target (relative to word/)
 */

/**
 * Document-level singleton parts that require both a content-type Override
 * in [Content_Types].xml and a Relationship in word/_rels/document.xml.rels
 * when present in the final package.
 *
 * Values sourced from ECMA-376 / ISO 29500.
 *
 * @type {ManagedDocumentPartEntry[]}
 */
export const MANAGED_DOCUMENT_PARTS = [
  {
    zipPath: 'word/numbering.xml',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml',
    relationshipType: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
    relTarget: 'numbering.xml',
  },
];

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Find the highest rId number in a Relationships element.
 */
function findMaxRId(elements) {
  let max = 0;
  for (const el of elements) {
    const match = el.attributes?.Id?.match(/^rId(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

/**
 * Ensure document-level relationships exist for all managed parts that are
 * present in the package.
 *
 * Adds missing relationships with collision-free rId allocation. Does not
 * remove or modify existing relationships.
 *
 * @param {string} relsXml - Current word/_rels/document.xml.rels XML string
 * @param {(zipPath: string) => boolean} fileExists - Predicate: does this file exist in the package?
 * @returns {string} Reconciled rels XML (reference-identical if no changes needed)
 */
export function reconcileDocumentRelationships(relsXml, fileExists) {
  if (!relsXml) return relsXml;

  let parsed;
  try {
    parsed = xmljs.xml2js(relsXml, { compact: false });
  } catch {
    return relsXml;
  }

  const relsTag = parsed?.elements?.find((el) => el.name === 'Relationships');
  if (!relsTag) return relsXml;
  if (!relsTag.elements) relsTag.elements = [];

  let changed = false;
  let maxId = findMaxRId(relsTag.elements);

  for (const entry of MANAGED_DOCUMENT_PARTS) {
    if (!fileExists(entry.zipPath)) continue;

    const alreadyRegistered = relsTag.elements.some((el) => el.attributes?.Type === entry.relationshipType);
    if (alreadyRegistered) continue;

    maxId++;
    relsTag.elements.push({
      type: 'element',
      name: 'Relationship',
      attributes: {
        Id: `rId${maxId}`,
        Type: entry.relationshipType,
        Target: entry.relTarget,
      },
    });
    changed = true;
  }

  if (!changed) return relsXml;
  return xmljs.js2xml(parsed, { spaces: 0 });
}
