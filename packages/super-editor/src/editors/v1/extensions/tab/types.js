// Lightweight type declarations (JSDoc) for tab layout requests/results used by the adapter.

/**
 * @typedef {Object} TabStopInput
 * @property {number} pos - Position in pixels from paragraph start.
 * @property {'start'|'end'|'center'|'decimal'|'bar'|'clear'} val
 * @property {'none'|'dot'|'hyphen'|'underscore'|'heavy'|'middleDot'} [leader]
 * @property {string} [decimalChar]
 */

/**
 * @typedef {Object} LayoutRequest
 * @property {string} paragraphId
 * @property {number} revision
 * @property {number} paragraphWidth
 * @property {number} defaultTabDistance
 * @property {number} defaultLineLength
 * @property {{ left:number, right:number, firstLine:number, hanging:number }} indents
 * @property {TabStopInput[]} tabStops
 * @property {Array<TextSpan|TabSpan>} spans
 * @property {number} [indentWidth]
 * @property {import('prosemirror-model').Node} [paragraphNode]
 */

/**
 * @typedef {Object} TextSpan
 * @property {'text'} type
 * @property {string} spanId
 * @property {string} text
 * @property {Object} style
 * @property {number} from
 * @property {number} to
 */

/**
 * @typedef {Object} TabSpan
 * @property {'tab'} type
 * @property {string} spanId
 * @property {string} tabId
 * @property {number} pos
 * @property {number} nodeSize
 */

/**
 * @typedef {Object} LayoutResult
 * @property {string} paragraphId
 * @property {number} revision
 * @property {Object.<string, TabLayout>} tabs
 */

/**
 * @typedef {Object} TabLayout
 * @property {number} width
 * @property {number} height
 * @property {'start'|'center'|'end'|'decimal'|'bar'|'default'} alignment
 * @property {number|string} tabStopPosUsed
 * @property {'none'|'dot'|'hyphen'|'underscore'|'heavy'|'middleDot'} [leader]
 */
