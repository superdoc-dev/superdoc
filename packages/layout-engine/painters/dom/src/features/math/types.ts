/**
 * Represents an OMML XML node in the xml2json format used by SuperDoc's converter.
 */
export type OmmlJsonNode = {
  /** Element name (e.g., 'm:oMath', 'm:f', 'm:r') */
  name?: string;
  /** Node type ('element', 'text', etc.) */
  type?: string;
  /** XML attributes (e.g., { 'm:val': 'center' }) */
  attributes?: Record<string, string>;
  /** Child elements */
  elements?: OmmlJsonNode[];
  /** Text content (for text nodes) */
  text?: string;
};

/**
 * Converter function for a single OMML math object.
 *
 * Community contributors implement this interface to add support for
 * individual math objects (fractions, radicals, matrices, etc.).
 *
 * @param node - The OMML JSON node to convert (e.g., an m:f element)
 * @param doc - The document object for creating MathML elements
 * @param convertChildren - Recursive converter for child OMML elements.
 *   Call this to convert nested math content (arguments like m:e, m:num, m:den).
 * @returns A MathML DOM element, or null to fall back to text extraction
 *
 * @example
 * ```typescript
 * // Implementing m:f (fraction) → <mfrac>
 * const convertFraction: MathObjectConverter = (node, doc, convertChildren) => {
 *   const num = node.elements?.find(e => e.name === 'm:num');
 *   const den = node.elements?.find(e => e.name === 'm:den');
 *   const frac = doc.createElementNS(MATHML_NS, 'mfrac');
 *   frac.appendChild(convertChildren(num?.elements ?? []));
 *   frac.appendChild(convertChildren(den?.elements ?? []));
 *   return frac;
 * };
 * ```
 */
export type MathObjectConverter = (
  node: OmmlJsonNode,
  doc: Document,
  convertChildren: (children: OmmlJsonNode[]) => DocumentFragment,
) => Element | null;
