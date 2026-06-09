import { exportSchemaToJson } from '../../exporter.js';
import { carbonCopy } from '../../../utilities/carbonCopy.js';
import { FOOTNOTES_XML_DEF } from '../../exporter-docx-defs.js';
import { mergeRelationshipElements } from '../../relationship-helpers.js';

const RELS_XMLNS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const FOOTNOTES_RELS_PATH = 'word/_rels/footnotes.xml.rels';
const ENDNOTES_RELS_PATH = 'word/_rels/endnotes.xml.rels';

const FOOTNOTES_CONFIG = {
  notesPath: 'word/footnotes.xml',
  relsPath: FOOTNOTES_RELS_PATH,
  rootName: 'w:footnotes',
  noteName: 'w:footnote',
  refName: 'w:footnoteRef',
  refStyle: 'FootnoteReference',
  relationshipType: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes',
  relationshipTarget: 'footnotes.xml',
  // Footnotes own the settings.xml export side-effects (footnoteProperties +
  // viewSetting). The endnote path skips them so we don't double-apply.
  applySettingsSideEffects: true,
};

const ENDNOTES_CONFIG = {
  notesPath: 'word/endnotes.xml',
  relsPath: ENDNOTES_RELS_PATH,
  rootName: 'w:endnotes',
  noteName: 'w:endnote',
  refName: 'w:endnoteRef',
  refStyle: 'EndnoteReference',
  relationshipType: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes',
  relationshipTarget: 'endnotes.xml',
  applySettingsSideEffects: false,
};

const paragraphHasFootnoteRef = (node) => {
  if (!node) return false;
  if (node.name === 'w:footnoteRef' || node.name === 'w:endnoteRef') return true;
  const children = Array.isArray(node.elements) ? node.elements : [];
  return children.some((child) => paragraphHasFootnoteRef(child));
};

const insertFootnoteRefIntoParagraph = (paragraph, config) => {
  if (!paragraph || paragraph.name !== 'w:p') return;
  if (!Array.isArray(paragraph.elements)) paragraph.elements = [];
  if (paragraphHasFootnoteRef(paragraph)) return;

  const footnoteRef = { type: 'element', name: config.refName, elements: [] };
  const footnoteRefRun = {
    type: 'element',
    name: 'w:r',
    elements: [
      {
        type: 'element',
        name: 'w:rPr',
        elements: [
          { type: 'element', name: 'w:rStyle', attributes: { 'w:val': config.refStyle } },
          { type: 'element', name: 'w:vertAlign', attributes: { 'w:val': 'superscript' } },
        ],
      },
      footnoteRef,
    ],
  };

  const pPrIndex = paragraph.elements.findIndex((el) => el?.name === 'w:pPr');
  const insertAt = pPrIndex >= 0 ? pPrIndex + 1 : 0;
  paragraph.elements.splice(insertAt, 0, footnoteRefRun);
};

const ensureFootnoteRefMarker = (elements, config) => {
  if (!Array.isArray(elements)) return;
  const firstParagraphIndex = elements.findIndex((el) => el?.name === 'w:p');
  if (firstParagraphIndex >= 0) {
    insertFootnoteRefIntoParagraph(elements[firstParagraphIndex], config);
    return;
  }

  const paragraph = {
    type: 'element',
    name: 'w:p',
    elements: [],
  };
  insertFootnoteRefIntoParagraph(paragraph, config);
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

export const createFootnoteElement = (footnote, exportContext, config = FOOTNOTES_CONFIG) => {
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
    ensureFootnoteRefMarker(translatedContent, config);
  }

  const base = originalXml
    ? carbonCopy(originalXml)
    : {
        type: 'element',
        name: config.noteName,
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

const applyViewSettingToSettings = (converter, convertedXml) => {
  const viewSetting = converter?.viewSetting;
  if (!viewSetting?.originalXml) return convertedXml;

  const settingsXml = convertedXml['word/settings.xml'];
  const settingsRoot = settingsXml?.elements?.[0];
  if (!settingsRoot) return convertedXml;

  const updatedSettings = carbonCopy(settingsXml);
  const updatedRoot = updatedSettings.elements?.[0];
  if (!updatedRoot) return convertedXml;

  const elements = Array.isArray(updatedRoot.elements) ? updatedRoot.elements : [];
  const idx = elements.findIndex((el) => el?.name === 'w:view');
  // If w:view already exists, replace it in place. Falling back to index 0
  // is acceptable because w:view is the first child of w:settings in the
  // OOXML schema (before w:writeProtection). In practice the element always
  // exists during round-trip since we import it.
  elements.splice(idx !== -1 ? idx : 0, idx !== -1 ? 1 : 0, carbonCopy(viewSetting.originalXml));
  updatedRoot.elements = elements;

  return { ...convertedXml, 'word/settings.xml': updatedSettings };
};

const buildFootnotesRelsXml = (converter, convertedXml, relationships, relsPath = FOOTNOTES_RELS_PATH) => {
  if (!relationships.length) return null;

  const existingRels = convertedXml[relsPath];
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

const createNotesXmlDefinition = (config) => {
  const base = carbonCopy(FOOTNOTES_XML_DEF);
  if (base.elements?.[0]) {
    base.elements[0].name = config.rootName;
  }
  return base;
};

const prepareNotesXmlForExport = ({ notes, editor, converter, convertedXml, config }) => {
  // Settings.xml side-effects (re-emitting w:footnotePr and w:view) belong to
  // the footnotes path only. The endnote path skips them so we don't redo the
  // same idempotent work twice per export.
  let updatedXml = convertedXml;
  if (config.applySettingsSideEffects) {
    updatedXml = applyFootnotePropertiesToSettings(converter, updatedXml);
    updatedXml = applyViewSettingToSettings(converter, updatedXml);
  }

  if (!notes || !Array.isArray(notes) || notes.length === 0) {
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
    currentPartPath: config.notesPath,
  };

  const footnoteElements = notes.map((fn) => createFootnoteElement(fn, exportContext, config)).filter(Boolean);

  if (footnoteElements.length === 0) {
    return { updatedXml, relationships: [], media: footnoteMedia };
  }

  let footnotesXml = updatedXml[config.notesPath];
  if (!footnotesXml) {
    footnotesXml = createNotesXmlDefinition(config);
  } else {
    footnotesXml = carbonCopy(footnotesXml);
  }

  if (footnotesXml.elements && footnotesXml.elements[0]) {
    footnotesXml.elements[0].elements = footnoteElements;
  }

  updatedXml = { ...updatedXml, [config.notesPath]: footnotesXml };

  if (footnoteRelationships.length > 0) {
    const footnotesRelsXml = buildFootnotesRelsXml(converter, updatedXml, footnoteRelationships, config.relsPath);
    if (footnotesRelsXml) {
      updatedXml = { ...updatedXml, [config.relsPath]: footnotesRelsXml };
    }
  }

  const relationships = [
    {
      type: 'element',
      name: 'Relationship',
      attributes: {
        Type: config.relationshipType,
        Target: config.relationshipTarget,
      },
    },
  ];

  return { updatedXml, relationships, media: footnoteMedia };
};

export const prepareFootnotesXmlForExport = ({ footnotes, editor, converter, convertedXml }) =>
  prepareNotesXmlForExport({
    notes: footnotes,
    editor,
    converter,
    convertedXml,
    config: FOOTNOTES_CONFIG,
  });

export const prepareEndnotesXmlForExport = ({ endnotes, editor, converter, convertedXml }) =>
  prepareNotesXmlForExport({
    notes: endnotes,
    editor,
    converter,
    convertedXml,
    config: ENDNOTES_CONFIG,
  });
