/**
 * Editor-neutral XML → tree helper. Produces the canonical
 * `{ name, type, attributes, elements }` shape that both v1 importer
 * translators and this compiler consume.
 *
 * `xml-js` is the only XML dependency; the helper is colocated here so
 * style-engine never imports from `super-editor` aliases.
 */
import { xml2js } from 'xml-js';

export interface OoxmlElement {
  name?: string;
  type?: string;
  attributes?: Record<string, string | undefined>;
  elements?: OoxmlElement[];
  text?: string;
}

const DECODER = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

function bytesToString(input: Uint8Array | string): string {
  if (typeof input === 'string') return input;
  if (DECODER) return DECODER.decode(input);
  return Buffer.from(input).toString('utf-8');
}

export interface XmlParseResult {
  root: OoxmlElement | null;
  error?: string;
}

/**
 * Parse OOXML bytes/string to the `{ elements }` tree. Returns the first
 * element under the document node (typically `w:styles`, `w:numbering`, etc.).
 * Returns `{ root: null }` for empty/missing input; returns `{ error }` on
 * malformed XML so callers can record diagnostics.
 */
export function parseOoxml(input: Uint8Array | string | null | undefined): XmlParseResult {
  if (input == null) return { root: null };
  const text = bytesToString(input).trim();
  if (!text) return { root: null };
  try {
    const parsed = xml2js(text, { compact: false }) as OoxmlElement;
    const top = (parsed.elements ?? []).find((el) => el && el.type === 'element');
    return { root: top ?? null };
  } catch (err) {
    return { root: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Find the first child element with a given name. */
export function findChild(node: OoxmlElement | null | undefined, name: string): OoxmlElement | undefined {
  if (!node || !Array.isArray(node.elements)) return undefined;
  return node.elements.find((el) => el && el.name === name);
}

/** Return all child elements with a given name. */
export function findChildren(node: OoxmlElement | null | undefined, name: string): OoxmlElement[] {
  if (!node || !Array.isArray(node.elements)) return [];
  return node.elements.filter((el) => el && el.name === name);
}

/** Read a single attribute by name. */
export function attr(node: OoxmlElement | null | undefined, name: string): string | undefined {
  const value = node?.attributes?.[name];
  return value == null ? undefined : String(value);
}

/**
 * Word ST_OnOff parser. Treats missing val as `true` (per ECMA-376), and
 * resolves the standard truthy/falsy spellings.
 */
const ST_ON = new Set(['1', 'true', 'on']);
const ST_OFF = new Set(['0', 'false', 'off']);
export function parseOnOff(node: OoxmlElement | null | undefined): boolean | undefined {
  if (!node) return undefined;
  const raw = attr(node, 'w:val');
  if (raw == null) return true;
  const lower = raw.trim().toLowerCase();
  if (ST_ON.has(lower)) return true;
  if (ST_OFF.has(lower)) return false;
  return true;
}

/** Read `w:val` and coerce to a number, returning undefined on failure. */
export function parseNumberVal(node: OoxmlElement | null | undefined): number | undefined {
  const raw = attr(node, 'w:val');
  if (raw == null) return undefined;
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

/** Read `w:val` as string. */
export function parseStringVal(node: OoxmlElement | null | undefined): string | undefined {
  return attr(node, 'w:val');
}
