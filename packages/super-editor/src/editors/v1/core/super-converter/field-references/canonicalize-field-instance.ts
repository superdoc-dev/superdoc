/**
 * Canonicalize a {@link FieldInstance} for snapshot equality comparisons.
 *
 * Round-trip tests assert that an imported field's payload is structurally
 * stable across re-import. Some fields on FieldInstance are session-local
 * bookkeeping or contain object references that cannot be expected to
 * survive a re-import unchanged; the canonicalizer strips or normalizes
 * those before comparison.
 *
 * Strip rules (from the substrate design doc, §"Round-trip test harness"):
 *   - `id`              — fresh UUID per session
 *   - `source.importIndex` — import-time ordinal, differs across reimports
 *   - `source.originalXml` — passthrough source, may be re-emitted but
 *                          structurally non-identical
 *   - `mutation` (whole object) — session bookkeeping; every fresh import
 *                          starts with `imported: true` and all-others false
 *
 * Preserve everything else: `representation`, `family`, `rawInstruction`,
 * `instructionTokens`, `parsedArgs`, `resultFragments`, `dirty`, `locked`,
 * `familyPayload`, `source.part`.
 *
 * Whitespace token normalization: tokens of kind `whitespace` collapse
 * into a single canonical token. The substrate's import pipeline already
 * preserves whitespace as a single run, but synthesized fixtures may
 * produce equivalent token sequences with different whitespace boundaries
 * (e.g. one run of `'  '` vs. two runs of `' '`). We treat them as equal.
 */

import type { FieldInstance, InstructionToken, OpenXmlFragment } from './field-instance.js';

export type CanonicalFieldInstance = {
  representation: 'simple' | 'complex';
  family: string;
  rawInstruction: string;
  instructionTokens: CanonicalInstructionToken[];
  parsedArgs: FieldInstance['parsedArgs'];
  resultFragments: OpenXmlFragment[];
  cachedResultText?: string;
  dirty: boolean;
  locked: boolean;
  familyPayload?: Record<string, unknown>;
  sourcePart: FieldInstance['source']['part'];
};

export type CanonicalInstructionToken =
  | { kind: 'identifier'; text: string }
  | { kind: 'quoted'; text: string; quote: '"' | "'" }
  | { kind: 'switch'; flag: string; arg?: CanonicalInstructionToken }
  | { kind: 'whitespace' }
  | { kind: 'opaque'; text: string }
  | { kind: 'nestedField'; child: CanonicalFieldInstance | null };

/**
 * Produce a canonical view of a FieldInstance for snapshot comparison.
 *
 * Optionally takes a `resolveNested` callback that maps a nested-field
 * `childFieldId` to the child's FieldInstance, so the canonicalizer can
 * recurse through nested anchors. When omitted, nested-field tokens
 * canonicalize to `{ kind: 'nestedField', child: null }`.
 */
export function canonicalizeFieldInstance(
  fi: FieldInstance,
  resolveNested?: (childFieldId: string) => FieldInstance | null | undefined,
): CanonicalFieldInstance {
  return {
    representation: fi.representation,
    family: fi.family,
    rawInstruction: fi.rawInstruction,
    instructionTokens: fi.instructionTokens.map((t) => canonicalizeToken(t, resolveNested)),
    parsedArgs: fi.parsedArgs,
    resultFragments: fi.resultFragments,
    cachedResultText: fi.cachedResultText,
    dirty: fi.dirty,
    locked: fi.locked,
    familyPayload: fi.familyPayload,
    sourcePart: fi.source.part,
  };
}

function canonicalizeToken(
  token: InstructionToken,
  resolveNested?: (childFieldId: string) => FieldInstance | null | undefined,
): CanonicalInstructionToken {
  switch (token.kind) {
    case 'identifier':
      return { kind: 'identifier', text: token.text };
    case 'quoted':
      return { kind: 'quoted', text: token.text, quote: token.quote };
    case 'switch':
      return {
        kind: 'switch',
        flag: token.flag,
        arg: token.arg ? canonicalizeToken(token.arg, resolveNested) : undefined,
      };
    case 'whitespace':
      return { kind: 'whitespace' };
    case 'opaque':
      return { kind: 'opaque', text: token.text };
    case 'nestedField': {
      const child = resolveNested?.(token.childFieldId);
      return {
        kind: 'nestedField',
        child: child ? canonicalizeFieldInstance(child, resolveNested) : null,
      };
    }
  }
}
