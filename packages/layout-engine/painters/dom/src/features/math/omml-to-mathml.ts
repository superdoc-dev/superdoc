/**
 * OMML to MathML Converter
 *
 * Converts Office Math Markup Language (OMML) JSON trees into browser-native
 * MathML DOM elements. Uses a registry pattern so that each OMML math object
 * type can be implemented independently by community contributors.
 *
 * @ooxml m:oMath, m:oMathPara — Office Math containers
 * @spec ECMA-376 §22.1 (Math)
 */

import type { OmmlJsonNode, MathObjectConverter } from './types.js';
import {
  convertMathRun,
  convertFraction,
  convertBar,
  convertFunction,
  convertSubscript,
  convertSuperscript,
  convertSubSuperscript,
} from './converters/index.js';

export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

// ─── Math Object Registry ──────────────────────────────────────────────────
//
// Maps OMML element names to their MathML converter functions.
// Each entry can be implemented independently. A null value means the
// object type is not yet supported (falls back to text extraction).
//
// To add support for a new math object:
// 1. Create a converter file in ./converters/<name>.ts
// 2. Import and set it in this registry
//
// See types.ts MathObjectConverter for the interface contract.
//

const MATH_OBJECT_REGISTRY: Record<string, MathObjectConverter | null> = {
  // ── Implemented ──────────────────────────────────────────────────────────
  'm:r': convertMathRun,
  'm:bar': convertBar, // Bar (overbar/underbar)
  'm:f': convertFraction, // Fraction (numerator/denominator)
  'm:func': convertFunction, // Function apply (sin, cos, log, etc.)
  'm:sSub': convertSubscript, // Subscript
  'm:sSup': convertSuperscript, // Superscript
  'm:sSubSup': convertSubSuperscript, // Sub-superscript (both)

  // ── Not yet implemented (community contributions welcome) ────────────────
  'm:acc': null, // Accent (diacritical mark above base)
  'm:borderBox': null, // Border box (border around math content)
  'm:box': null, // Box (invisible grouping container)
  'm:d': null, // Delimiter (parentheses, brackets, braces)
  'm:eqArr': null, // Equation array (vertical array of equations)
  'm:groupChr': null, // Group character (overbrace, underbrace)
  'm:limLow': null, // Lower limit (e.g., lim)
  'm:limUpp': null, // Upper limit
  'm:m': null, // Matrix (grid of elements)
  'm:nary': null, // N-ary operator (integral, summation, product)
  'm:phant': null, // Phantom (invisible spacing placeholder)
  'm:rad': null, // Radical (square root, nth root)
  'm:sPre': null, // Pre-sub-superscript (left of base)
};

/** OMML argument/container elements that wrap children in <mrow>. */
const ARGUMENT_ELEMENTS = new Set(['m:e', 'm:num', 'm:den', 'm:sub', 'm:sup', 'm:deg', 'm:lim', 'm:fName', 'm:oMath']);

/**
 * Recursively convert an array of OMML child nodes to a DocumentFragment.
 * Used by object converters to process their argument elements (m:e, m:num, m:den, etc.).
 */
function convertChildNodes(children: OmmlJsonNode[], doc: Document): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  for (const child of children) {
    const result = convertNode(child, doc);
    if (result) {
      fragment.appendChild(result);
    }
  }
  return fragment;
}

/**
 * Convert a single OMML JSON node to a MathML DOM element.
 *
 * Resolution order:
 * 1. Check MATH_OBJECT_REGISTRY for a dedicated converter
 * 2. For argument/container elements (m:e, m:num, m:den, etc.), wrap children in <mrow>
 * 3. For text nodes, return the text directly
 * 4. For unknown elements, recurse into children
 */
function convertNode(node: OmmlJsonNode, doc: Document): Node | null {
  if (!node) return null;

  // Text nodes
  if (node.type === 'text' && typeof node.text === 'string') {
    return doc.createTextNode(node.text);
  }

  const name = node.name;
  if (!name) return null;

  // Skip property elements (they're consumed by their parent converter)
  if (name.endsWith('Pr')) return null;

  // Check registry for a dedicated converter
  const converter = MATH_OBJECT_REGISTRY[name];
  if (converter) {
    return converter(node, doc, (children) => convertChildNodes(children, doc));
  }

  // Argument/container elements → <mrow>
  if (ARGUMENT_ELEMENTS.has(name)) {
    const children = node.elements ?? [];
    // Single child: unwrap (no extra <mrow>)
    if (children.length === 1) {
      return convertNode(children[0]!, doc);
    }
    // Multiple children: wrap in <mrow>
    const mrow = doc.createElementNS(MATHML_NS, 'mrow');
    for (const child of children) {
      const result = convertNode(child, doc);
      if (result) mrow.appendChild(result);
    }
    return mrow.childNodes.length > 0 ? mrow : null;
  }

  // Matrix rows → recurse into children
  if (name === 'm:mr') {
    const fragment = doc.createDocumentFragment();
    for (const child of node.elements ?? []) {
      const result = convertNode(child, doc);
      if (result) fragment.appendChild(result);
    }
    return fragment.childNodes.length > 0 ? fragment : null;
  }

  // Unimplemented math object — fall back to converting children
  if (name in MATH_OBJECT_REGISTRY && MATH_OBJECT_REGISTRY[name] === null) {
    const mrow = doc.createElementNS(MATHML_NS, 'mrow');
    for (const child of node.elements ?? []) {
      const result = convertNode(child, doc);
      if (result) mrow.appendChild(result);
    }
    return mrow.childNodes.length > 0 ? mrow : null;
  }

  // Unknown element — recurse
  const fragment = doc.createDocumentFragment();
  for (const child of node.elements ?? []) {
    const result = convertNode(child, doc);
    if (result) fragment.appendChild(result);
  }
  return fragment.childNodes.length > 0 ? fragment : null;
}

/**
 * Convert an OMML JSON tree to a MathML <math> DOM element.
 *
 * @param ommlJson - The OMML JSON tree (from a mathInline or mathBlock node's originalXml)
 * @param doc - The document object for creating DOM elements
 * @returns A <math> element ready to be inserted into the DOM, or null if conversion fails
 */
export function convertOmmlToMathml(ommlJson: unknown, doc: Document): Element | null {
  if (!ommlJson || typeof ommlJson !== 'object') return null;

  const root = ommlJson as OmmlJsonNode;
  const mathEl = doc.createElementNS(MATHML_NS, 'math');
  mathEl.setAttribute('style', 'font-family: "Cambria Math", math');

  if (root.name === 'm:oMathPara') {
    mathEl.setAttribute('display', 'block');
    mathEl.setAttribute('displaystyle', 'true');
  }

  // For m:oMathPara, iterate over child m:oMath elements
  // For m:oMath, process directly
  const children = root.elements ?? [];
  for (const child of children) {
    const result = convertNode(child, doc);
    if (result) mathEl.appendChild(result);
  }

  return mathEl.childNodes.length > 0 ? mathEl : null;
}

/**
 * Register a converter for an OMML math object type.
 * Used by community contributors to add support for individual math objects.
 *
 * @param elementName - The OMML element name (e.g., 'm:f', 'm:rad')
 * @param converter - The converter function
 */
export function registerMathObjectConverter(elementName: string, converter: MathObjectConverter): void {
  MATH_OBJECT_REGISTRY[elementName] = converter;
}
