import type { SectionHeaderFooterKind, SectionHeaderFooterVariant } from '@superdoc/document-api';
import type { XmlElement } from './sections-xml.js';

const DOCUMENT_RELS_PATH = 'word/_rels/document.xml.rels';
const RELS_XMLNS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HEADER_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
const FOOTER_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
const WORDPROCESSINGML_XMLNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const OFFICE_DOCUMENT_RELS_XMLNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const RELATIONSHIP_ID_PATTERN = /^rId(\d+)$/;
const HEADER_FILE_PATTERN = /^word\/header(\d+)\.xml$/;
const FOOTER_FILE_PATTERN = /^word\/footer(\d+)\.xml$/;

type RelationshipElement = XmlElement & {
  name: 'Relationship';
  attributes?: Record<string, string | number | boolean>;
};

type HeaderFooterJsonDoc = {
  type: 'doc';
  content: Array<{
    type: 'paragraph';
    content: unknown[];
  }>;
};

interface HeaderFooterVariantIds {
  default?: string | null;
  first?: string | null;
  even?: string | null;
  odd?: string | null;
  ids?: string[];
  titlePg?: boolean;
}

export interface ConverterWithHeaderFooterParts {
  convertedXml?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  footers?: Record<string, unknown>;
  headerIds?: HeaderFooterVariantIds;
  footerIds?: HeaderFooterVariantIds;
  headerFooterModified?: boolean;
  documentModified?: boolean;
}

interface SourcePartSnapshot {
  xmlPart: Record<string, unknown> | null;
  xmlPartPath: string | null;
  relsPart: Record<string, unknown> | null;
  relsPartPath: string | null;
  jsonPart: Record<string, unknown> | null;
}

export interface CreateHeaderFooterPartInput {
  kind: SectionHeaderFooterKind;
  variant: SectionHeaderFooterVariant;
  sourceRefId?: string;
}

export interface CreateHeaderFooterPartResult {
  refId: string;
  relationshipTarget: string;
}

