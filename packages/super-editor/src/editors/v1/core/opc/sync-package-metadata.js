/**
 * OPC package metadata synchronizer.
 *
 * Reconciles [Content_Types].xml and _rels/.rels with the final set of entries
 * in a DOCX package. This is the single authority for package-level singleton
 * registrations (content-type overrides and root relationships).
 *
 * Designed to run as the last metadata pass before zip serialization, after the
 * legacy `updateContentTypes()` has already handled media, comments, footnotes,
 * headers, and footers.
 *
 * @module opc/sync-package-metadata
 */

import * as xmljs from 'xml-js';
import { MANAGED_PACKAGE_PARTS } from './managed-parts-registry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ManagedPartEntry
 * @property {string} zipPath        - Path inside the zip (e.g. "docProps/custom.xml")
 * @property {string} contentType    - Required Override ContentType value
 * @property {string} relationshipType - Required root Relationship Type URI
 */

/**
 * @typedef {Object} PackageEntrySource
 * @property {Array<{name: string, content: string}>|Record<string, string>|null} baseFiles
 *   Original package entries — either an array of {name, content} or a key→content map.
 * @property {Record<string, string|null>} updatedDocs
 *   Export-time overrides. A null value means the entry is deleted.
 */

/**
 * @typedef {Object} SyncResult
 * @property {string} contentTypesXml - Reconciled [Content_Types].xml
 * @property {string} relsXml         - Reconciled _rels/.rels
 */

// ---------------------------------------------------------------------------
// XML Namespaces
// ---------------------------------------------------------------------------

const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read an entry from the layered package view.
 * updatedDocs takes precedence — a null value means the entry was deleted.
 */
function readEntry(path, baseFiles, updatedDocs) {
  if (updatedDocs && Object.prototype.hasOwnProperty.call(updatedDocs, path)) {
    return updatedDocs[path]; // string or null (deleted)
  }
  if (!baseFiles) return undefined;
  if (Array.isArray(baseFiles)) {
    return baseFiles.find((f) => f.name === path)?.content;
  }
  return baseFiles[path];
}

/**
 * Check whether a part will exist in the final package.
 * A non-null, non-undefined value (including empty string) means "present".
 */
function partExistsInPackage(zipPath, baseFiles, updatedDocs) {
  const content = readEntry(zipPath, baseFiles, updatedDocs);
  return content != null;
}

/**
 * Parse an XML string into xml-js non-compact JS object.
 * Returns null if parsing fails.
 */
function parseXml(xmlString) {
  try {
    return xmljs.xml2js(xmlString, { compact: false });
  } catch {
    return null;
  }
}

/**
 * Serialize an xml-js non-compact JS object back to an XML string.
 */
function serializeXml(jsObject) {
  return xmljs.js2xml(jsObject, { spaces: 0 });
}

/**
 * Find the first child element matching a given tag name, ignoring namespace prefixes.
 */
function findRootElement(parsed, tagName) {
  return parsed?.elements?.find((el) => {
    if (!el.name) return false;
    const localName = el.name.includes(':') ? el.name.split(':').pop() : el.name;
    return localName === tagName;
  });
}

/**
 * Build an empty _rels/.rels structure.
 */
function createEmptyRels() {
  return {
    declaration: { attributes: { version: '1.0', encoding: 'UTF-8', standalone: 'yes' } },
    elements: [
      {
        type: 'element',
        name: 'Relationships',
        attributes: { xmlns: RELATIONSHIPS_NS },
        elements: [],
      },
    ],
  };
}

/**
 * Find the highest rId number currently used in a Relationships element.
 */
