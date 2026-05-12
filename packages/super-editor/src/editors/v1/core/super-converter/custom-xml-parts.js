/**
 * Custom XML Data Storage Part runtime — generic read/write helpers for
 * the OOXML custom XML feature (ECMA-376 Part 1 §15.2.5, §15.2.6, §22.5).
 *
 * Decoupled from any specific schema (citations, Harvey refs, etc.).
 * Used by the Document API `customXml.parts.*` adapter to surface raw
 * custom XML parts through the public API.
 */

import * as xmljs from 'xml-js';

export const CUSTOM_XML_DATA_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml';
export const CUSTOM_XML_PROPS_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps';
export const CUSTOM_XML_PROPS_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.customXmlProperties+xml';
export const CUSTOM_XML_DATASTORE_NAMESPACE =
  'http://schemas.openxmlformats.org/officeDocument/2006/customXml';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function getLocalName(name) {
  if (!name || typeof name !== 'string') return '';
  const i = name.indexOf(':');
  return i >= 0 ? name.slice(i + 1) : name;
}

function findFirstElement(parent, localName) {
  if (!parent?.elements?.length) return null;
  return parent.elements.find((el) => el?.type === 'element' && getLocalName(el.name) === localName) ?? null;
}

function findAllElements(parent, localName) {
  if (!parent?.elements?.length) return [];
  return parent.elements.filter((el) => el?.type === 'element' && getLocalName(el.name) === localName);
}

function partNameFromIndex(index) {
  return `customXml/item${index}.xml`;
}

function propsPartNameFromIndex(index) {
  return `customXml/itemProps${index}.xml`;
}

function indexFromPartName(partName) {
  const m = /^customXml\/item(\d+)\.xml$/i.exec(partName ?? '');
  return m ? Number.parseInt(m[1], 10) : null;
}

