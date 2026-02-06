import * as xmljs from 'xml-js';
import { v4 as uuidv4 } from 'uuid';
import crc32 from 'buffer-crc32';
import { DocxExporter, exportSchemaToJson } from './exporter';
import { createDocumentJson, addDefaultStylesIfMissing } from './v2/importer/docxImporter.js';
import { deobfuscateFont, getArrayBufferFromUrl } from './helpers.js';
import { baseNumbering } from './v2/exporter/helpers/base-list.definitions.js';
import { DEFAULT_CUSTOM_XML, DEFAULT_DOCX_DEFS } from './exporter-docx-defs.js';
import {
  getCommentDefinition,
  prepareCommentParaIds,
  prepareCommentsXmlFilesForExport,
} from './v2/exporter/commentsExporter.js';
import { prepareFootnotesXmlForExport } from './v2/exporter/footnotesExporter.js';
import { DocxHelpers } from './docx-helpers/index.js';
import { mergeRelationshipElements } from './relationship-helpers.js';

const FONT_FAMILY_FALLBACKS = Object.freeze({
  swiss: 'Arial, sans-serif',
  roman: 'Times New Roman, serif',
  modern: 'Courier New, monospace',
  script: 'cursive',
  decorative: 'fantasy',
  system: 'system-ui',
  auto: 'sans-serif',
});

const DEFAULT_GENERIC_FALLBACK = 'sans-serif';
const DEFAULT_FONT_SIZE_PT = 10;

/**
 * Pull default run formatting (font family, size, kern) out of a DOCX run properties node.
 * Mutates the supplied state object with any discovered values.
 */
const collectRunDefaultProperties = (
  runProps,
  { allowOverrideTypeface = true, allowOverrideSize = true, themeResolver, state },
) => {
  if (!runProps?.elements?.length || !state) return;

  const fontsNode = runProps.elements.find((el) => el.name === 'w:rFonts');
  if (fontsNode?.attributes) {
    const themeName = fontsNode.attributes['w:asciiTheme'];
    if (themeName) {
      const themeInfo = themeResolver?.(themeName) || {};
      if ((allowOverrideTypeface || !state.typeface) && themeInfo.typeface) state.typeface = themeInfo.typeface;
      if ((allowOverrideTypeface || !state.panose) && themeInfo.panose) state.panose = themeInfo.panose;
    }

    const ascii = fontsNode.attributes['w:ascii'];
    if ((allowOverrideTypeface || !state.typeface) && ascii) {
      state.typeface = ascii;
    }
  }

  const sizeNode = runProps.elements.find((el) => el.name === 'w:sz');
  if (sizeNode?.attributes?.['w:val']) {
    const sizeTwips = Number(sizeNode.attributes['w:val']);
    if (Number.isFinite(sizeTwips)) {
      if (state.fallbackSzTwips === undefined) state.fallbackSzTwips = sizeTwips;
      const sizePt = sizeTwips / 2;
      if (allowOverrideSize || state.fontSizePt === undefined) state.fontSizePt = sizePt;
    }
  }

  const kernNode = runProps.elements.find((el) => el.name === 'w:kern');
  if (kernNode?.attributes?.['w:val']) {
    if (allowOverrideSize || state.kern === undefined) state.kern = kernNode.attributes['w:val'];
  }
};

class SuperConverter {
  static allowedElements = Object.freeze({
    'w:document': 'doc',
    'w:body': 'body',
    'w:p': 'paragraph',
    'w:r': 'run',
    'w:t': 'text',
    'w:delText': 'text',
    'w:br': 'lineBreak',
    'w:tbl': 'table',
    'w:tr': 'tableRow',
    'w:tc': 'tableCell',
    'w:drawing': 'drawing',
    'w:bookmarkStart': 'bookmarkStart',
    // 'w:tab': 'tab',

    // Formatting only
    'w:sectPr': 'sectionProperties',
    'w:rPr': 'runProperties',

    // Comments
    'w:commentRangeStart': 'commentRangeStart',
    'w:commentRangeEnd': 'commentRangeEnd',
    'w:commentReference': 'commentReference',
  });

  static markTypes = [
    { name: 'w:b', type: 'bold', property: 'value' },
    // { name: 'w:bCs', type: 'bold' },
    { name: 'w:i', type: 'italic' },
    // { name: 'w:iCs', type: 'italic' },
    { name: 'w:u', type: 'underline', mark: 'underline', property: 'underlineType' },
    { name: 'w:strike', type: 'strike', mark: 'strike', property: 'value' },
    { name: 'w:color', type: 'color', mark: 'textStyle', property: 'color' },
    { name: 'w:sz', type: 'fontSize', mark: 'textStyle', property: 'fontSize' },
    // { name: 'w:szCs', type: 'fontSize', mark: 'textStyle', property: 'fontSize' },
    { name: 'w:rFonts', type: 'fontFamily', mark: 'textStyle', property: 'fontFamily' },
    { name: 'w:rStyle', type: 'styleId', mark: 'textStyle', property: 'styleId' },
    { name: 'w:jc', type: 'textAlign', mark: 'textStyle', property: 'textAlign' },
    { name: 'w:ind', type: 'textIndent', mark: 'textStyle', property: 'textIndent' },
    { name: 'w:spacing', type: 'lineHeight', mark: 'textStyle', property: 'lineHeight' },
    { name: 'w:spacing', type: 'letterSpacing', mark: 'textStyle', property: 'letterSpacing' },
    { name: 'link', type: 'link', mark: 'link', property: 'href' },
    { name: 'w:highlight', type: 'highlight', mark: 'highlight', property: 'color' },
    { name: 'w:shd', type: 'highlight', mark: 'highlight', property: 'color' },
    { name: 'w:caps', type: 'textTransform', mark: 'textStyle', property: 'textTransform' },
  ];

  static propertyTypes = Object.freeze({
    'w:pPr': 'paragraphProperties',
    'w:rPr': 'runProperties',
    'w:sectPr': 'sectionProperties',
    'w:numPr': 'numberingProperties',
    'w:tcPr': 'tableCellProperties',
  });

  static elements = new Set(['w:document', 'w:body', 'w:p', 'w:r', 'w:t', 'w:delText']);

