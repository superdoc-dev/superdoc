export class SuperConverter {
  static allowedElements: Readonly<{
    'w:document': 'doc';
    'w:body': 'body';
    'w:p': 'paragraph';
    'w:r': 'run';
    'w:t': 'text';
    'w:delText': 'text';
    'w:br': 'lineBreak';
    'w:tbl': 'table';
    'w:tr': 'tableRow';
    'w:tc': 'tableCell';
    'w:drawing': 'drawing';
    'w:bookmarkStart': 'bookmarkStart';
    'w:sectPr': 'sectionProperties';
    'w:rPr': 'runProperties';
    'w:commentRangeStart': 'commentRangeStart';
    'w:commentRangeEnd': 'commentRangeEnd';
    'w:commentReference': 'commentReference';
  }>;
  static markTypes: (
    | {
        name: string;
        type: string;
        property: string;
        mark?: undefined;
      }
    | {
        name: string;
        type: string;
        property?: undefined;
        mark?: undefined;
      }
    | {
        name: string;
        type: string;
        mark: string;
        property: string;
      }
  )[];
  static propertyTypes: Readonly<{
    'w:pPr': 'paragraphProperties';
    'w:rPr': 'runProperties';
    'w:sectPr': 'sectionProperties';
    'w:numPr': 'numberingProperties';
    'w:tcPr': 'tableCellProperties';
  }>;
  static elements: Set<string>;
  static getFontTableEntry(docx: any, fontName: any): any;
  static getFallbackFromFontTable(docx: any, fontName: any): any;
  static toCssFontFamily(fontName: any, docx: any): any;
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
  private static _matchesElementName;
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
  private static _extractNamespacePrefix;
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
  static getStoredCustomProperty(docx: any[], propertyName: string): string | null;
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
  static setStoredCustomProperty(
    docx: any,
    propertyName: string,
    value: string | Function,
    preserveExisting?: boolean,
  ): string | null;
  static getStoredSuperdocVersion(docx: any): string;
  static setStoredSuperdocVersion(docx?: any, version?: any): string;
  /**
   * Generate a Word-compatible timestamp (truncated to minute precision like MS Word)
   * @returns {string} Timestamp in YYYY-MM-DDTHH:MM:00Z format
   */
  static generateWordTimestamp(): string;
  /**
   * Get document GUID from docx files (static method)
   * @static
   * @param {Array} docx - Array of docx file objects
   * @returns {string|null} The document GUID
   */
  static extractDocumentGuid(docx: any[]): string | null;
  static getStoredSuperdocId(docx: any): string;
  static updateDocumentVersion(docx: any, version: any): string;
  constructor(params?: any);
  /** @type {StylesDocumentProperties} */
  translatedLinkedStyles: StylesDocumentProperties;
  /** @type {import('./types').Numbering} */
  numbering: import('./types').Numbering;
  /** @type {import('./types').Numbering} */
  translatedNumbering: import('./types').Numbering;
  /** @type {Record<string, import('xml-js').Element>} */
  convertedXml: Record<string, import('xml-js').Element>;
  debug: any;
  domEnvironment: {
    mockWindow: any;
    mockDocument: any;
  };
  declaration: any;
  documentAttributes: xmljs.Attributes;
  docx: any;
  media: any;
  fonts: any;
  addedMedia: {};
  comments: any[];
  footnotes: any[];
  footnoteProperties: any;
  inlineDocumentFonts: any[];
  commentThreadingProfile: any;
  docHiglightColors: Set<any>;
  xml: any;
  pageStyles: any;
  themeColors: {};
  initialJSON: any;
  headers: {};
  headerIds: {
    default: any;
    even: any;
    odd: any;
    first: any;
  };
  headerEditors: any[];
  footers: {};
  footerIds: {
    default: any;
    even: any;
    odd: any;
    first: any;
  };
  footerEditors: any[];
  importedBodyHasHeaderRef: boolean;
  importedBodyHasFooterRef: boolean;
  headerFooterModified: boolean;
  linkedStyles: any[];
  json: any;
  tagsNotInSchema: string[];
  savedTagsToRestore: any[];
  documentInternalId: any;
  fileSource: any;
  documentId: any;
  documentGuid: any;
  documentUniqueIdentifier: string;
  documentModified: boolean;
  isBlankDoc: any;
  /**
   * Get the DocxHelpers object that contains utility functions for working with docx files.
   * @returns {import('./docx-helpers/docx-helpers.js').DocxHelpers} The DocxHelpers object.
   */
  get docxHelpers(): any;
  parseFromXml(): void;
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
  parseXmlToJson(xml: string): any;
  /**
   * Get the dcterms:created timestamp from the already-parsed core.xml
   * @returns {string|null} The created timestamp in ISO format, or null if not found
   */
  getDocumentCreatedTimestamp(): string | null;
  /**
   * Set the dcterms:created timestamp in the already-parsed core.xml
   * @param {string} timestamp - The timestamp to set (ISO format)
   */
  setDocumentCreatedTimestamp(timestamp: string): void;
  /**
   * Get the permanent document GUID
   * @returns {string|null} The document GUID (only for modified documents)
   */
  getDocumentGuid(): string | null;
  /**
   * Get the SuperDoc version for this converter instance
   * @returns {string|null} The SuperDoc version or null if not available
   */
  getSuperdocVersion(): string | null;
  /**
   * Resolve existing document GUID (synchronous)
   * For new files: reads existing GUID and sets fresh timestamp
   * For imported files: reads existing GUIDs only
   */
  resolveDocumentGuid(): void;
  /**
   * Get Microsoft's docId from settings.xml (READ ONLY)
   */
  getMicrosoftDocId(): any;
  /**
   * Get document unique identifier (async)
   *
   * For blank documents (isBlankDoc: true):
   * - GUID and timestamp already set in resolveDocumentGuid()
   * - Returns identifierHash(guid|timestamp)
   *
   * For imported files (isBlankDoc: false):
   * - If both documentGuid and dcterms:created exist: returns identifierHash
   * - Otherwise: returns contentHash and generates missing metadata for future exports
   *
   * @returns {Promise<string>} Document unique identifier
   */
  getDocumentIdentifier(): Promise<string>;
  /**
   * Promote to GUID on first edit (for documents that didn't have one)
   */
  promoteToGuid(): any;
  /**
   * @return {Record<string,any>}
   */
  getDocumentDefaultStyles(): Record<string, any>;
  getDocumentFonts(): any[];
  getFontFaceImportString(): {
    styleString: string;
    fontsImported: any[];
  };
  getDocumentInternalId(): void;
  createDocumentIdElement(): {
    type: string;
    name: string;
    attributes: {
      'w15:val': string;
    };
  };
  getThemeInfo(themeName: any):
    | {
        typeface?: undefined;
        panose?: undefined;
      }
    | {
        typeface: string | number;
        panose: string | number;
      };
  getSchema(editor: any): {
    type: string;
    content: any[];
    attrs: {
      bodySectPr?: any;
      attributes: any;
    };
  };
  schemaToXml(data: any, debug?: boolean): string;
  exportToDocx(
    jsonData: any,
    editorSchema: any,
    documentMedia: any,
    isFinalDoc: boolean,
    commentsExportType: any,
    comments: any[],
    editor: any,
    exportJsonOnly: boolean,
    fieldsHighlightColor: any,
  ): Promise<string | import('./v2/types').OpenXmlNode>;
  exportToXmlJson({
    data,
    editorSchema,
    comments,
    commentDefinitions,
    commentsExportType,
    isFinalDoc,
    editor,
    isHeaderFooter,
    fieldsHighlightColor,
  }: {
    data: any;
    editorSchema: any;
    comments: any;
    commentDefinitions: any;
    commentsExportType?: string;
    isFinalDoc?: boolean;
    editor: any;
    isHeaderFooter?: boolean;
    fieldsHighlightColor?: any;
  }): {
    result: import('./v2/types').OpenXmlNode;
    params: import('./exporter').ExportParams;
  };
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
  createDefaultHeader(variant?: 'default' | 'first' | 'even' | 'odd'): string;
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
  createDefaultFooter(variant?: 'default' | 'first' | 'even' | 'odd'): string;
  #private;
}
import * as xmljs from 'xml-js';
//# sourceMappingURL=SuperConverter.d.ts.map
