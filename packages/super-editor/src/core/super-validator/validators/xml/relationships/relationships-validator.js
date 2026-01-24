import { resolveOpcTargetPath } from '@converter/helpers.js';

/**
 * Creates a validator for Word document relationships (word/_rels/document.xml.rels)
 *
 * This validator ensures the relationships file is properly structured and contains
 * valid relationship entries that reference existing files and follow Word's conventions.
 *
 * @typedef {import('../../../types.js').Editor} Editor
 * @typedef {import('../../../types.js').ValidatorLogger} ValidatorLogger
 * @param {Object} params - Validator parameters
 * @param {Editor} params.editor - The editor instance containing the document
 * @param {ValidatorLogger} params.logger - Logger for validation messages
 * @returns {Function} Validator function that returns {results: string[], modified: boolean}
 */
export function createRelationshipsValidator({ editor, logger }) {
  return () => {
    const results = [];
    let modified = false;

    const convertedXml = editor?.converter?.convertedXml;
    if (!convertedXml || typeof convertedXml !== 'object') {
      return { results, modified };
    }

    // Find and normalize relationships file location
    const { relsKey, wasNormalized } = findAndNormalizeRelationshipsFile(convertedXml, results);
    if (!relsKey) {
      return { results, modified };
    }
    if (wasNormalized) modified = true;

    // Validate and fix relationships root element
    const { root, wasFixed } = validateRelationshipsRoot(convertedXml[relsKey], relsKey, results);
    if (!root) {
      return { results, modified };
    }
    if (wasFixed) modified = true;

    // Clean up root element children
    const wasCleaned = cleanupRootChildren(root);
    if (wasCleaned) modified = true;

    // Process relationships and collect media targets
    const { filteredIds, binMediaTargets, wasProcessed } = processRelationships(root, convertedXml, results);
    if (wasProcessed) modified = true;

    // Fix missing relationship references in document.xml
    const wasDocumentFixed = fixMissingDocumentRefs(convertedXml, filteredIds, results, logger);
    if (wasDocumentFixed) modified = true;

    // Update Content_Types.xml
    const contentTypesKey = '[Content_Types].xml';
    const contentTypesXml = convertedXml[contentTypesKey];
    if (binMediaTargets.size > 0 || contentTypesXml) {
      const wasContentTypesUpdated = updateContentTypes(convertedXml, binMediaTargets, results);
      if (wasContentTypesUpdated) modified = true;
    } else {
      // Add informational message when Content_Types.xml is missing and no media targets
      results.push('[Content_Types].xml not found or not parseable. Skipped content types patch.');
    }

    return { results, modified };
  };
}

/**
 * Finds the relationships file and normalizes its location to canonical path
 */
function findAndNormalizeRelationshipsFile(convertedXml, results) {
  const candidateKeys = [
    'word/_rels/document.xml.rels',
    'word/document.xml.rels',
    '_rels/document.xml.rels',
    'document.xml.rels',
  ];

  const relsKey = candidateKeys.find((k) => convertedXml?.[k]?.elements);
  if (!relsKey) return { relsKey: null, wasNormalized: false };

  const canonicalKey = 'word/_rels/document.xml.rels';
  if (relsKey !== canonicalKey) {
    convertedXml[canonicalKey] = convertedXml[relsKey];
    delete convertedXml[relsKey];
    results.push(`Normalized relationships location to ${canonicalKey} (was ${relsKey})`);
    return { relsKey: canonicalKey, wasNormalized: true };
  }

  return { relsKey, wasNormalized: false };
}

/**
 * Validates and fixes the relationships root element structure
 */
function validateRelationshipsRoot(relsTree, relsKey, results) {
  const root = relsTree?.elements?.[0];

  if (!root || root.type !== 'element') {
    results.push(`${relsKey} is not a valid xml`);
    return { root: null, wasFixed: false };
  }

  const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  let wasFixed = false;

  if (root.name !== 'Relationships') {
    root.name = 'Relationships';
    results.push(`Fixed relationships root element name to "Relationships"`);
    wasFixed = true;
  }

  root.attributes = root.attributes || {};
  if (root.attributes.xmlns !== RELS_NS) {
    root.attributes.xmlns = RELS_NS;
    results.push(`Set relationships xmlns to ${RELS_NS}`);
    wasFixed = true;
  }

  return { root, wasFixed };
}

/**
 * Cleans up root element children to ensure only valid Relationship elements
 */
function cleanupRootChildren(root) {
  const validChildren =
    root.elements?.filter((child) => child?.type === 'element' && child.name === 'Relationship') || [];

  if (root.elements?.length !== validChildren.length) {
    root.elements = validChildren;
    return true; // was cleaned
  }
  return false; // no cleaning needed
}

/**
 * Processes relationships and returns filtered IDs and media targets
 */