  static getFontTableEntry(docx, fontName) {
    if (!docx || !fontName) return null;
    const fontTable = docx['word/fontTable.xml'];
    if (!fontTable?.elements?.length) return null;
    const fontsNode = fontTable.elements.find((el) => el.name === 'w:fonts');
    if (!fontsNode?.elements?.length) return null;
    return fontsNode.elements.find((el) => el?.attributes?.['w:name'] === fontName) || null;
  }

  static getFallbackFromFontTable(docx, fontName) {
    const fontEntry = SuperConverter.getFontTableEntry(docx, fontName);
    const family = fontEntry?.elements?.find((child) => child.name === 'w:family')?.attributes?.['w:val'];
    if (!family) return null;
    const mapped = FONT_FAMILY_FALLBACKS[family.toLowerCase()];
    return mapped || DEFAULT_GENERIC_FALLBACK;
  }

  static toCssFontFamily(fontName, docx) {
    if (!fontName) return fontName;
    if (fontName.includes(',')) return fontName;

    const fallback = SuperConverter.getFallbackFromFontTable(docx, fontName) || DEFAULT_GENERIC_FALLBACK;

    const normalizedFallbackParts = fallback
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);

    if (normalizedFallbackParts.includes(fontName.trim().toLowerCase())) {
      return fallback;
    }