export interface HeaderFooterRelationshipLookupInput {
  kind: SectionHeaderFooterKind;
  refId: string;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toRelationshipType(kind: SectionHeaderFooterKind): string {
  return kind === 'header' ? HEADER_RELATIONSHIP_TYPE : FOOTER_RELATIONSHIP_TYPE;
}

function toFilePattern(kind: SectionHeaderFooterKind): RegExp {
  return kind === 'header' ? HEADER_FILE_PATTERN : FOOTER_FILE_PATTERN;
}

function normalizeRelationshipTarget(target: string): string {
  let normalized = target.replace(/^\.\//, '');
  if (normalized.startsWith('../')) normalized = normalized.slice(3);
  if (normalized.startsWith('/')) normalized = normalized.slice(1);
  if (!normalized.startsWith('word/')) normalized = `word/${normalized}`;
  return normalized;
}

function toRelsPathForPart(partPath: string): string {
  const normalized = normalizeRelationshipTarget(partPath);
  const fileName = normalized.split('/').pop();
  if (!fileName) return normalized;
  return `word/_rels/${fileName}.rels`;
}

function ensureConvertedXml(converter: ConverterWithHeaderFooterParts): Record<string, unknown> {
  if (!converter.convertedXml || typeof converter.convertedXml !== 'object') {
    converter.convertedXml = {};
  }
  return converter.convertedXml;
}

function ensureRelationshipsRoot(converter: ConverterWithHeaderFooterParts): XmlElement {
  const convertedXml = ensureConvertedXml(converter);

  let relsPart = convertedXml[DOCUMENT_RELS_PATH] as XmlElement | undefined;
  if (!relsPart || typeof relsPart !== 'object') {
    relsPart = {
      name: 'document.xml.rels',
      elements: [],
    };
    convertedXml[DOCUMENT_RELS_PATH] = relsPart;
  }

  if (!Array.isArray(relsPart.elements)) relsPart.elements = [];
  let relationshipsRoot = relsPart.elements.find((entry) => entry.name === 'Relationships');
  if (!relationshipsRoot) {
    relationshipsRoot = {
      type: 'element',
      name: 'Relationships',
      attributes: { xmlns: RELS_XMLNS },
      elements: [],
    };
    relsPart.elements.push(relationshipsRoot);
  }

  if (!Array.isArray(relationshipsRoot.elements)) relationshipsRoot.elements = [];
  if (!relationshipsRoot.attributes) relationshipsRoot.attributes = { xmlns: RELS_XMLNS };
  if (!relationshipsRoot.attributes.xmlns) relationshipsRoot.attributes.xmlns = RELS_XMLNS;
  return relationshipsRoot;
}

function readRelationshipsRoot(converter: ConverterWithHeaderFooterParts): XmlElement | null {
  const relsPart = converter.convertedXml?.[DOCUMENT_RELS_PATH] as XmlElement | undefined;
  if (!relsPart || typeof relsPart !== 'object' || !Array.isArray(relsPart.elements)) return null;
  const relationshipsRoot = relsPart.elements.find((entry) => entry.name === 'Relationships');
  if (!relationshipsRoot || !Array.isArray(relationshipsRoot.elements)) return null;
  return relationshipsRoot;
}

function getRelationshipElements(root: XmlElement): RelationshipElement[] {
  if (!Array.isArray(root.elements)) return [];
  return root.elements.filter((entry): entry is RelationshipElement => entry.name === 'Relationship');
}

function findRelationshipById(
  relationships: RelationshipElement[],
  refId: string,
  relationshipType: string,
): RelationshipElement | undefined {
  return relationships.find(
    (entry) =>
      String(entry.attributes?.Id ?? '') === refId && String(entry.attributes?.Type ?? '') === relationshipType,
  );
}

export function hasHeaderFooterRelationship(
  converter: ConverterWithHeaderFooterParts,
  input: HeaderFooterRelationshipLookupInput,
): boolean {
  const relationshipsRoot = readRelationshipsRoot(converter);
  if (!relationshipsRoot) return false;
  const relationships = getRelationshipElements(relationshipsRoot);
  return findRelationshipById(relationships, input.refId, toRelationshipType(input.kind)) !== undefined;
}

function nextRelationshipId(relationships: RelationshipElement[]): string {
  const usedIds = new Set(
    relationships.map((entry) => String(entry.attributes?.Id ?? '')).filter((value) => value.length > 0),
  );

  let largestNumericId = 0;
  for (const id of usedIds) {
    const match = id.match(RELATIONSHIP_ID_PATTERN);
    if (!match) continue;
    const numericId = Number(match[1]);
    if (Number.isFinite(numericId) && numericId > largestNumericId) {
      largestNumericId = numericId;
    }
  }

  let candidate = largestNumericId + 1;
  while (usedIds.has(`rId${candidate}`)) candidate += 1;
  return `rId${candidate}`;
}

function nextHeaderFooterFilename(
  kind: SectionHeaderFooterKind,
  relationships: RelationshipElement[],
  convertedXml: Record<string, unknown>,
): string {
  const relationshipType = toRelationshipType(kind);
  const filePattern = toFilePattern(kind);
  let largestIndex = 0;

  const candidatePaths = [
    ...relationships
      .filter((entry) => String(entry.attributes?.Type ?? '') === relationshipType)
      .map((entry) => normalizeRelationshipTarget(String(entry.attributes?.Target ?? ''))),
    ...Object.keys(convertedXml),
  ];

  for (const path of candidatePaths) {
    const match = path.match(filePattern);
    if (!match) continue;
    const numericIndex = Number(match[1]);
    if (Number.isFinite(numericIndex) && numericIndex > largestIndex) {
      largestIndex = numericIndex;
    }
  }

  let nextIndex = largestIndex + 1;
  while (convertedXml[`word/${kind}${nextIndex}.xml`]) {
    nextIndex += 1;
  }
  return `${kind}${nextIndex}.xml`;
}

function createEmptyXmlPart(kind: SectionHeaderFooterKind): Record<string, unknown> {
  const rootName = kind === 'header' ? 'w:hdr' : 'w:ftr';
  return {
    elements: [
      {
        type: 'element',
        name: rootName,
        attributes: {
          'xmlns:w': WORDPROCESSINGML_XMLNS,
          'xmlns:r': OFFICE_DOCUMENT_RELS_XMLNS,
        },
        elements: [{ type: 'element', name: 'w:p', elements: [] }],
      },
    ],
  };
}

function createEmptyJsonPart(): HeaderFooterJsonDoc {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }],
  };
}

function getCollection(
  converter: ConverterWithHeaderFooterParts,
  kind: SectionHeaderFooterKind,
): Record<string, unknown> {
  if (kind === 'header') {
    if (!converter.headers || typeof converter.headers !== 'object') converter.headers = {};
    return converter.headers;
  }
  if (!converter.footers || typeof converter.footers !== 'object') converter.footers = {};
  return converter.footers;
}

