/**
 * Tokenizing parser for Word field instructions.
 *
 * The tokenizer's job is fidelity, not semantics:
 *   - captures order, quoting, and whitespace so the original instruction
 *     can be reconstructed token-by-token;
 *   - derives a best-effort {@link ParsedArgs} view for evaluator
 *     convenience (family, positional args, normalized switches with
 *     attached args).
 *
 * Round-trip contract: the linear token stream concatenates back to the
 * input byte-for-byte for every token kind EXCEPT non-spec backslash
 * sequences inside quoted strings. ECMA-376 §17.16.1 only defines `\"`
 * and `\\` as escapes; any other `\X` in the source is preserved as the
 * literal two characters in the token text but reconstruction always
 * re-escapes via `\\X`. So `"line\nbreak"` round-trips through the
 * tokenizer as `"line\\nbreak"` — different bytes, same canonical
 * meaning under the spec's escape rules. See {@link escapeQuotedText}
 * for the exact rule. Production import/export does not call
 * {@link reconstructInstruction}; this contract is exercised by tests
 * and is the relevant invariant for any future caller that does.
 *
 * What it does NOT do:
 *   - interpret family-specific semantics (no SEQ / REF / TOC / DATE
 *     parsing — those live in family preprocessors that layer on top);
 *   - throw or fail on malformed input — unparseable remainders fall back
 *     to a single `opaque` token, so Phase A import always produces a
 *     usable token stream.
 */

import type { InstructionToken, ParsedArg, ParsedArgs, ParsedSwitch } from './field-instance.js';

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);
const QUOTES = new Set(['"', "'"]);

/**
 * Tokenize a raw field instruction string into its linear token stream.
 *
 * The stream concatenates back to the input character-for-character: walk
 * the tokens and emit `text` (identifiers, whitespace, opaque), `quote +
 * text + quote` (quoted), or `\\ + flag` (switches), and the result equals
 * the input. Switches do not consume their arguments at this layer — they
 * appear as their own tokens with following whitespace and arg tokens
 * preserved separately. Switch-to-arg pairing lives in {@link deriveParsedArgs}.
 *
 * Examples:
 *   "PAGE"
 *     → [identifier "PAGE"]
 *   "SEQ Figure \\* ARABIC"
 *     → identifier "SEQ", whitespace " ", identifier "Figure",
 *       whitespace " ", switch "*", whitespace " ", identifier "ARABIC"
 *   `HYPERLINK "https://example.com" \\o "tooltip"`
 *     → identifier "HYPERLINK", whitespace " ", quoted "https://example.com" ",
 *       whitespace " ", switch "o", whitespace " ", quoted "tooltip" "
 */
