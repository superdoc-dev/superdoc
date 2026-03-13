import { v4 as uuidv4 } from 'uuid';
import { resolveOpcTargetPath } from './helpers.js';

export const BIBLIOGRAPHY_NAMESPACE_URI = 'http://schemas.openxmlformats.org/officeDocument/2006/bibliography';
export const CUSTOM_XML_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml';
export const CUSTOM_XML_PROPS_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps';
export const CUSTOM_XML_PROPS_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.customXmlProperties+xml';

const DEFAULT_SELECTED_STYLE = '/APA.XSL';
const DEFAULT_STYLE_NAME = 'APA';
const DEFAULT_VERSION = '6';

const DEFAULT_XML_DECLARATION = Object.freeze({
  attributes: Object.freeze({
    version: '1.0',
    encoding: 'UTF-8',
    standalone: 'yes',
  }),
});

const API_TO_OOXML_SOURCE_TYPE = Object.freeze({
  book: 'Book',
  journalArticle: 'JournalArticle',
  conferenceProceedings: 'ConferenceProceedings',
  report: 'Report',
  website: 'InternetSite',
  patent: 'Patent',
  case: 'Case',
  statute: 'Case',
  thesis: 'Report',
  film: 'Film',
  interview: 'Interview',
  misc: 'Misc',
});

const OOXML_TO_API_SOURCE_TYPE = Object.freeze({
  book: 'book',
  journalarticle: 'journalArticle',
  conferenceproceedings: 'conferenceProceedings',
  report: 'report',
  internetsite: 'website',
  documentfrominternetsite: 'website',
  articleinaperiodical: 'journalArticle',
  patent: 'patent',
  case: 'case',
  statute: 'statute',
  thesis: 'thesis',
  film: 'film',
  interview: 'interview',
  misc: 'misc',
});

const SIMPLE_FIELD_TO_XML_TAG = Object.freeze({
  title: 'Title',
  year: 'Year',
  publisher: 'Publisher',
  city: 'City',
  journalName: 'JournalName',
  volume: 'Volume',
  issue: 'Issue',
  pages: 'Pages',
  url: 'URL',
  doi: 'DOI',
  edition: 'Edition',
  medium: 'Medium',
  shortTitle: 'ShortTitle',
  standardNumber: 'StandardNumber',
});

const XML_TAG_TO_SIMPLE_FIELD = Object.freeze(
  Object.fromEntries(Object.entries(SIMPLE_FIELD_TO_XML_TAG).map(([field, tag]) => [tag, field])),
);

function getLocalName(name) {
  if (!name || typeof name !== 'string') return '';
  const separatorIndex = name.indexOf(':');
  return separatorIndex >= 0 ? name.slice(separatorIndex + 1) : name;
}

function readTextNode(node) {
  if (!node?.elements?.length) return '';
  const textNode = node.elements.find((element) => element?.type === 'text');
  return typeof textNode?.text === 'string' ? textNode.text.trim() : '';
}

function createTextElement(name, text) {
  return {
    type: 'element',
    name,
    elements: [{ type: 'text', text: String(text) }],
  };
}

function createXmlDocument(rootElement, declaration) {
  const nextDeclaration = declaration ?? DEFAULT_XML_DECLARATION;
  return {
    declaration: {
      ...nextDeclaration,
      attributes: {
        ...nextDeclaration.attributes,
      },
    },
    elements: [rootElement],
  };
}

function collectPersonNodes(node, output) {
  if (!node?.elements?.length) return;
  for (const child of node.elements) {
    if (!child || child.type !== 'element') continue;
    if (getLocalName(child.name) === 'Person') {
      output.push(child);
      continue;
    }
    collectPersonNodes(child, output);
  }
}

function parsePersonNode(personNode) {
  const person = {};
  for (const child of personNode?.elements ?? []) {
    if (!child || child.type !== 'element') continue;
    const localName = getLocalName(child.name);
    const value = readTextNode(child);
    if (!value) continue;
    if (localName === 'First') person.first = value;
    if (localName === 'Middle') person.middle = value;
    if (localName === 'Last') person.last = value;
  }
  return typeof person.last === 'string' && person.last.length > 0 ? person : null;
}