function indexFromPropsPartName(propsPartName) {
  const m = /^customXml\/itemProps(\d+)\.xml$/i.exec(propsPartName ?? '');
  return m ? Number.parseInt(m[1], 10) : null;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * Enumerates every custom XML Storage Part in the package by scanning
 * convertedXml keys (not the relationships file, because foreign producers
 * sometimes leave orphan parts that aren't referenced from word/document.xml).
 *
 * Returns part names sorted by their numeric index. Pair-matching with
 * Properties Parts is left to the caller.
 */
export function listCustomXmlStoragePartNames(convertedXml) {
  if (!convertedXml || typeof convertedXml !== 'object') return [];
  const indexes = [];
  for (const path of Object.keys(convertedXml)) {
    const idx = indexFromPartName(path);
    if (idx != null) indexes.push(idx);
  }
  indexes.sort((a, b) => a - b);
  return indexes.map(partNameFromIndex);
}

/**
 * Returns the Properties Part name paired with `partName`, if present.
 * Pairs by matching numeric index (item1 ↔ itemProps1).
 */
export function findPropsPartFor(convertedXml, partName) {
  const idx = indexFromPartName(partName);
  if (idx == null) return null;
  const candidate = propsPartNameFromIndex(idx);
  return convertedXml?.[candidate] ? candidate : null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parses a Properties Part for its itemID and schemaRefs.
 *
 * @returns `{ itemId, schemaRefs }` or `null` when the doc is malformed.
 */
export function parsePropsPart(propsDoc) {
  const root = propsDoc?.elements?.find((el) => el?.type === 'element' && getLocalName(el.name) === 'datastoreItem');
  if (!root) return null;
  const itemId = root.attributes?.['ds:itemID'] ?? root.attributes?.itemID ?? null;
  const schemaRefsEl = findFirstElement(root, 'schemaRefs');
  const schemaRefs = findAllElements(schemaRefsEl, 'schemaRef')
    .map((el) => el.attributes?.['ds:uri'] ?? el.attributes?.uri ?? null)
    .filter((uri) => typeof uri === 'string' && uri.length > 0);
  return { itemId: typeof itemId === 'string' && itemId.length > 0 ? itemId : null, schemaRefs };
}

/**
 * Extracts the namespace URI declared on the Storage Part's root element.
 * Returns `null` when no `xmlns` is present (e.g. plain `<root>` with no
 * default namespace).
 */
export function parseStoragePartRootNamespace(storageDoc) {
  const root = storageDoc?.elements?.find((el) => el?.type === 'element');
  if (!root) return null;
  const xmlns = root.attributes?.xmlns;
  if (typeof xmlns === 'string' && xmlns.length > 0) return xmlns;
  // Check for prefixed default namespace forms like `xmlns:b="..."` where
  // the root element actually uses that prefix.
  const elementName = root.name ?? '';
  const colonIdx = elementName.indexOf(':');
  if (colonIdx > 0) {
    const prefix = elementName.slice(0, colonIdx);
    const prefixedAttr = `xmlns:${prefix}`;
    const prefixedValue = root.attributes?.[prefixedAttr];
    if (typeof prefixedValue === 'string' && prefixedValue.length > 0) return prefixedValue;
  }
  return null;
}

/**
 * Serializes a parsed XML document (xml-js shape) back to a string.
 * Used to surface part content through the Document API as a string.
 */
export function serializeXmlDoc(xmlDoc) {
  if (!xmlDoc) return '';
  return xmljs.js2xml(xmlDoc, { compact: false, spaces: 0 });
}

// ---------------------------------------------------------------------------
// High-level: read a single part as a Document API record
// ---------------------------------------------------------------------------

/**
 * Reads a custom XML part identified by either an itemID GUID or a
 * package part name. Returns null when not found.
 *
 * Shape:
 *   {
 *     id: string | null,              // itemID GUID; null if no Properties Part
 *     partName: string,                // e.g. "customXml/item1.xml"
 *     propsPartName: string | null,    // null when no Properties Part exists
 *     rootNamespace: string | null,
 *     schemaRefs: string[],
 *     content: string,                 // serialized Storage Part XML
 *   }
 */
export function readCustomXmlPart(convertedXml, target) {
  if (!target || !convertedXml) return null;
  let partName = null;
  let itemId = null;
  if (typeof target.partName === 'string' && target.partName.length > 0) {
    partName = target.partName;
  } else if (typeof target.id === 'string' && target.id.length > 0) {
    itemId = target.id;
    for (const candidatePartName of listCustomXmlStoragePartNames(convertedXml)) {
      const propsName = findPropsPartFor(convertedXml, candidatePartName);
      if (!propsName) continue;
      const parsed = parsePropsPart(convertedXml[propsName]);
      if (parsed?.itemId === itemId) {
        partName = candidatePartName;
        break;
      }
    }
    if (!partName) return null;
  } else {
    return null;
  }

  const storageDoc = convertedXml[partName];
  if (!storageDoc) return null;
  const propsPartName = findPropsPartFor(convertedXml, partName);
  const props = propsPartName ? parsePropsPart(convertedXml[propsPartName]) : null;
  return {
    id: props?.itemId ?? null,
    partName,
    propsPartName: propsPartName ?? null,
    rootNamespace: parseStoragePartRootNamespace(storageDoc),
    schemaRefs: props?.schemaRefs ?? [],
    content: serializeXmlDoc(storageDoc),
  };
}

/**
 * Lists all custom XML parts in the package as summary records (no content).
 */
export function listCustomXmlParts(convertedXml) {
  return listCustomXmlStoragePartNames(convertedXml).map((partName) => {
    const propsPartName = findPropsPartFor(convertedXml, partName);
    const props = propsPartName ? parsePropsPart(convertedXml[propsPartName]) : null;
    return {
      id: props?.itemId ?? null,
      partName,
      propsPartName: propsPartName ?? null,
      rootNamespace: parseStoragePartRootNamespace(convertedXml[partName]),
      schemaRefs: props?.schemaRefs ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// Index allocation (write side helper, also useful for tests)
// ---------------------------------------------------------------------------

export function nextCustomXmlItemIndex(convertedXml) {
  const used = new Set();
  for (const path of Object.keys(convertedXml ?? {})) {
    const idx = indexFromPartName(path) ?? indexFromPropsPartName(path);
    if (idx != null) used.add(idx);
  }
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}
