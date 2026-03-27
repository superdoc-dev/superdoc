/** Key used to store the numbering cache on the docx container. */
export const NUMBERING_CACHE_KEY: 'numbering-cache';
/** Symbol used to memoize level lookups on abstract numbering elements. */
export const LEVELS_MAP_KEY: unique symbol;
export function buildNumberingCache(docx: DocxPackage | null | undefined): NumberingCache;
export function ensureNumberingCache(docx: DocxPackage | null | undefined, converter?: any): NumberingCache;
export function getNumberingCache(converterOrDocx: any): NumberingCache;
export type DocxXmlElement = {
  name?: string;
  attributes?: Record<string, unknown>;
  elements?: DocxXmlElement[];
};
export type DocxPackage = Record<
  string,
  {
    elements?: DocxXmlElement[];
  }
>;
export type NumberingCache = {
  /**
   * Maps w:numId values to their abstract numbering ids.
   */
  numToAbstractId: Map<string, string>;
  /**
   * Stores abstract numbering definitions by id.
   */
  abstractById: Map<string, DocxXmlElement>;
  /**
   * Stores abstract numbering definitions keyed by the template value.
   */
  templateById: Map<string, DocxXmlElement>;
  /**
   * Maps w:numId to their resolved abstract numbering element.
   */
  numToDefinition: Map<string, DocxXmlElement>;
  /**
   * Stores the raw w:num nodes by id for quick lookup.
   */
  numNodesById: Map<string, DocxXmlElement>;
};
//# sourceMappingURL=numberingCache.d.ts.map