function parseContributorPeople(sourceElement, contributorTag) {
  const contributorNode = (sourceElement?.elements ?? []).find(
    (child) => child?.type === 'element' && getLocalName(child.name) === contributorTag,
  );
  if (!contributorNode) return [];

  const peopleNodes = [];
  collectPersonNodes(contributorNode, peopleNodes);
  return peopleNodes.map(parsePersonNode).filter(Boolean);
}

function serializePersonNode(person) {
  if (!person || typeof person.last !== 'string' || person.last.trim().length === 0) return null;

  const elements = [];
  const last = person.last.trim();
  const first = typeof person.first === 'string' ? person.first.trim() : '';
  const middle = typeof person.middle === 'string' ? person.middle.trim() : '';

  if (last) elements.push(createTextElement('b:Last', last));
  if (first) elements.push(createTextElement('b:First', first));
  if (middle) elements.push(createTextElement('b:Middle', middle));

  return {
    type: 'element',
    name: 'b:Person',
    elements,
  };
}

function serializeNameList(people) {
  const personElements = (people ?? []).map(serializePersonNode).filter(Boolean);
  if (personElements.length === 0) return null;
  return {
    type: 'element',
    name: 'b:NameList',
    elements: personElements,
  };
}

function serializeContributorNode(tagName, people) {
  const nameList = serializeNameList(people);
  if (!nameList) return null;

  if (tagName === 'Author') {
    return {
      type: 'element',
      name: 'b:Author',
      elements: [
        {
          type: 'element',
          name: 'b:Author',
          elements: [nameList],
        },
      ],
    };
  }

  return {
    type: 'element',
    name: `b:${tagName}`,
    elements: [nameList],
  };
}

function mapApiTypeToOoxml(type) {
  const normalizedType = typeof type === 'string' ? type.trim() : '';
  return API_TO_OOXML_SOURCE_TYPE[normalizedType] ?? API_TO_OOXML_SOURCE_TYPE.misc;
}

function mapOoxmlTypeToApi(type) {
  const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : '';
  return OOXML_TO_API_SOURCE_TYPE[normalizedType] ?? 'misc';
}

function normalizeSourceRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const tagRaw = record.tag ?? record.sourceId;
  const tag = typeof tagRaw === 'string' ? tagRaw.trim() : '';
  if (!tag) return null;

  const type = typeof record.type === 'string' ? record.type : 'misc';
  const fieldsInput = record.fields && typeof record.fields === 'object' ? record.fields : {};
  const fields = {};

  for (const fieldName of Object.keys(SIMPLE_FIELD_TO_XML_TAG)) {
    const value = fieldsInput[fieldName];
    if (typeof value === 'string' && value.trim().length > 0) {
      fields[fieldName] = value.trim();
    }
  }

  for (const contributorField of ['authors', 'editor', 'translator']) {
    const value = fieldsInput[contributorField];
    if (!Array.isArray(value)) continue;
    const people = value
      .map((person) => {
        if (!person || typeof person !== 'object') return null;
        const normalizedPerson = {
          first: typeof person.first === 'string' ? person.first.trim() : undefined,
          middle: typeof person.middle === 'string' ? person.middle.trim() : undefined,
          last: typeof person.last === 'string' ? person.last.trim() : undefined,
        };
        return normalizedPerson.last ? normalizedPerson : null;
      })
      .filter(Boolean);
    if (people.length > 0) fields[contributorField] = people;
  }

  return {
    tag,
    type,
    fields,
  };
}

function parseSourceNode(sourceNode) {
  const fields = {};
  let tag = '';
  let sourceType = 'misc';

  for (const child of sourceNode?.elements ?? []) {
    if (!child || child.type !== 'element') continue;
    const localName = getLocalName(child.name);

    if (localName === 'Tag') {
      tag = readTextNode(child);
      continue;
    }

    if (localName === 'SourceType') {
      sourceType = mapOoxmlTypeToApi(readTextNode(child));
      continue;
    }

    const fieldName = XML_TAG_TO_SIMPLE_FIELD[localName];
    if (!fieldName) continue;
    const value = readTextNode(child);
    if (value) fields[fieldName] = value;
  }

  const authors = parseContributorPeople(sourceNode, 'Author');
  if (authors.length > 0) fields.authors = authors;

  const editors = parseContributorPeople(sourceNode, 'Editor');
  if (editors.length > 0) fields.editor = editors;

  const translators = parseContributorPeople(sourceNode, 'Translator');
  if (translators.length > 0) fields.translator = translators;

  return normalizeSourceRecord({ tag, type: sourceType, fields });
}