export function tokenizeInstruction(raw: string): InstructionToken[] {
  const out: InstructionToken[] = [];
  if (!raw) return out;

  const n = raw.length;
  let i = 0;

  while (i < n) {
    const ch = raw[i];

    if (WHITESPACE.has(ch)) {
      let j = i + 1;
      while (j < n && WHITESPACE.has(raw[j])) j++;
      out.push({ kind: 'whitespace', text: raw.slice(i, j) });
      i = j;
      continue;
    }

    if (QUOTES.has(ch)) {
      const quote = ch as '"' | "'";
      let j = i + 1;
      let text = '';
      // ECMA-376 §17.16.1 defines `\"` and `\\` as escapes inside a
      // field-argument quoted string. Other `\X` sequences are not
      // specified; preserve both characters verbatim to avoid silent data
      // loss. Round-trip is byte-identical: the unescaped text is held in
      // the token, and reconstruction re-escapes the special characters.
      while (j < n) {
        const c = raw[j];
        if (c === quote) break;
        if (c === '\\' && j + 1 < n) {
          const next = raw[j + 1];
          if (next === quote || next === '\\') {
            text += next;
            j += 2;
            continue;
          }
        }
        text += c;
        j += 1;
      }
      if (j >= n) {
        // Unterminated quoted string: fall back to an opaque token holding
        // the raw remainder so reconstruction is still byte-identical.
        out.push({ kind: 'opaque', text: raw.slice(i) });
        return out;
      }
      out.push({ kind: 'quoted', text, quote });
      i = j + 1;
      continue;
    }

    if (ch === '\\') {
      if (i + 1 >= n) {
        // Trailing backslash with nothing after it: opaque single char.
        out.push({ kind: 'opaque', text: '\\' });
        return out;
      }
      const next = raw[i + 1];
      if (WHITESPACE.has(next)) {
        // Lone backslash followed by whitespace: not a valid switch, emit
        // as opaque and continue past the backslash only.
        out.push({ kind: 'opaque', text: '\\' });
        i += 1;
        continue;
      }
      // ECMA-376 §17.16.1's grammar nominally permits two-character switch
      // names, but every documented switch in §17.16.4-5 is single-char and
      // every Word-emitted instruction follows that convention. Take one
      // character and let any following identifier flow through as its arg.
      out.push({ kind: 'switch', flag: next });
      i += 2;
      continue;
    }

    // Identifier: a run of non-whitespace, non-quote, non-backslash chars.
    let j = i + 1;
    while (j < n) {
      const c = raw[j];
      if (WHITESPACE.has(c)) break;
      if (QUOTES.has(c)) break;
      if (c === '\\') break;
      j++;
    }
    out.push({ kind: 'identifier', text: raw.slice(i, j) });
    i = j;
  }

  return out;
}

/**
 * Reconstruct the original instruction string from a token stream.
 *
 * `nestedField` tokens have no source text and are skipped — they are
 * placeholders inserted by the importer when a nested field is detected
 * inside the instruction; export rebuilds them via the envelope walker.
 *
 * A `switch` token may carry an embedded `arg`. The tokenizer in this file
 * never produces such tokens (it keeps switch and arg separate in the
 * linear stream), but callers that build tokens manually (for example
 * synthesizing an instruction for a legacy `<w:pgNum/>` run) can attach an
 * arg directly. Reconstruction emits the embedded arg adjacent to its
 * switch so its source text is preserved.
 *
 * Round-trip is byte-faithful for `identifier`, `whitespace`, `opaque`,
 * `switch` (without embedded arg), and the spec-defined `\"` / `\\`
 * escapes inside `quoted` tokens. Non-spec backslash sequences inside
 * quoted strings (e.g. literal `\n`, Windows paths like
 * `INCLUDEPICTURE "C:\Images\logo.png"`) preserve content but
 * canonicalize on reconstruction: every literal backslash is re-emitted
 * as `\\`. The two forms are semantically equivalent under ECMA-376
 * §17.16.1 escape rules; if you need exact byte fidelity for an
 * unmodified field, use `source.originalXml` from `FieldInstance`.
 */
export function reconstructInstruction(tokens: InstructionToken[]): string {
  let out = '';
  for (const t of tokens) out += renderToken(t);
  return out;
}

function renderToken(t: InstructionToken): string {
  switch (t.kind) {
    case 'identifier':
    case 'whitespace':
    case 'opaque':
      return t.text;
    case 'quoted':
      return t.quote + escapeQuotedText(t.text, t.quote) + t.quote;
    case 'switch':
      return '\\' + t.flag + (t.arg ? renderToken(t.arg) : '');
    case 'nestedField':
      // Nested-field anchors carry no source text; the envelope exporter
      // recursively re-emits the child field at this position.
      return '';
  }
}

/**
 * Escape a quoted token's `text` payload back to its source form.
 *
 * Spec-defined escapes (`\"` / `\'` and `\\`) round-trip byte-for-byte.
 * For non-spec `\X` sequences in the source the tokenizer preserves both
 * characters in `text`; reconstruction always emits backslashes as `\\`,
 * so `"path\nbreak"` becomes `"path\\nbreak"` on round-trip — different
 * bytes, same canonical meaning.
 */
