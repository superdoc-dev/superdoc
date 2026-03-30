/**
 * @typedef {Object} NodeHandlerParams
 * @property {Array} nodes - The array of nodes to process.
 * @property {Object} docx - The parsed DOCX object.
 * @property {Object} [numbering] - Numbering definitions extracted from numbering.xml.
 * @property {Record<string, any>} [numbering.definitions] - Numbering mappings keyed by numId.
 * @property {Record<string, any>} [numbering.abstracts] - Abstract numbering templates keyed by abstractNumberId.
 * @property {boolean} insideTrackChange - Indicates if the processing is inside a track change.
 * @property {NodeListHandler} nodeListHandler - The node list handler.
 * @property {Object} converter - The converter object.
 * @property {Object} numbering - The numbering object containing numbering definitions.
 * @property {import('../../../../Editor').Editor} editor - The editor object.
 * @property {string} [filename] - The name of the file being processed.
 * @property {string} [parentStyleId] - The ID of the parent style.
 * @property {Object} [lists] - The imported lists object
 * @property {string[]} [inlineDocumentFonts] - The inline fonts found in the document
 * @property {Array} [path] - The path of nodes leading to the current node.
 * @property {Record<string, any>} [extraParams] - The extra params.
 */

/**
 * @typedef {Object} XmlNode
 * @typedef {{type: string, content: *, text: *, attrs: {}, marks: *, sdNodeOrKeyName: string}} PmNodeJson
 * @typedef {{type: string, attrs: {}}} PmMarkJson
 *
 * @typedef {Object} ParsedDocx
 *
 * @typedef {{handler: NodeListHandlerFn, handlerEntities: NodeHandlerEntry[]}} NodeListHandler
 * @typedef {(params: NodeHandlerParams) => PmNodeJson[]} NodeListHandlerFn
 *
 * @typedef {(params: NodeHandlerParams) => {nodes: PmNodeJson[], consumed: number}} NodeHandler
 * @typedef {{handlerName: string, handler: NodeHandler}} NodeHandlerEntry
 *
 * @typedef {Object} SuperConverter
 * @typedef {Object} Editor
 */

export {};
