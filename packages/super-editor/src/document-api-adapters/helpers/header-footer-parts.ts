import type { SectionHeaderFooterKind, SectionHeaderFooterVariant } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { PartId, PartOperation } from '../../core/parts/types.js';
import { mutateParts } from '../../core/parts/mutation/mutate-part.js';
import { compoundMutation } from '../../core/parts/mutation/compound-mutation.js';
import { registerHeaderFooterInvalidation } from '../../core/parts/invalidation/invalidation-handlers.js';
import { removePart, hasPart } from '../../core/parts/store/part-store.js';
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

export type HeaderFooterJsonDoc = {
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

function getConverterForHeaderFooter(editor: Editor): ConverterWithHeaderFooterParts {
  return (editor as unknown as { converter: ConverterWithHeaderFooterParts }).converter;
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

/**
 * Create the canonical empty PM JSON document for a header/footer story.
 *
 * Keep this shape centralized so all header/footer bootstrap paths
 * materialize the same minimal document structure.
 */
export function createEmptyHeaderFooterJsonPart(): HeaderFooterJsonDoc {
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
  editor: Editor,
  input: CreateHeaderFooterPartInput,
): CreateHeaderFooterPartResult {
  const converter = getConverterForHeaderFooter(editor);
  ensureConvertedXml(converter);

  // Read-only computation: determine next IDs and clone source data
  const convertedXml = converter.convertedXml!;
  const relationshipsRoot = readRelationshipsRoot(converter);
  const relationships = relationshipsRoot ? getRelationshipElements(relationshipsRoot) : [];

  const newRefId = nextRelationshipId(relationships);
  const relationshipType = toRelationshipType(input.kind);
  const newFilename = nextHeaderFooterFilename(input.kind, relationships, convertedXml);
  const newPartPath = `word/${newFilename}`;
  const sourceSnapshot = readSourceSnapshot(converter, input.kind, input.sourceRefId, relationships);
  const partXml = sourceSnapshot.xmlPart ?? createEmptyXmlPart(input.kind);

  // Atomic multi-part mutation: XML part + optional rels + document.xml.rels
  const operations: PartOperation[] = [
    {
      editor,
      partId: newPartPath as PartId,
      operation: 'create',
      source: 'createHeaderFooterPart',
      initial: partXml,
    },
  ];

  if (sourceSnapshot.relsPart) {
    operations.push({
      editor,
      partId: toRelsPathForPart(newPartPath) as PartId,
      operation: 'create',
      source: 'createHeaderFooterPart',
      initial: sourceSnapshot.relsPart,
    });
  }

  operations.push({
    editor,
    partId: DOCUMENT_RELS_PATH as PartId,
    operation: 'mutate',
    source: 'createHeaderFooterPart',
    mutate({ part }) {
      const root = part as { elements?: XmlElement[] };
      if (!root.elements) root.elements = [];
      let relsRoot = root.elements.find((el) => el.name === 'Relationships');
      if (!relsRoot) {
        relsRoot = { type: 'element', name: 'Relationships', attributes: { xmlns: RELS_XMLNS }, elements: [] };
        root.elements.push(relsRoot);
      }
      if (!relsRoot.elements) relsRoot.elements = [];
      relsRoot.elements.push({
        type: 'element',
        name: 'Relationship',
        attributes: { Id: newRefId, Type: relationshipType, Target: newFilename },
      } as XmlElement);
      return true;
    },
  });

  // Wrap the mutation + post-commit work in compoundMutation so that ALL
  // callers get atomic behaviour — not just the materialization path.
  // On degraded afterCommit or any other failure, document.xml.rels,
  // converter caches, and the newly created part files are all rolled back.
  // Nesting is safe: compoundMutation tracks depth and only flushes at 0.
  let finalResult: CreateHeaderFooterPartResult | null = null;

  const compound = compoundMutation({
    editor,
    source: 'createHeaderFooterPart',
    affectedParts: [DOCUMENT_RELS_PATH],
    execute: () => {
      const mutationResult = mutateParts({ editor, source: 'createHeaderFooterPart', operations });

      if (mutationResult.degraded) {
        // afterCommit hook failed — converter caches are inconsistent.
        // Clean up the XML parts that mutateParts committed (they are not
        // covered by compoundMutation's snapshot of document.xml.rels).
        if (hasPart(editor, newPartPath as PartId)) removePart(editor, newPartPath as PartId);
        const newRelsPath = toRelsPathForPart(newPartPath) as PartId;
        if (hasPart(editor, newRelsPath)) removePart(editor, newRelsPath);
        return false; // triggers rollback of document.xml.rels + converter metadata
      }

      // Register invalidation handler for the newly created part
      registerHeaderFooterInvalidation(newPartPath);

      // The rels afterCommit hook automatically initializes the new refId in
      // converter.headers/footers (with an empty JSON part), updates variantIds,
      // and sets headerFooterModified. Override with cloned source content if available.
      if (sourceSnapshot.jsonPart) {
        const collection = getCollection(converter, input.kind);
        collection[newRefId] = sourceSnapshot.jsonPart;
      }

      finalResult = { refId: newRefId, relationshipTarget: newPartPath };
      return true;
    },
  });

  if (!compound.success || !finalResult) {
    throw new Error(
      `[createHeaderFooterPart] Failed to create ${newPartPath}: ` +
        'mutation rolled back (possible afterCommit degradation).',
    );
  }

  return finalResult;
}
