/**
 * Canonical field substrate types.
 *
 * The single durable representation of a Word field code, carried unchanged
 * across importer, ProseMirror state, renderer, and exporter. Designed to
 * make round-trip fidelity true for every field, including codes SuperDoc
 * does not understand.
 *
 * This file ships type declarations + the FieldId factory only. Importer
 * wiring, the rawField PM carrier, and the exporter rewrite are separate
 * pieces of work.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Session-scoped UUID. Never persisted to DOCX. */
export type FieldId = string;

/**
 * Generate a fresh, session-scoped FieldId.
 *
 * Field ids never cross the DOCX boundary, so cryptographic strength is not
 * required. We prefer `crypto.randomUUID` when available (Node 19+, modern
 * browsers) and fall back to a Math.random-based UUID otherwise.
 */
export function createFieldId(): FieldId {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Instruction token stream
// ---------------------------------------------------------------------------

/**
 * One token in a field instruction's parsed stream. The stream preserves
 * order, quoting, and whitespace verbatim so the original instruction text
 * can be reconstructed by walking the tokens back into characters.
 *
 * Tokens are emitted linearly: a switch and its argument are separate
 * tokens with possible whitespace between them. Switch-to-argument pairing
 * is exposed via {@link ParsedArgs}, derived from the linear stream.
 */
export type InstructionToken =
  | { kind: 'identifier'; text: string }
  | { kind: 'quoted'; text: string; quote: '"' | "'" }
  | { kind: 'switch'; flag: string; arg?: InstructionToken }
  | { kind: 'whitespace'; text: string }
  | { kind: 'opaque'; text: string }
  | { kind: 'nestedField'; childFieldId: FieldId };

// ---------------------------------------------------------------------------
// Parsed arguments (evaluator-friendly view)
// ---------------------------------------------------------------------------

/**
 * Evaluator-friendly view derived from {@link InstructionToken}[]. Drops
 * whitespace, classifies positional vs switch arguments, and pairs each
 * switch with its trailing argument when one exists.
 */
export type ParsedArgs = {
  /** First identifier in the instruction, uppercased (e.g. "PAGE", "SEQ"). */
  family?: string;
  /** Identifier/quoted tokens between the family and the first switch. */
  positional: ParsedArg[];
  /** Switches with their attached arguments, in source order. */
  switches: ParsedSwitch[];
};

export type ParsedArg = {
  kind: 'identifier' | 'quoted';
  /** Text content, unquoted. */
  text: string;
  /** Source quote character if the token was quoted. */
  quote?: '"' | "'";
};

export type ParsedSwitch = {
  /** Single-character flag, without the leading backslash. */
  flag: string;
  /** First non-whitespace token after the switch, if it is identifier|quoted. */
  arg?: ParsedArg;
};

// ---------------------------------------------------------------------------
// Result fragments and source XML
// ---------------------------------------------------------------------------

/**
 * Opaque parsed OOXML subtree. Carried as-is for {@link FieldInstance.resultFragments}
 * and {@link SourceMeta.originalXml}; concrete shape is whatever the existing
 * super-converter parser emits. Downstream chunks of Phase 0 will tighten
 * this type when they wire the importer.
 */
export type OpenXmlFragment = unknown;

// ---------------------------------------------------------------------------
// Mutation metadata
// ---------------------------------------------------------------------------

/**
 * Per-field session bookkeeping that drives the exporter's passthrough
 * decision.
 *
 * Content flags (`instructionEdited`, `resultEdited`, `flagsEdited`) latch
 * once set. Structural flags (`relocated`, `structureEdited`) reconcile
 * against import-time state on every PM transaction so undo correctly
 * clears them; that reconciliation plugin lands in Phase 1.
 */
export type MutationMetadata = {
  imported: boolean;
  inserted: boolean;
  instructionEdited: boolean;
  resultEdited: boolean;
  flagsEdited: boolean;
  relocated: boolean;
  structureEdited: boolean;
};

// ---------------------------------------------------------------------------
// Source metadata
// ---------------------------------------------------------------------------

/** DOCX part the field originated from. */
export type FieldSourcePart = 'body' | 'header' | 'footer' | 'footnotes' | 'endnotes' | 'comments' | 'glossary';

export type SourceMeta = {
  /** Parsed subtree for passthrough export. Absent for fields inserted in-session. */
  originalXml?: OpenXmlFragment;
  part: FieldSourcePart;
  /** Import-time ordinal within the part. */
  importIndex: number;
};

// ---------------------------------------------------------------------------
// Family payload
// ---------------------------------------------------------------------------

/**
 * Family-specific payload (form-field ffData, merge-field switches, etc.).
 * Opaque at the substrate layer; family preprocessors define their own
 * shapes and projections over this payload.
 */
export type FamilyPayload = Record<string, unknown>;

// ---------------------------------------------------------------------------
// FieldInstance
// ---------------------------------------------------------------------------

/**
 * Field family, normalized to uppercase. `'unknown'` is the floor for any
 * field SuperDoc cannot classify; such fields still round-trip faithfully
 * through the rawField carrier and the passthrough export path.
 */
export type FieldFamily = string;

/**
 * The canonical field payload. Every field in the document has exactly one,
 * regardless of whether SuperDoc has a typed evaluator for the family.
 *
 * Persisted: `id`, `representation`, `family`, `rawInstruction`,
 * `instructionTokens`, `resultFragments`, `dirty`, `locked`, `mutation`,
 * `familyPayload`, `source`. Other quantities (nestingDepth, supportLevel,
 * cachedResultText) are derived and recomputed on demand.
 */
export type FieldInstance = {
  id: FieldId;
  representation: 'simple' | 'complex';
  family: FieldFamily;
  rawInstruction: string;
  instructionTokens: InstructionToken[];
  parsedArgs: ParsedArgs;
  resultFragments: OpenXmlFragment[];
  /** Convenience denormalization of `resultFragments` for plain-text lookups. */
  cachedResultText?: string;
  /** Word's `w:fldChar @w:dirty` / `w:fldSimple @w:dirty`. */
  dirty: boolean;
  /** Word's `w:fldChar @w:fldLock` / `w:fldSimple @w:fldLock`. */
  locked: boolean;
  mutation: MutationMetadata;
  familyPayload?: FamilyPayload;
  source: SourceMeta;
};