function buildSourceNode(sourceRecord) {
  const normalized = normalizeSourceRecord(sourceRecord);
  if (!normalized) return null;

  const elements = [
    createTextElement('b:Tag', normalized.tag),
    createTextElement('b:SourceType', mapApiTypeToOoxml(normalized.type)),
  ];

  for (const [fieldName, xmlTagName] of Object.entries(SIMPLE_FIELD_TO_XML_TAG)) {
    const value = normalized.fields?.[fieldName];
    if (typeof value !== 'string' || value.length === 0) continue;
    elements.push(createTextElement(`b:${xmlTagName}`, value));
  }

  const authorsNode = serializeContributorNode('Author', normalized.fields?.authors);
  if (authorsNode) elements.push(authorsNode);

  const editorNode = serializeContributorNode('Editor', normalized.fields?.editor);
  if (editorNode) elements.push(editorNode);

  const translatorNode = serializeContributorNode('Translator', normalized.fields?.translator);
  if (translatorNode) elements.push(translatorNode);

  return {
    type: 'element',
    name: 'b:Source',
    elements,
  };
}

function isBibliographySourcesRoot(rootNode) {
  if (!rootNode || rootNode.type !== 'element') return false;
  if (getLocalName(rootNode.name) !== 'Sources') return false;

  const rootNamespace = rootNode.attributes?.xmlns;
  const prefixedNamespace = rootNode.attributes?.['xmlns:b'];
  return rootNamespace === BIBLIOGRAPHY_NAMESPACE_URI || prefixedNamespace === BIBLIOGRAPHY_NAMESPACE_URI;
}

function parseItemIndex(path) {
  const match = /customXml\/item(\d+)\.xml$/i.exec(path || '');
  return match ? Number.parseInt(match[1], 10) : null;
}

function buildDocumentRelationshipTarget(partPath) {
  return partPath.startsWith('customXml/') ? `../${partPath}` : partPath;
}

function getExistingDocumentRelationshipsRoot(convertedXml) {
  const relsData = convertedXml?.['word/_rels/document.xml.rels'];
  if (!relsData?.elements?.length) return null;
  return relsData.elements.find((element) => getLocalName(element.name) === 'Relationships') || null;
}

function ensureDocumentRelationshipsRoot(convertedXml) {
  if (!convertedXml['word/_rels/document.xml.rels']) {
    convertedXml['word/_rels/document.xml.rels'] = createXmlDocument({
      type: 'element',
      name: 'Relationships',
      attributes: {
        xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships',
      },
      elements: [],
    });
  }

  const relsData = convertedXml['word/_rels/document.xml.rels'];
  relsData.elements ??= [];
  let relationshipsRoot = relsData.elements.find((element) => getLocalName(element.name) === 'Relationships');
  if (!relationshipsRoot) {
    relationshipsRoot = {
      type: 'element',
      name: 'Relationships',
      attributes: {
        xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships',
      },
      elements: [],
    };
    relsData.elements.push(relationshipsRoot);
  }
  relationshipsRoot.elements ??= [];
  return relationshipsRoot;
}

function getNextRelationshipId(relationshipsRoot) {
  const existingNumericIds = (relationshipsRoot?.elements ?? [])
    .map((relationship) => {
      const id = relationship?.attributes?.Id;
      if (typeof id !== 'string') return NaN;
      const match = /^rId(\d+)$/.exec(id);
      return match ? Number.parseInt(match[1], 10) : NaN;
    })
    .filter((value) => Number.isFinite(value));
  const maxExistingId = existingNumericIds.length > 0 ? Math.max(...existingNumericIds) : 0;
  return `rId${maxExistingId + 1}`;
}

function getNextCustomXmlItemIndex(convertedXml) {
  const usedIndexes = new Set();
  for (const path of Object.keys(convertedXml ?? {})) {
    const itemMatch = /customXml\/item(\d+)\.xml$/i.exec(path);
    if (itemMatch) usedIndexes.add(Number.parseInt(itemMatch[1], 10));
    const itemPropsMatch = /customXml\/itemProps(\d+)\.xml$/i.exec(path);
    if (itemPropsMatch) usedIndexes.add(Number.parseInt(itemPropsMatch[1], 10));
  }

  let candidate = 1;
  while (usedIndexes.has(candidate)) candidate += 1;
  return candidate;
}

