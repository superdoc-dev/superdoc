/**
 * Checks if the given node is a list or not.
 *
 * @param {XmlNode} node The node to check.
 * @returns {boolean} Whether the node is a list or not.
 */
export function testForList(node: XmlNode, docx: any): boolean;
/**
 * Get the style tag from the style ID
 *
 * @param {string} styleId The style ID to search for
 * @param {Object} docx The docx data
 * @returns {Object} The style tag
 */
export function getStyleTagFromStyleId(styleId: string, docx: any): any;
/**
 * Get the num ID from the style definition
 * This is a recursive function that will check the style definition for the numId
 * If it doesn't exist, it will check the basedOn style definition for the numId
 * This will continue until we find a numId or we run out of basedOn styles
 *
 * @param {Object} node The node to check
 * @param {string} styleId The style ID to check
 * @param {Object} docx The docx data
 * @param {Set} seenStyleIds The set of style IDs we've already seen to avoid circular references
 * @returns {string|null} The numId or null if not found
 */
export function getNumPrRecursive({ node, styleId, docx, seenStyleIds }: any): string | null;
/**
 * Normalize the level text character to a standard format
 * @param {string} lvlText The level text to normalize
 * @returns {string} The normalized level text
 */
export function normalizeLvlTextChar(lvlText: string): string;
/**
 * Main function to get list item information from numbering.xml
 *
 * @param {object} attributes
 * @param {int} level
 * @param {ParsedDocx} docx
 * @returns
 */
export function getNodeNumberingDefinition(
  item: any,
  level: int,
  docx: ParsedDocx,
):
  | {
      listType?: undefined;
      listOrderingType?: undefined;
      listrPrs?: undefined;
      listpPrs?: undefined;
      start?: undefined;
      lvlText?: undefined;
      lvlJc?: undefined;
      customFormat?: undefined;
    }
  | {
      listType: string;
      listOrderingType: any;
      listrPrs: {};
      listpPrs: {
        indent: {};
        justify: {
          val: any;
        };
        tabStops: any[];
      };
      start: any;
      lvlText: any;
      lvlJc: any;
      customFormat: any;
    };
export function getNodeNumberingDefinitionByStyle(
  item: any,
  docx: any,
):
  | {
      definition?: undefined;
      ilvl?: undefined;
    }
  | {
      definition:
        | {
            listType?: undefined;
            listOrderingType?: undefined;
            listrPrs?: undefined;
            listpPrs?: undefined;
            start?: undefined;
            lvlText?: undefined;
            lvlJc?: undefined;
            customFormat?: undefined;
          }
        | {
            listType: string;
            listOrderingType: any;
            listrPrs: {};
            listpPrs: {
              indent: {};
              justify: {
                val: any;
              };
              tabStops: any[];
            };
            start: any;
            lvlText: any;
            lvlJc: any;
            customFormat: any;
          };
      ilvl: number;
    };
export function getDefinitionForLevel(data: any, level: any): any;
export function parseIndentElement(indElem: any): {};
export function combineIndents(ind1: any, ind2: any): {};
/**
 * @type {import("docxImporter").NodeHandler}
 */
export const handleListNode: any;
/**
 * @type {import("docxImporter").NodeHandlerEntry}
 */
export const listHandlerEntity: any;
export function getAbstractDefinition(
  numId: any,
  docx: any,
  converter: any,
): import('./numberingCache.js').DocxXmlElement;
export function generateListPath(level: any, numId: any, styleId: any, levels: any, docx: any): any[];
export function getListLevelDefinitionTag(numId: string, level: string, pStyleId: any, docx: any): any;
export namespace docxNumberingHelpers {
  export { getListLevelDefinitionTag };
  export { combineIndents };
  export { parseIndentElement };
  export { generateListPath };
  export { normalizeLvlTextChar };
}
//# sourceMappingURL=listImporter.d.ts.map
