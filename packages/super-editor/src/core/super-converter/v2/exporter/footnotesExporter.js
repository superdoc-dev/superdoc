import { exportSchemaToJson } from '../../exporter.js';
import { carbonCopy } from '../../../utilities/carbonCopy.js';
import { FOOTNOTES_XML_DEF } from '../../exporter-docx-defs.js';
import { mergeRelationshipElements } from '../../relationship-helpers.js';

const RELS_XMLNS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const FOOTNOTES_RELS_PATH = 'word/_rels/footnotes.xml.rels';

const paragraphHasFootnoteRef = (node) => {
  if (!node) return false;
  if (node.name === 'w:footnoteRef') return true;
  const children = Array.isArray(node.elements) ? node.elements : [];
  return children.some((child) => paragraphHasFootnoteRef(child));
};

const insertFootnoteRefIntoParagraph = (paragraph) => {
  if (!paragraph || paragraph.name !== 'w:p') return;
  if (!Array.isArray(paragraph.elements)) paragraph.elements = [];
  if (paragraphHasFootnoteRef(paragraph)) return;

  const footnoteRef = { type: 'element', name: 'w:footnoteRef', elements: [] };
  const footnoteRefRun = {
    type: 'element',
    name: 'w:r',
    elements: [
      {
        type: 'element',
        name: 'w:rPr',
        elements: [{ type: 'element', name: 'w:rStyle', attributes: { 'w:val': 'FootnoteReference' } }],
      },
      footnoteRef,
    ],
  };

  const pPrIndex = paragraph.elements.findIndex((el) => el?.name === 'w:pPr');
  const insertAt = pPrIndex >= 0 ? pPrIndex + 1 : 0;
  paragraph.elements.splice(insertAt, 0, footnoteRefRun);
};

const ensureFootnoteRefMarker = (elements) => {
  if (!Array.isArray(elements)) return;
  const firstParagraphIndex = elements.findIndex((el) => el?.name === 'w:p');
  if (firstParagraphIndex >= 0) {
    insertFootnoteRefIntoParagraph(elements[firstParagraphIndex]);
    return;
  }

  const paragraph = {
    type: 'element',
    name: 'w:p',
    elements: [],
  };
  insertFootnoteRefIntoParagraph(paragraph);
  elements.unshift(paragraph);
};

const translateFootnoteContent = (content, exportContext) => {
  if (!Array.isArray(content) || content.length === 0) return [];

  const translated = [];
  content.forEach((node) => {
    if (!node) return;
    const result = exportSchemaToJson({ ...exportContext, node });
    if (Array.isArray(result)) {
      result.filter(Boolean).forEach((entry) => translated.push(entry));
      return;
    }
    if (result) translated.push(result);
  });

  return translated;
};

export const createFootnoteElement = (footnote, exportContext) => {
  if (!footnote) return null;

  const { id, content, type, originalXml } = footnote;

  if ((type === 'separator' || type === 'continuationSeparator') && originalXml) {
    return carbonCopy(originalXml);
  }

  const attributes = { 'w:id': String(id) };
  if (type) attributes['w:type'] = type;

  const translatedContent = translateFootnoteContent(content, exportContext);

  // Only add footnoteRef if the original had one.
  // Custom mark footnotes (customMarkFollows=true on the reference) don't have w:footnoteRef
  // in their footnote content - the custom symbol appears in the document body instead.
  const originalHadFootnoteRef = originalXml ? paragraphHasFootnoteRef(originalXml) : true;
  if (originalHadFootnoteRef) {
    ensureFootnoteRefMarker(translatedContent);
  }

  const base = originalXml
    ? carbonCopy(originalXml)
    : {
        type: 'element',
        name: 'w:footnote',
        attributes: {},
        elements: [],
      };

  base.attributes = { ...(base.attributes || {}), ...attributes };
  base.elements = translatedContent;

  return base;
};

const applyFootnotePropertiesToSettings = (converter, convertedXml) => {
  const props = converter?.footnoteProperties;
  if (!props || props.source !== 'settings' || !props.originalXml) {
    return convertedXml;
  }

  const settingsXml = convertedXml['word/settings.xml'];
  const settingsRoot = settingsXml?.elements?.[0];
  if (!settingsRoot) return convertedXml;

  const updatedSettings = carbonCopy(settingsXml);
  const updatedRoot = updatedSettings.elements?.[0];
  if (!updatedRoot) return convertedXml;

  const elements = Array.isArray(updatedRoot.elements) ? updatedRoot.elements : [];
  const nextElements = elements.filter((el) => el?.name !== 'w:footnotePr');
  nextElements.push(carbonCopy(props.originalXml));
  updatedRoot.elements = nextElements;

  return { ...convertedXml, 'word/settings.xml': updatedSettings };
};

const buildFootnotesRelsXml = (converter, convertedXml, relationships) => {
  if (!relationships.length) return null;

  const existingRels = convertedXml[FOOTNOTES_RELS_PATH];
  const existingRoot = existingRels?.elements?.find((el) => el.name === 'Relationships');
  const existingElements = Array.isArray(existingRoot?.elements) ? existingRoot.elements : [];
  const merged = mergeRelationshipElements(existingElements, relationships);

  const declaration = existingRels?.declaration ?? converter?.initialJSON?.declaration;
  const relsXml = {
    ...(declaration ? { declaration } : {}),
    elements: [
      {
        name: 'Relationships',
        attributes: { xmlns: RELS_XMLNS },
        elements: merged,
      },
    ],
  };

  return relsXml;
};

export const prepareFootnotesXmlForExport = ({ footnotes, editor, converter, convertedXml }) => {
  let updatedXml = applyFootnotePropertiesToSettings(converter, convertedXml);

  if (!footnotes || !Array.isArray(footnotes) || footnotes.length === 0) {
    return { updatedXml, relationships: [], media: {} };
  }

  const footnoteRelationships = [];
  const footnoteMedia = {};
  const exportContext = {
    editor,
    editorSchema: editor?.schema,
    converter,
    relationships: footnoteRelationships,
    media: footnoteMedia,
  };

  const footnoteElements = footnotes.map((fn) => createFootnoteElement(fn, exportContext)).filter(Boolean);

  if (footnoteElements.length === 0) {
    return { updatedXml, relationships: [], media: footnoteMedia };
  }

  let footnotesXml = updatedXml['word/footnotes.xml'];
  if (!footnotesXml) {
    footnotesXml = carbonCopy(FOOTNOTES_XML_DEF);
  } else {
    footnotesXml = carbonCopy(footnotesXml);
  }

  if (footnotesXml.elements && footnotesXml.elements[0]) {
    footnotesXml.elements[0].elements = footnoteElements;
  }

  updatedXml = { ...updatedXml, 'word/footnotes.xml': footnotesXml };

  if (footnoteRelationships.length > 0) {
    const footnotesRelsXml = buildFootnotesRelsXml(converter, updatedXml, footnoteRelationships);
    if (footnotesRelsXml) {
      updatedXml = { ...updatedXml, [FOOTNOTES_RELS_PATH]: footnotesRelsXml };
    }
  }

  const relationships = [
    {
      type: 'element',
      name: 'Relationship',
      attributes: {
        Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes',
        Target: 'footnotes.xml',
      },
    },
  ];

  return { updatedXml, relationships, media: footnoteMedia };
};