function escapeQuotedText(text: string, quote: '"' | "'"): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' || c === quote) out += '\\';
    out += c;
  }
  return out;
}

// ---------------------------------------------------------------------------
// ParsedArgs derivation
// ---------------------------------------------------------------------------

/**
 * Derive the evaluator-friendly view from the linear token stream.
 *
 * Rules:
 *   - The first `identifier` (if any) becomes `family`, uppercased.
 *   - Subsequent `identifier` and `quoted` tokens before any switch become
 *     `positional` arguments.
 *   - Each `switch` token starts a new {@link ParsedSwitch}. If the switch
 *     carries an embedded `arg` (identifier or quoted), that arg attaches
 *     immediately and the switch is closed — a following linear token
 *     will not re-attach. Otherwise the next non-whitespace `identifier`
 *     or `quoted` token from the linear stream becomes its `arg`, unless
 *     another `switch` arrives first or the stream ends.
 *   - `whitespace`, `opaque`, and `nestedField` tokens never appear in
 *     `parsedArgs`; they remain in the linear token stream so the exporter
 *     can reconstruct the instruction faithfully.
 *   - Identifier/quoted tokens after a switch that has already received an
 *     arg are dropped from `parsedArgs` (they remain in the linear stream).
 *     This is rare in practice; family preprocessors that need full
 *     ordering walk the linear stream directly.
 */
export function deriveParsedArgs(tokens: InstructionToken[]): ParsedArgs {
  const out: ParsedArgs = { positional: [], switches: [] };

  let familySet = false;
  let firstSwitchSeen = false;
  let pendingSwitch: ParsedSwitch | null = null;

  for (const t of tokens) {
    if (t.kind === 'whitespace' || t.kind === 'opaque' || t.kind === 'nestedField') continue;

    if (t.kind === 'switch') {
      const sw: ParsedSwitch = { flag: normalizeSwitchFlag(t.flag) };
      if (t.arg && (t.arg.kind === 'identifier' || t.arg.kind === 'quoted')) {
        sw.arg = toParsedArg(t.arg);
      }
      out.switches.push(sw);
      // If the switch carries any embedded arg, the switch slot is closed:
      // a following linear identifier/quoted token must not re-attach. An
      // embedded arg of an unsupported kind (whitespace, opaque, nested,
      // another switch) closes the slot without filling it; that is rare
      // and intentionally left for the linear stream to carry.
      pendingSwitch = t.arg === undefined ? sw : null;
      firstSwitchSeen = true;
      continue;
    }

    if (!familySet && !firstSwitchSeen && t.kind === 'identifier') {
      out.family = t.text.toUpperCase();
      familySet = true;
      continue;
    }

    const arg = toParsedArg(t);

    if (pendingSwitch && pendingSwitch.arg === undefined) {
      pendingSwitch.arg = arg;
      pendingSwitch = null;
      continue;
    }

    if (!firstSwitchSeen) {
      out.positional.push(arg);
    }
  }

  return out;
}

function toParsedArg(t: InstructionToken): ParsedArg {
  if (t.kind === 'identifier') return { kind: 'identifier', text: t.text };
  if (t.kind === 'quoted') return { kind: 'quoted', text: t.text, quote: t.quote };
  // Unreachable: callers filter to identifier|quoted before calling.
  return { kind: 'identifier', text: '' };
}

function normalizeSwitchFlag(flag: string): string {
  return flag.toLowerCase();
}

// ---------------------------------------------------------------------------
// Convenience: full parse
// ---------------------------------------------------------------------------

/**
 * Tokenize and derive {@link ParsedArgs} in one call. Convenience wrapper
 * for callers that do not need to keep the tokens and the derived view
 * separate.
 */
export function parseInstruction(raw: string): {
  tokens: InstructionToken[];
  parsedArgs: ParsedArgs;
} {
  const tokens = tokenizeInstruction(raw);
  return { tokens, parsedArgs: deriveParsedArgs(tokens) };
}