function buildSourcesRootElement(sources, styleMetadata) {
  const sourceElements = sources.map(buildSourceNode).filter(Boolean);
  const selectedStyle = styleMetadata.selectedStyle || DEFAULT_SELECTED_STYLE;
  const styleName = styleMetadata.styleName || DEFAULT_STYLE_NAME;
  const version = styleMetadata.version || DEFAULT_VERSION;

  return {
    type: 'element',
    name: 'b:Sources',
    attributes: {
      'xmlns:b': BIBLIOGRAPHY_NAMESPACE_URI,
      xmlns: BIBLIOGRAPHY_NAMESPACE_URI,
      SelectedStyle: selectedStyle,
      StyleName: styleName,
      Version: version,
    },
    elements: sourceElements,
  };
}

function extractExistingDataStoreItemId(itemPropsDoc) {
  const root = itemPropsDoc?.elements?.[0];
  const existingId = root?.attributes?.['ds:itemID'];
  return typeof existingId === 'string' && existingId.length > 0 ? existingId : null;
}

function buildItemPropsRootElement(dataStoreItemId) {
  return {
    type: 'element',
    name: 'ds:datastoreItem',
    attributes: {
      'ds:itemID': dataStoreItemId,
      'xmlns:ds': 'http://schemas.openxmlformats.org/officeDocument/2006/customXml',
    },
    elements: [
      {
        type: 'element',
        name: 'ds:schemaRefs',
        elements: [
          {
            type: 'element',
            name: 'ds:schemaRef',
            attributes: {
              'ds:uri': BIBLIOGRAPHY_NAMESPACE_URI,
            },
          },
        ],
      },
    ],
  };
}

function buildCustomXmlItemRelationshipsRoot(itemPropsFileName) {
  return {
    type: 'element',
    name: 'Relationships',
    attributes: {
      xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships',
    },
    elements: [
      {
        type: 'element',
        name: 'Relationship',
        attributes: {
          Id: 'rId1',
          Type: CUSTOM_XML_PROPS_RELATIONSHIP_TYPE,
          Target: itemPropsFileName,
        },
      },
    ],
  };
}

function dedupeSourcesByTag(sourceRecords) {
  const byTag = new Map();
  for (const source of sourceRecords) {
    const normalized = normalizeSourceRecord(source);
    if (!normalized) continue;
    byTag.set(normalized.tag, normalized);
  }
  return Array.from(byTag.values());
}

export function createEmptyBibliographyPart() {
  return {
    sources: [],
    partPath: null,
    itemPropsPath: null,
    itemRelsPath: null,
    selectedStyle: null,
    styleName: null,
    version: null,
  };
}

export function loadBibliographyPartFromPackage(convertedXml) {
  const bibliographyPart = createEmptyBibliographyPart();
  const relationshipsRoot = getExistingDocumentRelationshipsRoot(convertedXml);
  if (!relationshipsRoot?.elements?.length) return bibliographyPart;

  const discoveredSources = [];

  for (const relationship of relationshipsRoot.elements) {
    const type = relationship?.attributes?.Type;
    if (type !== CUSTOM_XML_RELATIONSHIP_TYPE) continue;

    const target = relationship?.attributes?.Target;
    const resolvedPath = resolveOpcTargetPath(target, 'word');
    if (!resolvedPath) continue;

    const bibliographyPartData = convertedXml?.[resolvedPath];
    const rootElement = bibliographyPartData?.elements?.[0];
    if (!isBibliographySourcesRoot(rootElement)) continue;

    if (!bibliographyPart.partPath) {
      bibliographyPart.partPath = resolvedPath;
      bibliographyPart.selectedStyle = rootElement.attributes?.SelectedStyle ?? null;
      bibliographyPart.styleName = rootElement.attributes?.StyleName ?? null;
      bibliographyPart.version = rootElement.attributes?.Version ?? null;

      const itemIndex = parseItemIndex(resolvedPath);
      if (itemIndex != null) {
        const itemPropsPath = `customXml/itemProps${itemIndex}.xml`;
        const itemRelsPath = `customXml/_rels/item${itemIndex}.xml.rels`;
        bibliographyPart.itemPropsPath = convertedXml[itemPropsPath] ? itemPropsPath : null;
        bibliographyPart.itemRelsPath = convertedXml[itemRelsPath] ? itemRelsPath : null;
      }
    }

    for (const child of rootElement.elements ?? []) {
      if (!child || child.type !== 'element' || getLocalName(child.name) !== 'Source') continue;
      const source = parseSourceNode(child);
      if (source) discoveredSources.push(source);
    }
  }

  bibliographyPart.sources = dedupeSourcesByTag(discoveredSources);
  return bibliographyPart;
}