function processRelationships(root, convertedXml, results) {
  const binMediaTargets = new Set();
  const filteredIds = new Set();
  let wasProcessed = false;

  const ridNum = (id) => {
    const m = /^rId(\d+)$/.exec(String(id || ''));
    return m ? parseInt(m[1], 10) : null;
  };

  const isType = (type, tail) => typeof type === 'string' && new RegExp(`/relationships/${tail}$`, 'i').test(type);

  const isHyperlinkType = (type) => isType(type, 'hyperlink');
  const isImageType = (type) => isType(type, 'image');
  const looksExternal = (target) => /^https?:\/\//i.test(target || '') || /^mailto:/i.test(target || '');

  const usedIds = new Set();
  let maxRid = 0;

  for (const el of root.elements) {
    el.attributes = el.attributes || {};
    const id = el.attributes.Id;
    const n = ridNum(id);
    if (Number.isInteger(n)) maxRid = Math.max(maxRid, n);
    if (typeof id === 'string' && id) {
      usedIds.add(id);
    }
  }

  let ridCounter = maxRid;
  const allocateId = (preferred) => {
    if (preferred && !usedIds.has(preferred)) {
      usedIds.add(preferred);
      return preferred;
    }
    let newId;
    do {
      ridCounter += 1;
      newId = `rId${ridCounter}`;
    } while (usedIds.has(newId));
    usedIds.add(newId);
    return newId;
  };

  const seenIds = new Set();
  const filtered = [];

  function extractStringAttr(attrs, key) {
    return typeof attrs[key] === 'string' ? attrs[key].trim() : '';
  }
  for (const rel of root.elements) {
    rel.attributes = rel.attributes || {};
    const attrs = rel.attributes;
    let id = extractStringAttr(attrs, 'Id');
    const type = extractStringAttr(attrs, 'Type');
    let target = extractStringAttr(attrs, 'Target');
    let targetMode = extractStringAttr(attrs, 'TargetMode');

    // Skip relationships without target
    if (!target) {
      results.push(`Removed relationship "${id}" without Target`);
      wasProcessed = true;
      continue;
    }

    // Fix hyperlink TargetMode for external URLs
    if (isHyperlinkType(type) && looksExternal(target) && targetMode.toLowerCase() !== 'external') {
      attrs.TargetMode = 'External';
      targetMode = 'External';
      results.push(`Set TargetMode="External" for hyperlink ${id}`);
      wasProcessed = true;
    }

    // Handle image relationships
    if (isImageType(type)) {
      const relPath = resolveOpcTargetPath(target, 'word');
      if (relPath && /^media\/.+\.bin$/i.test(target) && relPath in convertedXml) {
        binMediaTargets.add(`/${relPath}`);
      }
    }

    // Validate internal target files exist
    if (targetMode.toLowerCase() !== 'external' && !looksExternal(target)) {
      const likelyPath = resolveOpcTargetPath(target, 'word');

      if (!(likelyPath in convertedXml)) {
        if (!isImageType(type)) {
          results.push(`Removed relationship ${id} with missing target: ${target}`);
          wasProcessed = true;
          continue;
        } else {
          results.push(`Warning: image relationship ${id} target not found: ${target}.`);
          // Note: Warning doesn't mark as modified
        }
      }
    }

    // Assign missing IDs
    if (!id) {
      const newId = allocateId(null);
      attrs.Id = newId;
      results.push(`Assigned missing Id "${newId}"`);
      wasProcessed = true;
      id = newId;
    }

    // Check for duplicate IDs
    if (seenIds.has(id)) {
      results.push(`Removed duplicate relationship with ID "${id}"`);
      wasProcessed = true;
      continue;
    }

    seenIds.add(id);
    filtered.push(rel);
  }

  // Update root elements only if content actually changed
  if (root.elements.length !== filtered.length) {
    root.elements = filtered;
    wasProcessed = true;
  } else {
    // Even if same length, check if any elements were actually removed
    const contentChanged = root.elements.some((el, i) => el !== filtered[i]);
    if (contentChanged) {
      root.elements = filtered;
      wasProcessed = true;
    }
  }

  // Collect final filtered IDs
  for (const rel of root.elements) {
    const id = rel.attributes?.Id;
    if (typeof id === 'string' && id) {
      filteredIds.add(id);
    }
  }

  return { filteredIds, binMediaTargets, wasProcessed };
}

/**
 * Fixes missing relationship references in document.xml
 */
function fixMissingDocumentRefs(convertedXml, filteredIds, results, logger) {
  const documentPath = 'word/document.xml';
  const document = convertedXml[documentPath];

  if (document?.elements?.length) {
    const documentRoot = document.elements[0];
    if (documentRoot?.type === 'element') {
      const missingRefs = [];
      processDocumentForMissingRefs(documentRoot, filteredIds, missingRefs);

      if (missingRefs.length) {
        results.push(`Fixed ${missingRefs.length} missing relationship references`);
        logger?.debug?.(`Fixed ${missingRefs.length} missing relationship references in document`);
        return true; // was fixed
      }
    }
  }
  return false; // no fixes needed
}