    return `${fontName}, ${fallback}`;
  }

  constructor(params = null) {
    // Suppress logging when true
    this.debug = params?.debug || false;

    // Optional DOM environment for server-side usage (e.g., JSDOM)
    this.domEnvironment = {
      mockWindow: params?.mockWindow || null,
      mockDocument: params?.mockDocument || null,
    };

    // Important docx pieces
    this.declaration = null;
    this.documentAttributes = null;

    // The docx as a list of files
    this.convertedXml = {};
    this.docx = params?.docx || [];
    this.media = params?.media || {};

    this.fonts = params?.fonts || {};

    this.addedMedia = {};
    this.comments = [];
    this.footnotes = [];
    this.footnoteProperties = null;
    this.inlineDocumentFonts = [];
    this.commentThreadingProfile = null;

    // Store custom highlight colors
    this.docHiglightColors = new Set([]);

    // XML inputs
    this.xml = params?.xml;
    this.declaration = null;

    // List defs (deprecated)
    this.numbering = {};

    // Translated numbering definitions
    this.translatedNumbering = {};

    // Processed additional content
    this.numbering = null;
    this.pageStyles = null;
    this.themeColors = null;

    // The JSON converted XML before any processing. This is simply the result of xml2json
    this.initialJSON = null;

    // Headers and footers
    this.headers = {};
    this.headerIds = { default: null, even: null, odd: null, first: null };
    this.headerEditors = [];
    this.footers = {};
    this.footerIds = { default: null, even: null, odd: null, first: null };
    this.footerEditors = [];
    this.importedBodyHasHeaderRef = false;
    this.importedBodyHasFooterRef = false;
    this.headerFooterModified = false;

    // Linked Styles (deprecated)
    this.linkedStyles = [];

    // Translated linked styles
    this.translatedLinkedStyles = {};

    // This is the JSON schema that we will be working with
    this.json = params?.json;

    this.tagsNotInSchema = ['w:body'];
    this.savedTagsToRestore = [];

    this.documentInternalId = null;

    // Uploaded file
    this.fileSource = params?.fileSource || null;
    this.documentId = params?.documentId || null;

    // Document identification
    this.documentGuid = null; // Permanent GUID for modified documents
    this.documentHash = null; // Temporary hash for unmodified documents
    this.documentModified = false; // Track if document has been edited

    // Parse the initial XML, if provided
    if (this.docx.length || this.xml) this.parseFromXml();
  }

  /**
   * Get the DocxHelpers object that contains utility functions for working with docx files.
   * @returns {import('./docx-helpers/docx-helpers.js').DocxHelpers} The DocxHelpers object.
   */
  get docxHelpers() {
    return DocxHelpers;
  }

  parseFromXml() {
    this.docx?.forEach((file) => {
      this.convertedXml[file.name] = this.parseXmlToJson(file.content);

      if (file.name === 'word/document.xml') {
        this.documentAttributes = this.convertedXml[file.name].elements[0]?.attributes;
      }

      if (file.name === 'word/styles.xml') {
        this.convertedXml[file.name] = addDefaultStylesIfMissing(this.convertedXml[file.name]);
      }
    });
    if (!this.convertedXml['word/styles.xml']) {
      for (let i = 1; i <= 5; i += 1) {
        if (this.convertedXml[`word/styles${i}.xml`] != null) {
          this.convertedXml['word/styles.xml'] = addDefaultStylesIfMissing(this.convertedXml[`word/styles${i}.xml`]);
          break;
        }
      }
    }
    this.initialJSON = this.convertedXml['word/document.xml'];

    if (!this.initialJSON) this.initialJSON = this.parseXmlToJson(this.xml);
    this.declaration = this.initialJSON?.declaration;

    // Only resolve existing GUIDs synchronously (no hash generation yet)
    this.resolveDocumentGuid();
  }

  /**
   * Parses XML content into JSON format while preserving whitespace-only text runs.
   *
   * This method wraps xml-js's xml2json parser with additional preprocessing to prevent
   * the parser from dropping whitespace-only content in <w:t> and <w:delText> elements.
   * This is critical for correctly handling documents that rely on document-level
   * xml:space="preserve" rather than per-element attributes, which is common in
   * PDF-to-DOCX converted documents.
   *
   * The whitespace preservation strategy:
   * 1. Before parsing, wraps whitespace-only content with [[sdspace]] placeholders
   * 2. xml-js parser preserves the placeholder-wrapped text
   * 3. During text node processing (t-translator.js), placeholders are removed
   *
   * @param {string} xml - The XML string to parse
   * @returns {Object} The parsed JSON representation of the XML document
   *
   * @example
   * // Handles whitespace-only text runs
   * const xml = '<w:t> </w:t>';
   * const result = parseXmlToJson(xml);
   * // Result preserves the space: { elements: [{ text: '[[sdspace]] [[sdspace]]' }] }
   *
   * @example
   * // Handles elements with attributes
   * const xml = '<w:t xml:space="preserve">  text  </w:t>';
   * const result = parseXmlToJson(xml);
   * // Preserves content and attributes
   *
   * @example
   * // Handles both w:t and w:delText elements
   * const xml = '<w:delText> </w:delText>';
   * const result = parseXmlToJson(xml);
   * // Preserves whitespace in deleted text
   */
  parseXmlToJson(xml) {
    // Preserve whitespace-only text runs so xml-js doesn't drop them during parsing.
    // This handles both <w:t> and <w:delText> elements, with or without attributes.
    // Documents may rely on document-level xml:space="preserve" rather than per-element attributes.
    const newXml = xml.replace(
      /(<w:(?:t|delText)(?:\s[^>]*)?>)(\s+)(<\/w:(?:t|delText)>)/g,
      '$1[[sdspace]]$2[[sdspace]]$3',
    );
    return JSON.parse(xmljs.xml2json(newXml, null, 2));
  }

  /**
   * Checks if an element name matches the expected local name, with or without namespace prefix.
   * This helper supports custom namespace prefixes in DOCX files (e.g., 'op:Properties', 'custom:property').
   *
   * @private
   * @static
   * @param {string|undefined|null} elementName - The element name to check (may include namespace prefix)
   * @param {string} expectedLocalName - The expected local name without prefix
   * @returns {boolean} True if the element name matches (with or without prefix)
   *
   * @example
   * // Exact match without prefix
   * _matchesElementName('Properties', 'Properties') // => true
   *
   * @example
   * // Match with namespace prefix
   * _matchesElementName('op:Properties', 'Properties') // => true
   * _matchesElementName('custom:property', 'property') // => true
   *
   * @example
   * // No match
   * _matchesElementName('SomeOtherElement', 'Properties') // => false
   * _matchesElementName(':Properties', 'Properties') // => false (empty prefix)
   */
  static _matchesElementName(elementName, expectedLocalName) {
    if (!elementName || typeof elementName !== 'string') return false;
    if (!expectedLocalName) return false;

    // Exact match without prefix
    if (elementName === expectedLocalName) return true;

    // Check if it ends with :expectedLocalName and has a non-empty prefix
    if (elementName.endsWith(`:${expectedLocalName}`)) {
      const prefix = elementName.slice(0, -(expectedLocalName.length + 1));
      return prefix.length > 0;
    }

    return false;
  }

  /**
   * Extracts the namespace prefix from an element name.
   *
   * @private
   * @static
   * @param {string} elementName - The element name (may include namespace prefix, e.g., 'op:Properties')
   * @returns {string} The namespace prefix (e.g., 'op') or empty string if no prefix
   *
   * @example
   * _extractNamespacePrefix('op:Properties') // => 'op'
   * _extractNamespacePrefix('Properties') // => ''
   * _extractNamespacePrefix('custom:property') // => 'custom'
   */
  static _extractNamespacePrefix(elementName) {
    if (!elementName || typeof elementName !== 'string') return '';
    const colonIndex = elementName.indexOf(':');
    return colonIndex > 0 ? elementName.slice(0, colonIndex) : '';
  }

  /**
   * Generic method to get a stored custom property from docx.
   * Supports both standard and custom namespace prefixes (e.g., 'op:Properties', 'custom:property').
   *
   * @static
   * @param {Array} docx - Array of docx file objects
   * @param {string} propertyName - Name of the property to retrieve
   * @returns {string|null} The property value or null if not found
   *
   * Returns null in the following cases:
   * - docx array is empty or doesn't contain 'docProps/custom.xml'
   * - custom.xml cannot be parsed
   * - Properties element is not found (with or without namespace prefix)
   * - Property with the specified name is not found
   * - Property has malformed structure (missing nested elements or text)
   * - Any error occurs during parsing or retrieval
   *
   * @example
   * // Standard property without namespace prefix
   * const version = SuperConverter.getStoredCustomProperty(docx, 'SuperdocVersion');
   * // => '1.2.3'
   *
   * @example
   * // Property with namespace prefix (e.g., from Office 365)
   * const guid = SuperConverter.getStoredCustomProperty(docx, 'DocumentGuid');
   * // Works with both 'Properties' and 'op:Properties' elements
   * // => 'abc-123-def-456'
   *
   * @example
   * // Non-existent property
   * const missing = SuperConverter.getStoredCustomProperty(docx, 'NonExistent');
   * // => null
   */
  static getStoredCustomProperty(docx, propertyName) {
    try {
      const customXml = docx.find((doc) => doc.name === 'docProps/custom.xml');
      if (!customXml) return null;

      const converter = new SuperConverter();
      const content = customXml.content;
      const contentJson = converter.parseXmlToJson(content);

      // Handle namespace prefixes (e.g., 'op:Properties' or 'Properties')
      const properties = contentJson?.elements?.find((el) => SuperConverter._matchesElementName(el.name, 'Properties'));
      if (!properties?.elements) return null;

      // Handle namespace prefixes for property element (e.g., 'op:property' or 'property')
      const property = properties.elements.find(
        (el) => SuperConverter._matchesElementName(el.name, 'property') && el.attributes?.name === propertyName,
      );
      if (!property) return null;

      // Add null safety for nested property structure
      if (!property.elements?.[0]?.elements?.[0]?.text) {
        console.warn(`Malformed property structure for "${propertyName}"`);
        return null;
      }

      return property.elements[0].elements[0].text;
    } catch (e) {
      console.warn(`Error getting custom property ${propertyName}:`, e);
      return null;
    }
  }

  /**
   * Generic method to set a stored custom property in docx.
   * Supports both standard and custom namespace prefixes (e.g., 'op:Properties', 'custom:property').
   *
   * @static
   * @param {Object} docx - The docx object to store the property in (converted XML structure)
   * @param {string} propertyName - Name of the property
   * @param {string|Function} value - Value or function that returns the value
   * @param {boolean} preserveExisting - If true, won't overwrite existing values
   * @returns {string|null} The stored value, or null if Properties element is not found
   *
   * @throws {Error} If an error occurs during property setting (logged as warning)
   *
   * @example
   * // Set a new property
   * const value = SuperConverter.setStoredCustomProperty(docx, 'MyProperty', 'MyValue');
   * // => 'MyValue'
   *
   * @example
   * // Set a property with a function
   * const guid = SuperConverter.setStoredCustomProperty(docx, 'DocumentGuid', () => uuidv4());
   * // => 'abc-123-def-456'
   *
   * @example
   * // Preserve existing value
   * SuperConverter.setStoredCustomProperty(docx, 'MyProperty', 'NewValue', true);
   * // => 'MyValue' (original value preserved)
   *
   * @example
   * // Works with namespace prefixes
   * // If docx has 'op:Properties' and 'op:property' elements, this will handle them correctly
   * const version = SuperConverter.setStoredCustomProperty(docx, 'Version', '2.0.0');
   * // => '2.0.0'
   */
  static setStoredCustomProperty(docx, propertyName, value, preserveExisting = false) {
    try {
      const customLocation = 'docProps/custom.xml';
      if (!docx[customLocation]) docx[customLocation] = generateCustomXml();

      const customXml = docx[customLocation];

      // Handle namespace prefixes (e.g., 'op:Properties' or 'Properties')
      const properties = customXml.elements?.find((el) => SuperConverter._matchesElementName(el.name, 'Properties'));
      if (!properties) return null;
      if (!properties.elements) properties.elements = [];

      // Extract namespace prefix from Properties element to use for new property elements
      const namespacePrefix = SuperConverter._extractNamespacePrefix(properties.name);
      const propertyElementName = namespacePrefix ? `${namespacePrefix}:property` : 'property';

      // Check if property already exists (handle namespace prefixes)
      let property = properties.elements.find(
        (el) => SuperConverter._matchesElementName(el.name, 'property') && el.attributes?.name === propertyName,
      );

      if (property && preserveExisting) {
        // Add null safety when returning existing value
        if (!property.elements?.[0]?.elements?.[0]?.text) {
          console.warn(`Malformed existing property structure for "${propertyName}"`);
          return null;
        }
        return property.elements[0].elements[0].text;
      }

      // Generate value if it's a function
      const finalValue = typeof value === 'function' ? value() : value;

      if (!property) {
        // Get next available pid
        const existingPids = properties.elements
          .filter((el) => el.attributes?.pid)
          .map((el) => parseInt(el.attributes.pid, 10)) // Add radix for clarity
          .filter(Number.isInteger); // Use isInteger instead of isFinite since PIDs should be integers
        const pid = existingPids.length > 0 ? Math.max(...existingPids) + 1 : 2;

        property = {
          type: 'element',
          name: propertyElementName,
          attributes: {
            name: propertyName,
            fmtid: '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}',
            pid,
          },
          elements: [
            {
              type: 'element',
              name: 'vt:lpwstr',
              elements: [
                {
                  type: 'text',
                  text: finalValue,
                },
              ],
            },
          ],
        };

        properties.elements.push(property);
      } else {
        // Normalize namespace prefix to match parent Properties element for consistency
        const existingPropertyPrefix = SuperConverter._extractNamespacePrefix(property.name);
        if (existingPropertyPrefix !== namespacePrefix) {
          property.name = propertyElementName;
        }

        // Add null safety when updating existing property
        if (!property.elements?.[0]?.elements?.[0]) {
          console.warn(`Malformed property structure for "${propertyName}", recreating structure`);
          property.elements = [
            {
              type: 'element',
              name: 'vt:lpwstr',
              elements: [
                {
                  type: 'text',
                  text: finalValue,
                },
              ],
            },
          ];
        } else {
          property.elements[0].elements[0].text = finalValue;
        }
      }

      return finalValue;
    } catch (e) {
      console.warn(`Error setting custom property ${propertyName}:`, e);
      return null;
    }
  }

  static getStoredSuperdocVersion(docx) {
    return SuperConverter.getStoredCustomProperty(docx, 'SuperdocVersion');
  }

  static setStoredSuperdocVersion(docx = this.convertedXml, version = __APP_VERSION__) {
    return SuperConverter.setStoredCustomProperty(docx, 'SuperdocVersion', version, false);
  }

  /**
   * Get document GUID from docx files (static method)
   * @static
   * @param {Array} docx - Array of docx file objects
   * @returns {string|null} The document GUID
   */
  static extractDocumentGuid(docx) {
    try {
      const settingsXml = docx.find((doc) => doc.name === 'word/settings.xml');
      if (!settingsXml) return null;

      // Parse XML properly instead of regex
      const converter = new SuperConverter();
      const settingsJson = converter.parseXmlToJson(settingsXml.content);

      // Navigate the parsed structure to find w15:docId
      const settings = settingsJson.elements?.[0];
      if (!settings) return null;

      const docIdElement = settings.elements?.find((el) => el.name === 'w15:docId');
      if (docIdElement?.attributes?.['w15:val']) {
        return docIdElement.attributes['w15:val'].replace(/[{}]/g, '');
      }
    } catch {
      // Continue to check custom property
    }

    // Then check custom property
    return SuperConverter.getStoredCustomProperty(docx, 'DocumentGuid');
  }

  /**
   * Get the permanent document GUID
   * @returns {string|null} The document GUID (only for modified documents)
   */
  getDocumentGuid() {
    return this.documentGuid;
  }

  /**
   * Get the SuperDoc version for this converter instance
   * @returns {string|null} The SuperDoc version or null if not available
   */
  getSuperdocVersion() {
    if (this.docx) {
      return SuperConverter.getStoredSuperdocVersion(this.docx);
    }
    return null;
  }

  /**
   * Resolve existing document GUID (synchronous)
   */
  resolveDocumentGuid() {
    // 1. Check Microsoft's docId (READ ONLY)
    const microsoftGuid = this.getMicrosoftDocId();
    if (microsoftGuid) {
      this.documentGuid = microsoftGuid;
      return;
    }

    // 2. Check our custom property
    const customGuid = SuperConverter.getStoredCustomProperty(this.docx, 'DocumentGuid');
    if (customGuid) {
      this.documentGuid = customGuid;
    }
    // Don't generate hash here - do it lazily when needed
  }

  /**
   * Get Microsoft's docId from settings.xml (READ ONLY)
   */
  getMicrosoftDocId() {
    this.getDocumentInternalId(); // Existing method
    if (this.documentInternalId) {
      return this.documentInternalId.replace(/[{}]/g, '');
    }
    return null;
  }

  /**
   * Generate document hash (async, lazy)
   */
  async #generateDocumentHash() {
    if (!this.fileSource) return `HASH-${Date.now()}`;

    try {
      let buffer;

      if (Buffer.isBuffer(this.fileSource)) {
        buffer = this.fileSource;
      } else if (this.fileSource instanceof ArrayBuffer) {
        buffer = Buffer.from(this.fileSource);
      } else if (this.fileSource instanceof Blob || this.fileSource instanceof File) {
        const arrayBuffer = await this.fileSource.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      } else {
        return `HASH-${Date.now()}`;
      }

      const hash = crc32(buffer);
      return `HASH-${hash.toString('hex').toUpperCase()}`;
    } catch (e) {
      console.warn('Could not generate document hash:', e);
      return `HASH-${Date.now()}`;
    }
  }

  /**
   * Get document identifier (GUID or hash) - async for lazy hash generation
   */
  async getDocumentIdentifier() {
    if (this.documentGuid) {
      return this.documentGuid;
    }

    if (!this.documentHash && this.fileSource) {
      this.documentHash = await this.#generateDocumentHash();
    }

    return this.documentHash;
  }

  /**
   * Promote from hash to GUID on first edit
   */
  promoteToGuid() {
    if (this.documentGuid) return this.documentGuid;

    this.documentGuid = this.getMicrosoftDocId() || uuidv4();
    this.documentModified = true;
    this.documentHash = null; // Clear temporary hash

    // Note: GUID is stored to custom properties during export to avoid
    // unnecessary XML modifications if the document is never saved
    return this.documentGuid;
  }

  getDocumentDefaultStyles() {
    const styles = this.convertedXml['word/styles.xml'];
    const styleRoot = styles?.elements?.[0];
    const styleElements = styleRoot?.elements || [];
    if (!styleElements.length) return {};

    const defaults = styleElements.find((el) => el.name === 'w:docDefaults');
    const normalStyle = styleElements.find((el) => el.name === 'w:style' && el.attributes?.['w:styleId'] === 'Normal');

    const defaultsState = {
      typeface: undefined,
      panose: undefined,
      fontSizePt: undefined,
      kern: undefined,
      fallbackSzTwips: undefined,
    };

    const docDefaultRun = defaults?.elements?.find((el) => el.name === 'w:rPrDefault');
    const docDefaultProps = docDefaultRun?.elements?.find((el) => el.name === 'w:rPr') ?? docDefaultRun;
    collectRunDefaultProperties(docDefaultProps, {
      allowOverrideTypeface: true,
      allowOverrideSize: true,
      themeResolver: (theme) => this.getThemeInfo(theme),
      state: defaultsState,
    });

    const normalRunProps = normalStyle?.elements?.find((el) => el.name === 'w:rPr') ?? null;
    collectRunDefaultProperties(normalRunProps, {
      allowOverrideTypeface: true,
      allowOverrideSize: true,
      themeResolver: (theme) => this.getThemeInfo(theme),
      state: defaultsState,
    });

    if (defaultsState.fontSizePt === undefined) {
      if (Number.isFinite(defaultsState.fallbackSzTwips)) defaultsState.fontSizePt = defaultsState.fallbackSzTwips / 2;
      else defaultsState.fontSizePt = DEFAULT_FONT_SIZE_PT;
    }

    const fontFamilyCss = defaultsState.typeface
      ? SuperConverter.toCssFontFamily(defaultsState.typeface, this.convertedXml)
      : undefined;

    const result = {};
    if (defaultsState.fontSizePt !== undefined) result.fontSizePt = defaultsState.fontSizePt;
    if (defaultsState.kern !== undefined) result.kern = defaultsState.kern;
    if (defaultsState.typeface) result.typeface = defaultsState.typeface;
    if (defaultsState.panose) result.panose = defaultsState.panose;
    if (fontFamilyCss) result.fontFamilyCss = fontFamilyCss;

    return result;
  }

  getDocumentFonts() {
    const inlineDocumentFonts = [...new Set(this.inlineDocumentFonts || [])];
    const defaults = this.getDocumentDefaultStyles?.() || {};
    const defaultTypeface = typeof defaults.typeface === 'string' ? defaults.typeface : null;
    const defaultFontFamilyCss = typeof defaults.fontFamilyCss === 'string' ? defaults.fontFamilyCss : null;
    const fallbackFont =
      defaultTypeface ||
      (defaultFontFamilyCss ? defaultFontFamilyCss.split(',')[0]?.replace(/["']/g, '').trim() : null);
    const withDefaultFont = (fonts) => {
      const result = [...fonts];
      if (fallbackFont && !result.includes(fallbackFont)) result.push(fallbackFont);
      return result;
    };
    const fontTable = this.convertedXml['word/fontTable.xml'];
    if (!fontTable) {
      return withDefaultFont(inlineDocumentFonts);
    }

    const wFonts = fontTable.elements?.find((element) => element.name === 'w:fonts');
    if (!wFonts) {
      return withDefaultFont(inlineDocumentFonts);
    }

    if (!wFonts.elements) {
      return withDefaultFont(inlineDocumentFonts);
    }

    const fontsInFontTable = wFonts.elements
      .filter((element) => element.name === 'w:font')
      .map((element) => element.attributes['w:name']);

    const allFonts = [...inlineDocumentFonts, ...fontsInFontTable];
    return withDefaultFont([...new Set(allFonts)]);
  }

  getFontFaceImportString() {
    const fontTable = this.convertedXml['word/fontTable.xml'];
    if (!fontTable || !Object.keys(this.fonts).length) return;

    const fonts = fontTable.elements.find((el) => el.name === 'w:fonts');
    const embededFonts = fonts?.elements.filter((el) =>
      el.elements?.some((nested) => nested?.attributes && nested.attributes['r:id'] && nested.attributes['w:fontKey']),
    );
    const fontsToInclude = embededFonts?.reduce((acc, cur) => {
      const embedElements = cur.elements
        .filter((el) => el.name.startsWith('w:embed'))
        ?.map((el) => ({ ...el, fontFamily: cur.attributes['w:name'] }));
      return [...acc, ...embedElements];
    }, []);

    const rels = this.convertedXml['word/_rels/fontTable.xml.rels'];
    const relationships = rels?.elements.find((el) => el.name === 'Relationships') || {};
    const { elements } = relationships;

    const fontsImported = [];
    let styleString = '';
    for (const font of fontsToInclude) {
      const filePath = elements.find((el) => el.attributes.Id === font.attributes['r:id'])?.attributes?.Target;
      if (!filePath) return;

      const fontUint8Array = this.fonts[`word/${filePath}`];
      const fontBuffer = fontUint8Array?.buffer;
      if (!fontBuffer) return;

      const ttfBuffer = deobfuscateFont(fontBuffer, font.attributes['w:fontKey']);
      if (!ttfBuffer) return;

      // Convert to a blob and inject @font-face
      const blob = new Blob([ttfBuffer], { type: 'font/ttf' });
      const fontUrl = URL.createObjectURL(blob);
      const isNormal = font.name.includes('Regular');
      const isBold = font.name.includes('Bold');
      const isItalic = font.name.includes('Italic');
      const isLight = font.name.includes('Light');
      const fontWeight = isNormal ? 'normal' : isBold ? 'bold' : isLight ? '200' : 'normal';

      if (!fontsImported.includes(font.fontFamily)) {
        fontsImported.push(font.fontFamily);
      }

      styleString += `
        @font-face {
          font-style: ${isItalic ? 'italic' : 'normal'};
          font-weight: ${fontWeight};
          font-display: swap;
          font-family: ${font.fontFamily};
          src: url(${fontUrl}) format('truetype');
        }
      `;
    }

    return {
      styleString,
      fontsImported,
    };
  }

  getDocumentInternalId() {
    const settingsLocation = 'word/settings.xml';
    if (!this.convertedXml[settingsLocation]) {
      // Don't create settings if it doesn't exist during read
      return;
    }

    const settings = this.convertedXml[settingsLocation];
    if (!settings.elements?.[0]?.elements?.length) {
      return;
    }

    // Look for existing w15:docId only
    const w15DocId = settings.elements[0].elements.find((el) => el.name === 'w15:docId');
    this.documentInternalId = w15DocId?.attributes?.['w15:val'];
  }

  createDocumentIdElement() {
    // This should only be called when WRITING, never when reading
    const docId = uuidv4().toUpperCase();
    this.documentInternalId = docId;

    return {
      type: 'element',
      name: 'w15:docId',
      attributes: {
        'w15:val': `{${docId}}`,
      },
    };
  }

  getThemeInfo(themeName) {
    themeName = themeName.toLowerCase();
    const theme1 = this.convertedXml['word/theme/theme1.xml'];
    if (!theme1) return {};
    const themeData = theme1.elements.find((el) => el.name === 'a:theme');
    const themeElements = themeData.elements.find((el) => el.name === 'a:themeElements');
    const fontScheme = themeElements.elements.find((el) => el.name === 'a:fontScheme');
    let fonts;

    if (themeName.startsWith('major')) {
      fonts = fontScheme.elements.find((el) => el.name === 'a:majorFont').elements[0];
    } else if (themeName.startsWith('minor')) {
      fonts = fontScheme.elements.find((el) => el.name === 'a:minorFont').elements[0];
    }

    const { typeface, panose } = fonts.attributes;
    return { typeface, panose };
  }

  getSchema(editor) {
    let result;
    try {
      this.getDocumentInternalId();
      if (!this.convertedXml.media) {
        this.convertedXml.media = this.media;
      }
      result = createDocumentJson(this.convertedXml, this, editor);
    } catch (error) {
      editor?.emit('exception', { error, editor });
    }

    if (result) {
      this.savedTagsToRestore.push({ ...result.savedTagsToRestore });
      this.pageStyles = result.pageStyles;
      this.numbering = result.numbering;
      this.comments = result.comments;
      this.footnotes = result.footnotes;
      this.linkedStyles = result.linkedStyles;
      this.translatedLinkedStyles = result.translatedLinkedStyles;
      this.translatedNumbering = result.translatedNumbering;
      this.inlineDocumentFonts = result.inlineDocumentFonts;
      this.themeColors = result.themeColors ?? null;

      return result.pmDoc;
    } else {
      return null;
    }
  }

  schemaToXml(data, debug = false) {
    const exporter = new DocxExporter(this);
    return exporter.schemaToXml(data, debug);
  }

  async exportToDocx(
    jsonData,
    editorSchema,
    documentMedia,
    isFinalDoc = false,
    commentsExportType,
    comments = [],
    editor,
    exportJsonOnly = false,
    fieldsHighlightColor,
  ) {
    // Filter out synthetic tracked change comments - they shouldn't be exported to comments.xml
    const exportableComments = comments.filter((c) => !c.trackedChange);
    const commentsWithParaIds = exportableComments.map((c) => prepareCommentParaIds(c));
    const commentDefinitions = commentsWithParaIds.map((c, index) =>
      getCommentDefinition(c, index, commentsWithParaIds, editor),
    );

    const { result, params } = this.exportToXmlJson({
      data: jsonData,
      editorSchema,
      comments: exportableComments,
      commentDefinitions,
      commentsExportType,
      isFinalDoc,
      editor,
      fieldsHighlightColor,
    });

    if (exportJsonOnly) return result;

    const exporter = new DocxExporter(this);
    const xml = exporter.schemaToXml(result);

    const {
      updatedXml: footnotesUpdatedXml,
      relationships: footnotesRels,
      media: footnotesMedia,
    } = prepareFootnotesXmlForExport({
      footnotes: this.footnotes,
      editor,
      converter: this,
      convertedXml: this.convertedXml,
    });
    this.convertedXml = { ...this.convertedXml, ...footnotesUpdatedXml };

    // Update media
    await this.#exportProcessMediaFiles(
      {
        ...documentMedia,
        ...params.media,
        ...footnotesMedia,
        ...this.media,
      },
      editor,
    );

    // Update content types and comments files as needed
    let updatedXml = { ...this.convertedXml };
    let commentsRels = [];
    if (comments.length) {
      const { documentXml, relationships } = this.#prepareCommentsXmlFilesForExport({
        defs: params.exportedCommentDefs,
        exportType: commentsExportType,
        commentsWithParaIds,
      });
      updatedXml = { ...documentXml };
      commentsRels = relationships;
    }

    this.convertedXml = { ...this.convertedXml, ...updatedXml };

    const headFootRels = this.#exportProcessHeadersFooters({ isFinalDoc });

    // Update the rels table
    this.#exportProcessNewRelationships([...params.relationships, ...commentsRels, ...footnotesRels, ...headFootRels]);

    // Store SuperDoc version
    SuperConverter.setStoredSuperdocVersion(this.convertedXml);

    // Store document GUID if document was modified
    if (this.documentModified || this.documentGuid) {
      if (!this.documentGuid) {
        this.documentGuid = this.getMicrosoftDocId() || uuidv4();
      }

      // Always store in custom.xml (never modify settings.xml)
      SuperConverter.setStoredCustomProperty(this.convertedXml, 'DocumentGuid', this.documentGuid, true);
    }

    // Update the numbering.xml
    this.#exportNumberingFile(params);

    return xml;
  }

  exportToXmlJson({
    data,
    editorSchema,
    comments,
    commentDefinitions,
    commentsExportType = 'clean',
    isFinalDoc = false,
    editor,
    isHeaderFooter = false,
    fieldsHighlightColor = null,
  }) {
    const bodyNode = this.savedTagsToRestore.find((el) => el.name === 'w:body');

    const [result, params] = exportSchemaToJson({
      node: data,
      bodyNode,
      relationships: [],
      documentMedia: {},
      media: {},
      isFinalDoc,
      editorSchema,
      converter: this,
      pageStyles: this.pageStyles,
      comments,
      commentsExportType,
      exportedCommentDefs: commentDefinitions,
      editor,
      isHeaderFooter,
      fieldsHighlightColor,
    });

    return { result, params };
  }

  #exportNumberingFile() {
    const numberingPath = 'word/numbering.xml';
    let numberingXml = this.convertedXml[numberingPath];

    const newNumbering = this.numbering;

    if (!numberingXml) numberingXml = baseNumbering;
    const currentNumberingXml = numberingXml.elements[0];

    const newAbstracts = Object.values(newNumbering.abstracts).map((entry) => entry);
    const newNumDefs = Object.values(newNumbering.definitions).map((entry) => entry);
    currentNumberingXml.elements = [...newAbstracts, ...newNumDefs];

    // Update the numbering file
    this.convertedXml[numberingPath] = numberingXml;
  }

  /**
   * Update comments files and relationships depending on export type
   */
  #prepareCommentsXmlFilesForExport({ defs, exportType, commentsWithParaIds }) {
    const { documentXml, relationships } = prepareCommentsXmlFilesForExport({
      exportType,
      convertedXml: this.convertedXml,
      defs,
      commentsWithParaIds,
      threadingProfile: this.commentThreadingProfile,
    });

    return { documentXml, relationships };
  }

  #exportProcessHeadersFooters({ isFinalDoc = false }) {
    const relsData = this.convertedXml['word/_rels/document.xml.rels'];
    const relationships = relsData.elements.find((x) => x.name === 'Relationships');
    const newDocRels = [];

    Object.entries(this.headers).forEach(([id, header], index) => {
      const fileName =
        relationships.elements.find((el) => el.attributes.Id === id)?.attributes.Target || `header${index + 1}.xml`;
      const headerEditor = this.headerEditors.find((item) => item.id === id);

      if (!headerEditor) return;

      const { result, params } = this.exportToXmlJson({
        data: header,
        editor: headerEditor.editor,
        editorSchema: headerEditor.editor.schema,
        comments: [],
        commentDefinitions: [],
        isHeaderFooter: true,
        isFinalDoc,
      });

      const bodyContent = result.elements[0].elements;
      const file = this.convertedXml[`word/${fileName}`];

      if (!file) {
        this.convertedXml[`word/${fileName}`] = {
          declaration: this.initialJSON?.declaration,
          elements: [
            {
              attributes: DEFAULT_DOCX_DEFS,
              name: 'w:hdr',
              type: 'element',
              elements: [],
            },
          ],
        };
        newDocRels.push({
          type: 'element',
          name: 'Relationship',
          attributes: {
            Id: id,
            Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
            Target: fileName,
          },
        });
      }

      this.convertedXml[`word/${fileName}`].elements[0].elements = bodyContent;

      if (params.relationships.length) {
        const relationships =
          this.convertedXml[`word/_rels/${fileName}.rels`]?.elements?.find((x) => x.name === 'Relationships')
            ?.elements || [];
        this.convertedXml[`word/_rels/${fileName}.rels`] = {
          declaration: this.initialJSON?.declaration,
          elements: [
            {
              name: 'Relationships',
              attributes: {
                xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships',
              },
              elements: [...relationships, ...params.relationships],
            },
          ],
        };
      }
    });

    Object.entries(this.footers).forEach(([id, footer], index) => {
      const fileName =
        relationships.elements.find((el) => el.attributes.Id === id)?.attributes.Target || `footer${index + 1}.xml`;
      const footerEditor = this.footerEditors.find((item) => item.id === id);

      if (!footerEditor) return;

      const { result, params } = this.exportToXmlJson({
        data: footer,
        editor: footerEditor.editor,
        editorSchema: footerEditor.editor.schema,
        comments: [],
        commentDefinitions: [],
        isHeaderFooter: true,
        isFinalDoc,
      });

      const bodyContent = result.elements[0].elements;
      const file = this.convertedXml[`word/${fileName}`];

      if (!file) {
        this.convertedXml[`word/${fileName}`] = {
          declaration: this.initialJSON?.declaration,
          elements: [
            {
              attributes: DEFAULT_DOCX_DEFS,
              name: 'w:ftr',
              type: 'element',
              elements: [],
            },
          ],
        };
        newDocRels.push({
          type: 'element',
          name: 'Relationship',
          attributes: {
            Id: id,
            Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
            Target: fileName,
          },
        });
      }

      this.convertedXml[`word/${fileName}`].elements[0].elements = bodyContent;

      if (params.relationships.length) {
        const relationships =
          this.convertedXml[`word/_rels/${fileName}.rels`]?.elements?.find((x) => x.name === 'Relationships')
            ?.elements || [];
        this.convertedXml[`word/_rels/${fileName}.rels`] = {
          declaration: this.initialJSON?.declaration,
          elements: [
            {
              name: 'Relationships',
              attributes: {
                xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships',
              },
              elements: [...relationships, ...params.relationships],
            },
          ],
        };
      }
    });

    return newDocRels;
  }

  #exportProcessNewRelationships(rels = []) {
    const relsData = this.convertedXml['word/_rels/document.xml.rels'];
    const relationships = relsData.elements.find((x) => x.name === 'Relationships');

    relationships.elements = mergeRelationshipElements(relationships.elements, rels);
  }

  async #exportProcessMediaFiles(media = {}) {
    const processedData = {
      ...(this.convertedXml.media || {}),
    };

    for (const [filePath, value] of Object.entries(media)) {
      if (value == null) continue;
      processedData[filePath] = await getArrayBufferFromUrl(value);
    }

    this.convertedXml.media = processedData;
    this.media = this.convertedXml.media;
    this.addedMedia = {
      ...processedData,
    };
  }

  /**
   * Creates a default empty header for the specified variant.
   *
   * This method programmatically creates a new header section with an empty ProseMirror
   * document. The header is added to the converter's data structures and will be included
   * in subsequent DOCX exports.
   *
   * @param {('default' | 'first' | 'even' | 'odd')} variant - The header variant to create
   * @returns {string} The relationship ID of the created header
   *
   * @throws {Error} If variant is invalid or header already exists for this variant
   *
   * @example
   * ```javascript
   * const headerId = converter.createDefaultHeader('default');
   * // headerId: 'rId-header-default'
   * // converter.headers['rId-header-default'] contains empty PM doc
   * // converter.headerIds.default === 'rId-header-default'
   * ```
   */
  createDefaultHeader(variant = 'default') {
    // Validate variant type
    if (typeof variant !== 'string') {
      throw new TypeError(`variant must be a string, received ${typeof variant}`);
    }

    // Validate variant value
    const validVariants = ['default', 'first', 'even', 'odd'];
    if (!validVariants.includes(variant)) {
      throw new Error(`Invalid header variant: ${variant}. Must be one of: ${validVariants.join(', ')}`);
    }

    // Check if header already exists for this variant
    if (this.headerIds[variant]) {
      console.warn(`[SuperConverter] Header already exists for variant '${variant}': ${this.headerIds[variant]}`);
      return this.headerIds[variant];
    }

    // Generate relationship ID
    const rId = `rId-header-${variant}`;

    // Create empty ProseMirror document
    const emptyDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [],
        },
      ],
    };

    // Add to headers map
    this.headers[rId] = emptyDoc;

    // Update headerIds for the variant
    this.headerIds[variant] = rId;

    // Add to ids array if it exists
    if (!this.headerIds.ids) {
      this.headerIds.ids = [];
    }
    if (!this.headerIds.ids.includes(rId)) {
      this.headerIds.ids.push(rId);
    }

    this.headerFooterModified = true;
    // Mark document as modified
    this.documentModified = true;

    return rId;
  }

  /**
   * Creates a default empty footer for the specified variant.
   *
   * This method programmatically creates a new footer section with an empty ProseMirror
   * document. The footer is added to the converter's data structures and will be included
   * in subsequent DOCX exports.
   *
   * @param {('default' | 'first' | 'even' | 'odd')} variant - The footer variant to create
   * @returns {string} The relationship ID of the created footer
   *
   * @throws {Error} If variant is invalid or footer already exists for this variant
   *
   * @example
   * ```javascript
   * const footerId = converter.createDefaultFooter('default');
   * // footerId: 'rId-footer-default'
   * // converter.footers['rId-footer-default'] contains empty PM doc
   * // converter.footerIds.default === 'rId-footer-default'
   * ```
   */
  createDefaultFooter(variant = 'default') {
    // Validate variant type
    if (typeof variant !== 'string') {
      throw new TypeError(`variant must be a string, received ${typeof variant}`);
    }

    // Validate variant value
    const validVariants = ['default', 'first', 'even', 'odd'];
    if (!validVariants.includes(variant)) {
      throw new Error(`Invalid footer variant: ${variant}. Must be one of: ${validVariants.join(', ')}`);
    }

    // Check if footer already exists for this variant
    if (this.footerIds[variant]) {
      console.warn(`[SuperConverter] Footer already exists for variant '${variant}': ${this.footerIds[variant]}`);
      return this.footerIds[variant];
    }

    // Generate relationship ID
    const rId = `rId-footer-${variant}`;

    // Create empty ProseMirror document
    const emptyDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [],
        },
      ],
    };

    // Add to footers map
    this.footers[rId] = emptyDoc;

    // Update footerIds for the variant
    this.footerIds[variant] = rId;

    // Add to ids array if it exists
    if (!this.footerIds.ids) {
      this.footerIds.ids = [];
    }
    if (!this.footerIds.ids.includes(rId)) {
      this.footerIds.ids.push(rId);
    }

    this.headerFooterModified = true;
    // Mark document as modified
    this.documentModified = true;

    return rId;
  }

  // Deprecated methods for backward compatibility
  static getStoredSuperdocId(docx) {
    console.warn('getStoredSuperdocId is deprecated, use getDocumentGuid instead');
    return SuperConverter.extractDocumentGuid(docx);
  }

  static updateDocumentVersion(docx, version) {
    console.warn('updateDocumentVersion is deprecated, use setStoredSuperdocVersion instead');
    return SuperConverter.setStoredSuperdocVersion(docx, version);
  }
}

function generateCustomXml() {
  return DEFAULT_CUSTOM_XML;
}

export { SuperConverter };