export function syncBibliographyPartToPackage(convertedXml, bibliographyPart) {
  const currentPackageState = loadBibliographyPartFromPackage(convertedXml);
  const requestedSources = Array.isArray(bibliographyPart?.sources) ? bibliographyPart.sources : [];
  const normalizedSources = dedupeSourcesByTag(requestedSources);

  if (normalizedSources.length === 0 && !currentPackageState.partPath) {
    return {
      ...createEmptyBibliographyPart(),
      sources: [],
    };
  }

  const preferredPartPath = bibliographyPart?.partPath || currentPackageState.partPath;
  const preferredItemIndex = parseItemIndex(preferredPartPath);
  const itemIndex = preferredItemIndex ?? getNextCustomXmlItemIndex(convertedXml);
  const partPath = preferredItemIndex ? preferredPartPath : `customXml/item${itemIndex}.xml`;
  const itemPropsPath = `customXml/itemProps${itemIndex}.xml`;
  const itemRelsPath = `customXml/_rels/item${itemIndex}.xml.rels`;

  const selectedStyle = bibliographyPart?.selectedStyle ?? currentPackageState.selectedStyle ?? DEFAULT_SELECTED_STYLE;
  const styleName = bibliographyPart?.styleName ?? currentPackageState.styleName ?? DEFAULT_STYLE_NAME;
  const version = bibliographyPart?.version ?? currentPackageState.version ?? DEFAULT_VERSION;

  const existingPartDeclaration = convertedXml[partPath]?.declaration;
  const sourcesRoot = buildSourcesRootElement(normalizedSources, { selectedStyle, styleName, version });
  convertedXml[partPath] = createXmlDocument(sourcesRoot, existingPartDeclaration);

  const relationshipsRoot = ensureDocumentRelationshipsRoot(convertedXml);
  const expectedTarget = buildDocumentRelationshipTarget(partPath);
  const hasCustomXmlRelationship = relationshipsRoot.elements.some((relationship) => {
    if (relationship?.attributes?.Type !== CUSTOM_XML_RELATIONSHIP_TYPE) return false;
    const resolved = resolveOpcTargetPath(relationship?.attributes?.Target, 'word');
    return resolved === partPath;
  });

  if (!hasCustomXmlRelationship) {
    relationshipsRoot.elements.push({
      type: 'element',
      name: 'Relationship',
      attributes: {
        Id: getNextRelationshipId(relationshipsRoot),
        Type: CUSTOM_XML_RELATIONSHIP_TYPE,
        Target: expectedTarget,
      },
    });
  }

  const existingItemProps = convertedXml[itemPropsPath];
  const existingItemPropsDeclaration = existingItemProps?.declaration;
  const dataStoreItemId = extractExistingDataStoreItemId(existingItemProps) || `{${uuidv4().toUpperCase()}}`;
  convertedXml[itemPropsPath] = createXmlDocument(
    buildItemPropsRootElement(dataStoreItemId),
    existingItemPropsDeclaration,
  );

  const existingItemRelsDeclaration = convertedXml[itemRelsPath]?.declaration;
  convertedXml[itemRelsPath] = createXmlDocument(
    buildCustomXmlItemRelationshipsRoot(`itemProps${itemIndex}.xml`),
    existingItemRelsDeclaration,
  );

  return {
    sources: normalizedSources,
    partPath,
    itemPropsPath,
    itemRelsPath,
    selectedStyle,
    styleName,
    version,
  };
}

export function getBibliographyPartExportPaths(bibliographyPart) {
  const paths = [bibliographyPart?.partPath, bibliographyPart?.itemPropsPath, bibliographyPart?.itemRelsPath];
  return paths.filter((path) => typeof path === 'string' && path.length > 0);
}