/**
 * Updates Content_Types.xml for media .bin entries
 */
function updateContentTypes(convertedXml, binMediaTargets, results) {
  const contentTypesKey = '[Content_Types].xml';
  const contentTypesXml = convertedXml[contentTypesKey];

  if (typeof contentTypesXml === 'string') {
    return updateContentTypesString(contentTypesXml, binMediaTargets, results, convertedXml, contentTypesKey);
  } else if (contentTypesXml?.elements?.length) {
    return updateContentTypesElements(contentTypesXml, binMediaTargets, results);
  } else {
    return false; // no changes made
  }
}

/**
 * Updates Content_Types.xml when it's a string
 */
function updateContentTypesString(contentTypesXml, binMediaTargets, results, convertedXml, contentTypesKey) {
  const CONTENT_TYPES_NS = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">';
  const ensureDefault = (xmlString, ext, contentType) => {
    const defRe = new RegExp(`<Default\\s+Extension="${ext}"\\b`, 'i');
    if (defRe.test(xmlString)) return xmlString;
    return xmlString.replace(
      CONTENT_TYPES_NS,
      `${CONTENT_TYPES_NS}<Default Extension="${ext}" ContentType="${contentType}"/>`,
    );
  };

  const ensureOverride = (xmlString, partName, contentType) => {
    const esc = partName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ovRe = new RegExp(`<Override\\s+PartName="${esc}"\\b`, 'i');
    if (ovRe.test(xmlString)) return xmlString;
    return xmlString.replace(
      CONTENT_TYPES_NS,
      `${CONTENT_TYPES_NS}<Override PartName="${partName}" ContentType="${contentType}" />`,
    );
  };

  let updated = contentTypesXml;
  updated = ensureDefault(updated, 'rels', 'application/vnd.openxmlformats-package.relationships+xml');
  updated = ensureDefault(updated, 'xml', 'application/xml');

  for (const partName of binMediaTargets) {
    updated = ensureOverride(updated, partName, 'image/png');
    results.push(`Added Content Types Override for "${partName}" as image/png`);
  }

  if (updated !== contentTypesXml) {
    convertedXml[contentTypesKey] = updated;
    return true; // was updated
  }
  return false; // no changes made
}

/**
 * Updates Content_Types.xml when it's parsed elements
 */
function updateContentTypesElements(contentTypesXml, binMediaTargets, results) {
  const typesRoot = contentTypesXml.elements.find((el) => el.name === 'Types') || contentTypesXml.elements[0];
  typesRoot.elements = typesRoot.elements || [];

  const hasDefault = (ext) =>
    typesRoot.elements.some((el) => el.name === 'Default' && el.attributes?.Extension === ext);

  const addDefault = (ext, ct) => {
    typesRoot.elements.unshift({
      type: 'element',
      name: 'Default',
      attributes: { Extension: ext, ContentType: ct },
    });
  };

  const hasOverride = (part) =>
    typesRoot.elements.some((el) => el.name === 'Override' && el.attributes?.PartName === part);

  const addOverride = (part, ct) => {
    typesRoot.elements.unshift({
      type: 'element',
      name: 'Override',
      attributes: { PartName: part, ContentType: ct },
    });
  };

  let wasUpdated = false;

  // Add required defaults
  if (!hasDefault('rels')) {
    addDefault('rels', 'application/vnd.openxmlformats-package.relationships+xml');
    wasUpdated = true;
  }
  if (!hasDefault('xml')) {
    addDefault('xml', 'application/xml');
    wasUpdated = true;
  }

  // Add media overrides
  for (const partName of binMediaTargets) {
    if (!hasOverride(partName)) {
      addOverride(partName, 'image/png');
      results.push(`Added Content Types Override for "${partName}" as image/png`);
      wasUpdated = true;
    }
  }

  return wasUpdated;
}

/**
 * Recursively processes document.xml to find and fix missing relationship references.
 *
 * @param {any} node - XML node to process (can be element, text, etc.)
 * @param {Set<string>} usedIds - Set of valid relationship IDs from the relationships file
 * @param {string[]} fixed - Array to collect descriptions of fixes made
 */
function processDocumentForMissingRefs(node, usedIds, fixed) {
  if (!node?.elements?.length) return;

  for (const element of node.elements) {
    if (element?.type !== 'element') continue;

    const rIdValue = element.attributes?.['r:id'];
    if (typeof rIdValue === 'string' && !usedIds.has(rIdValue)) {
      delete element.attributes['r:id'];
      fixed.push(`Removed invalid r:id="${rIdValue}"`);
    }

    processDocumentForMissingRefs(element, usedIds, fixed);
  }
}
