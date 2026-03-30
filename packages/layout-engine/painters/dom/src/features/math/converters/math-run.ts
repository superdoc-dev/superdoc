import type { OmmlJsonNode, MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Characters that should be treated as MathML operators. */
const OPERATOR_CHARS = new Set([
  '+',
  '-',
  '=',
  '<',
  '>',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '|',
  '/',
  '\\',
  ',',
  '.',
  ';',
  ':',
  '!',
  '~',
  '^',
  '_',
  '\u00B1',
  '\u00D7',
  '\u00F7', // ±, ×, ÷
  '\u2190',
  '\u2191',
  '\u2192',
  '\u2193',
  '\u2194', // arrows
  '\u2200',
  '\u2201',
  '\u2202',
  '\u2203',
  '\u2204',
  '\u2205', // ∀, ∁, ∂, ∃, ∄, ∅
  '\u2208',
  '\u2209',
  '\u220B',
  '\u220C', // ∈, ∉, ∋, ∌
  '\u2211',
  '\u220F', // ∑, ∏
  '\u221A',
  '\u221E', // √, ∞
  '\u2227',
  '\u2228',
  '\u2229',
  '\u222A', // ∧, ∨, ∩, ∪
  '\u222B',
  '\u222C',
  '\u222D', // ∫, ∬, ∭
  '\u2260',
  '\u2261',
  '\u2264',
  '\u2265', // ≠, ≡, ≤, ≥
  '\u2282',
  '\u2283',
  '\u2286',
  '\u2287', // ⊂, ⊃, ⊆, ⊇
]);

/**
 * Classify a text string into MathML element type.
 * - All-digit strings → <mn> (number)
 * - Known operators → <mo> (operator)
 * - Everything else → <mi> (identifier)
 */
function classifyMathText(text: string): 'mn' | 'mo' | 'mi' {
  if (/^\d*\.?\d+$/.test(text)) return 'mn';
  if (text.length === 1 && OPERATOR_CHARS.has(text)) return 'mo';
  return 'mi';
}

/**
 * Convert an m:r (math run) element to MathML.
 *
 * m:r contains:
 * - m:rPr (math run properties: script, style, normal text flag)
 * - m:t (text content)
 * - Optionally w:rPr (WordprocessingML run properties for formatting)
 *
 * The text is classified as <mi>, <mo>, or <mn> based on content.
 */
export const convertMathRun: MathObjectConverter = (node, doc) => {
  const elements = node.elements ?? [];

  // Extract text from m:t children
  let text = '';
  for (const child of elements) {
    if (child.name === 'm:t') {
      const textChildren = child.elements ?? [];
      for (const tc of textChildren) {
        if (tc.type === 'text' && typeof tc.text === 'string') {
          text += tc.text;
        }
      }
    }
  }

  if (!text) return null;

  // Check m:rPr for normal text flag (m:nor) which disables math italics
  const rPr = elements.find((el) => el.name === 'm:rPr');
  const isNormalText = rPr?.elements?.some((el) => el.name === 'm:nor') ?? false;

  const tag = classifyMathText(text);
  const el = doc.createElementNS(MATHML_NS, tag);
  el.textContent = text;

  // MathML <mi> with single-char content is italic by default (spec).
  // Multi-char <mi> is normal by default. The m:nor flag forces normal.
  if (tag === 'mi' && isNormalText) {
    el.setAttribute('mathvariant', 'normal');
  }

  return el;
};