function getVariantIds(
  converter: ConverterWithHeaderFooterParts,
  kind: SectionHeaderFooterKind,
): HeaderFooterVariantIds {
  if (kind === 'header') {
    if (!converter.headerIds || typeof converter.headerIds !== 'object') converter.headerIds = {};
    return converter.headerIds;
  }
  if (!converter.footerIds || typeof converter.footerIds !== 'object') converter.footerIds = {};
  return converter.footerIds;
}

function readSourceSnapshot(
  converter: ConverterWithHeaderFooterParts,
  kind: SectionHeaderFooterKind,
  sourceRefId: string | undefined,
  relationships: RelationshipElement[],
): SourcePartSnapshot {
  const convertedXml = ensureConvertedXml(converter);
  const collection = getCollection(converter, kind);
  const relationshipType = toRelationshipType(kind);

  const sourceJsonPart =
    sourceRefId && typeof collection[sourceRefId] === 'object'
      ? (cloneValue(collection[sourceRefId]) as Record<string, unknown>)
      : null;

  if (!sourceRefId) {
    return {
      xmlPart: null,
      xmlPartPath: null,
      relsPart: null,
      relsPartPath: null,
      jsonPart: sourceJsonPart,
    };
  }

  const sourceRelationship = findRelationshipById(relationships, sourceRefId, relationshipType);
  const sourceTarget = sourceRelationship ? String(sourceRelationship.attributes?.Target ?? '') : '';
  if (!sourceTarget) {
    return {
      xmlPart: null,
      xmlPartPath: null,
      relsPart: null,
      relsPartPath: null,
      jsonPart: sourceJsonPart,
    };
  }

  const sourcePartPath = normalizeRelationshipTarget(sourceTarget);
  const sourcePart = convertedXml[sourcePartPath];
  const sourceRelsPath = toRelsPathForPart(sourcePartPath);
  const sourceRelsPart = convertedXml[sourceRelsPath];

  return {
    xmlPart: sourcePart && typeof sourcePart === 'object' ? (cloneValue(sourcePart) as Record<string, unknown>) : null,
    xmlPartPath: sourcePartPath,
    relsPart:
      sourceRelsPart && typeof sourceRelsPart === 'object'
        ? (cloneValue(sourceRelsPart) as Record<string, unknown>)
        : null,
    relsPartPath: sourceRelsPart ? sourceRelsPath : null,
    jsonPart: sourceJsonPart,
  };
}

export function createHeaderFooterPart(
  converter: ConverterWithHeaderFooterParts,
  input: CreateHeaderFooterPartInput,
): CreateHeaderFooterPartResult {
  const convertedXml = ensureConvertedXml(converter);
  const relationshipsRoot = ensureRelationshipsRoot(converter);
  const relationships = getRelationshipElements(relationshipsRoot);

  const newRefId = nextRelationshipId(relationships);
  const relationshipType = toRelationshipType(input.kind);
  const newFilename = nextHeaderFooterFilename(input.kind, relationships, convertedXml);
  const newPartPath = `word/${newFilename}`;
  const sourceSnapshot = readSourceSnapshot(converter, input.kind, input.sourceRefId, relationships);

  const partXml = sourceSnapshot.xmlPart ?? createEmptyXmlPart(input.kind);
  convertedXml[newPartPath] = partXml;

  if (sourceSnapshot.relsPart && sourceSnapshot.xmlPartPath) {
    convertedXml[toRelsPathForPart(newPartPath)] = sourceSnapshot.relsPart;
  }

  relationshipsRoot.elements!.push({
    type: 'element',
    name: 'Relationship',
    attributes: {
      Id: newRefId,
      Type: relationshipType,
      Target: newFilename,
    },
  });

  const collection = getCollection(converter, input.kind);
  collection[newRefId] = sourceSnapshot.jsonPart ?? createEmptyJsonPart();

  const variantIds = getVariantIds(converter, input.kind);
  if (!Array.isArray(variantIds.ids)) variantIds.ids = [];
  if (!variantIds.ids.includes(newRefId)) variantIds.ids.push(newRefId);

  converter.headerFooterModified = true;
  converter.documentModified = true;

  return {
    refId: newRefId,
    relationshipTarget: newPartPath,
  };
}
