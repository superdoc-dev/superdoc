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
  '\u221A', // √ (radical sign — prefix operator)
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

type MathAtomTag = 'mi' | 'mo' | 'mn';

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/**
 * Split a math run's text into MathML atoms, matching Word's OMML2MML.XSL.
 *
 * Rules (ECMA-376 §22.1.2.116 example + Annex L.6.1.13):
 * - Consecutive digits — optionally containing one decimal point between digits —
 *   group into a single `<mn>`.
 * - Each recognized operator character becomes its own `<mo>`.
 * - Every other character becomes its own `<mi>`.
 *
 * Example: `"n+1"` → `[<mi>n</mi>, <mo>+</mo>, <mn>1</mn>]`.
 */
export function tokenizeMathText(text: string): Array<{ tag: MathAtomTag; content: string }> {
  const atoms: Array<{ tag: MathAtomTag; content: string }> = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (isDigit(ch)) {
      let end = i + 1;
      let sawDot = false;
      while (end < text.length) {
        const c = text[end]!;
        if (isDigit(c)) {
          end++;
          continue;
        }
        if (c === '.' && !sawDot && end + 1 < text.length && isDigit(text[end + 1]!)) {
          sawDot = true;
          end++;
          continue;
        }
        break;
      }
      atoms.push({ tag: 'mn', content: text.slice(i, end) });
      i = end;
    } else if (OPERATOR_CHARS.has(ch)) {
      atoms.push({ tag: 'mo', content: ch });
      i++;
    } else {
      atoms.push({ tag: 'mi', content: ch });
      i++;
    }
  }
  return atoms;
}

/** ECMA-376 m:sty → MathML mathvariant (§22.1.2 math run properties). */
const STY_TO_VARIANT: Record<string, string> = {
  p: 'normal',
  b: 'bold',
  i: 'italic',
  bi: 'bold-italic',
};

/** ECMA-376 m:scr → MathML mathvariant (§22.1.2 math run properties). */
const SCR_TO_VARIANT: Record<string, string> = {
  roman: 'normal',
  script: 'script',
  fraktur: 'fraktur',
  'double-struck': 'double-struck',
  'sans-serif': 'sans-serif',
  monospace: 'monospace',
};

/**
 * Resolve the effective MathML mathvariant from OMML m:rPr.
 *
 * Precedence (highest first): m:sty > m:scr > m:nor.
 * m:nor is the legacy "normal text" flag (ECMA-376 §22.1.2); it is treated as
 * equivalent to m:sty="p" when neither m:sty nor m:scr is present.
 */
function resolveMathVariant(rPr: OmmlJsonNode | undefined): string | null {
  const elements = rPr?.elements ?? [];
  const sty = elements.find((el) => el.name === 'm:sty')?.attributes?.['m:val'];
  if (sty && STY_TO_VARIANT[sty]) return STY_TO_VARIANT[sty]!;

  const scr = elements.find((el) => el.name === 'm:scr')?.attributes?.['m:val'];
  if (scr && SCR_TO_VARIANT[scr]) return SCR_TO_VARIANT[scr]!;

  if (elements.some((el) => el.name === 'm:nor')) return 'normal';

  return null;
}

function extractText(node: OmmlJsonNode): string {
  let text = '';
  for (const child of node.elements ?? []) {
    if (child.name === 'm:t') {
      for (const tc of child.elements ?? []) {
        if (tc.type === 'text' && typeof tc.text === 'string') text += tc.text;
      }
    }
  }
  return text;
}

/**
 * Convert an m:r (math run) element to MathML atoms.
 *
 * m:r contains:
 * - m:rPr (math run properties: script, style, normal text flag)
 * - m:t (text content)
 * - Optionally w:rPr (WordprocessingML run properties for formatting)
 *
 * The run's text is split per-character into `<mi>` / `<mo>` / `<mn>` atoms
 * per Word's OMML2MML.XSL. For a single-atom run (common case — a one-letter
 * variable, single operator, or an all-digit number) the converter returns a
 * single Element. For a multi-atom run (e.g. "→∞", "x+1") it returns a
 * DocumentFragment whose children become siblings of the parent mrow.
 *
 * @spec ECMA-376 §22.1.2.116 (t) — example shows multi-char mixed runs as the
 *   normal authored shape; §22.1.2.58 (lit) implies operators are classified
 *   per-character by default.
 */
export const convertMathRun: MathObjectConverter = (node, doc) => {
  const text = extractText(node);
  if (!text) return null;

  const rPr = (node.elements ?? []).find((el) => el.name === 'm:rPr');
  const variant = resolveMathVariant(rPr);
  const atoms = tokenizeMathText(text);

  const createAtom = (atom: { tag: MathAtomTag; content: string }): Element => {
    const el = doc.createElementNS(MATHML_NS, atom.tag);
    el.textContent = atom.content;
    // Apply m:rPr-derived variant to every atom in the run. Omitted attribute
    // means "use the MathML default" (italic for single-char <mi>, normal
    // for multi-char <mi>/<mo>/<mn>).
    if (variant) el.setAttribute('mathvariant', variant);
    return el;
  };

  if (atoms.length === 1) return createAtom(atoms[0]!);

  const fragment = doc.createDocumentFragment();
  for (const atom of atoms) fragment.appendChild(createAtom(atom));
  return fragment;
};

/**
 * Convert an m:r to a single `<mi>` element, preserving the entire run text.
 *
 * Used by m:func when processing m:fName children — Word's OMML2MML.XSL treats
 * multi-letter function names (e.g. "sin", "lim", "max") as one identifier
 * rather than splitting per character. See `convertFunction` for the calling
 * context.
 *
 * Returns null if the run has no text. If the run contains non-letter
 * characters (digits or operators), falls back to the splitting path so
 * composite function names still render correctly.
 */
export function convertMathRunWhole(node: OmmlJsonNode, doc: Document): Node | null {
  const text = extractText(node);
  if (!text) return null;

  const rPr = (node.elements ?? []).find((el) => el.name === 'm:rPr');
  const variant = resolveMathVariant(rPr);
  const atoms = tokenizeMathText(text);

  if (atoms.every((a) => a.tag === 'mi')) {
    const el = doc.createElementNS(MATHML_NS, 'mi');
    el.textContent = text;
    if (variant) el.setAttribute('mathvariant', variant);
    return el;
  }

  // Mixed content inside m:fName is rare (e.g. "log_2"). Fall through to the
  // per-atom path so operators and numbers render with correct semantics.
  if (atoms.length === 1) {
    const atom = atoms[0]!;
    const el = doc.createElementNS(MATHML_NS, atom.tag);
    el.textContent = atom.content;
    if (variant) el.setAttribute('mathvariant', variant);
    return el;
  }
  const fragment = doc.createDocumentFragment();
  for (const atom of atoms) {
    const el = doc.createElementNS(MATHML_NS, atom.tag);
    el.textContent = atom.content;
    if (variant) el.setAttribute('mathvariant', variant);
    fragment.appendChild(el);
  }
  return fragment;
}