function findMaxRId(relsRoot) {
  let max = 0;
  for (const el of relsRoot.elements || []) {
    const id = el.attributes?.Id;
    if (!id) continue;
    const match = id.match(/^rId(\d+)$/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max;
}

// ---------------------------------------------------------------------------
// Content Types reconciliation
// ---------------------------------------------------------------------------

/**
 * Ensure correct Override entries exist for all managed parts that are present
 * in the final package. Remove stale overrides for absent managed parts.
 * Dedupe and correct wrong content types for managed entries.
 */
function reconcileContentTypes(typesRoot, presentParts) {
  if (!typesRoot.elements) typesRoot.elements = [];

  const managedByPartName = new Map();
  for (const entry of MANAGED_PACKAGE_PARTS) {
    managedByPartName.set(`/${entry.zipPath}`, entry);
  }

  // Index existing Override elements for managed parts
  const existingOverrides = new Map(); // partName → [element indices]
  for (let i = 0; i < typesRoot.elements.length; i++) {
    const el = typesRoot.elements[i];
    if (el.name !== 'Override') continue;
    const partName = el.attributes?.PartName;
    if (!partName || !managedByPartName.has(partName)) continue;
    if (!existingOverrides.has(partName)) existingOverrides.set(partName, []);
    existingOverrides.get(partName).push(i);
  }

  // Collect indices to remove (stale or duplicate)
  const indicesToRemove = new Set();

  for (const [partName, entry] of managedByPartName) {
    const isPresent = presentParts.has(entry.zipPath);
    const indices = existingOverrides.get(partName) || [];

    if (!isPresent) {
      // Part absent → remove all managed overrides for it
      for (const idx of indices) indicesToRemove.add(idx);
      continue;
    }

    if (indices.length === 0) {
      // Part present but no override → add one
      typesRoot.elements.push({
        type: 'element',
        name: 'Override',
        attributes: { PartName: partName, ContentType: entry.contentType },
      });
    } else {
      // Keep the first override and correct its content type; remove duplicates
      typesRoot.elements[indices[0]].attributes.ContentType = entry.contentType;
      for (let i = 1; i < indices.length; i++) indicesToRemove.add(indices[i]);
    }
  }

  // Remove marked elements in reverse index order to preserve positions
  if (indicesToRemove.size > 0) {
    const sorted = [...indicesToRemove].sort((a, b) => b - a);
    for (const idx of sorted) typesRoot.elements.splice(idx, 1);
  }
}

// ---------------------------------------------------------------------------
// Root relationships reconciliation
// ---------------------------------------------------------------------------

/**
 * Ensure correct Relationship entries exist for all managed parts that are
 * present in the final package. Remove stale relationships for absent managed
 * parts. Dedupe and correct wrong targets/types for managed entries.
 * Reuses existing rIds and allocates new ones only when needed.
 */
function reconcileRootRels(relsRoot, presentParts) {
  if (!relsRoot.elements) relsRoot.elements = [];

  const managedByType = new Map();
  for (const entry of MANAGED_PACKAGE_PARTS) {
    managedByType.set(entry.relationshipType, entry);
  }

  // Index existing Relationship elements for managed types
  const existingRels = new Map(); // relationshipType → [{ index, element }]
  for (let i = 0; i < relsRoot.elements.length; i++) {
    const el = relsRoot.elements[i];
    if (el.name !== 'Relationship') continue;
    const type = el.attributes?.Type;
    if (!type || !managedByType.has(type)) continue;
    if (!existingRels.has(type)) existingRels.set(type, []);
    existingRels.get(type).push({ index: i, element: el });
  }

  const indicesToRemove = new Set();
  let maxRId = findMaxRId(relsRoot);

  for (const [relType, entry] of managedByType) {
    const isPresent = presentParts.has(entry.zipPath);
    const existing = existingRels.get(relType) || [];

    if (!isPresent) {
      // Part absent → remove all managed relationships for it
      for (const { index } of existing) indicesToRemove.add(index);
      continue;
    }

    if (existing.length === 0) {
      // Part present but no relationship → add one with next available rId
      maxRId++;
      relsRoot.elements.push({
        type: 'element',
        name: 'Relationship',
        attributes: {
          Id: `rId${maxRId}`,
          Type: relType,
          Target: entry.zipPath,
        },
      });
    } else {
      // Keep the first relationship, correct its target; remove duplicates
      existing[0].element.attributes.Target = entry.zipPath;
      for (let i = 1; i < existing.length; i++) indicesToRemove.add(existing[i].index);
    }
  }

  // Remove marked elements in reverse index order
  if (indicesToRemove.size > 0) {
    const sorted = [...indicesToRemove].sort((a, b) => b - a);
    for (const idx of sorted) relsRoot.elements.splice(idx, 1);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Synchronize OPC package metadata with the final set of output entries.
 *
 * Reads the current [Content_Types].xml and _rels/.rels, reconciles them
 * against the managed parts registry, and returns corrected XML strings
 * for both files.
 *
 * @param {PackageEntrySource} source - Layered package entry view
 * @returns {SyncResult}
 */
export function syncPackageMetadata({ baseFiles, updatedDocs }) {
  // Determine which managed parts will exist in the final package
  const presentParts = new Set();
  for (const entry of MANAGED_PACKAGE_PARTS) {
    if (partExistsInPackage(entry.zipPath, baseFiles, updatedDocs)) {
      presentParts.add(entry.zipPath);
    }
  }

  // --- [Content_Types].xml ---
  const rawContentTypes = readEntry('[Content_Types].xml', baseFiles, updatedDocs);
  if (rawContentTypes == null) {
    throw new Error(
      'syncPackageMetadata: [Content_Types].xml is missing from the package. ' +
        'Cannot safely reconcile package metadata without an existing content types file.',
    );
  }

  const contentTypesParsed = parseXml(rawContentTypes);
  if (!contentTypesParsed) {
    throw new Error(
      'syncPackageMetadata: [Content_Types].xml could not be parsed as valid XML. ' +
        'Cannot safely reconcile package metadata from a malformed content types file.',
    );
  }

  const typesRoot = findRootElement(contentTypesParsed, 'Types');
  if (!typesRoot) {
    throw new Error('syncPackageMetadata: [Content_Types].xml does not contain a <Types> root element.');
  }

  reconcileContentTypes(typesRoot, presentParts);

  // --- _rels/.rels ---
  const rawRels = readEntry('_rels/.rels', baseFiles, updatedDocs);
  let relsParsed;

  if (rawRels == null) {
    // Absent root rels: safe to synthesize since this file is purely metadata
    relsParsed = createEmptyRels();
  } else {
    relsParsed = parseXml(rawRels);
    if (!relsParsed) {
      throw new Error(
        'syncPackageMetadata: _rels/.rels could not be parsed as valid XML. ' +
          'Cannot safely reconcile root relationships from a malformed rels file.',
      );
    }
  }

  let relsRoot = findRootElement(relsParsed, 'Relationships');
  if (!relsRoot) {
    // Parsed but missing <Relationships> root — replace the entire document
    // with a clean structure rather than appending to malformed content.
    relsParsed = createEmptyRels();
    relsRoot = relsParsed.elements[0];
  }

  reconcileRootRels(relsRoot, presentParts);

  return {
    contentTypesXml: serializeXml(contentTypesParsed),
    relsXml: serializeXml(relsParsed),
  };
}
