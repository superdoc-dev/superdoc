/**
 * Smoke test: every example in DOC_COMMAND_EXAMPLES and CLI_HELPER_COMMANDS
 * must parse cleanly through the real CLI argument parser.
 *
 * This guards against example drift by running each example through:
 *  1. Shell-accurate tokenization (strip quotes, split on spaces)
 *  2. Command-token stripping (same as the CLI router)
 *  3. `parseCommandArgs` with the operation's full option spec set
 *  4. `ensureValidArgs` — rejects unknown flags and type mismatches
 *  5. JSON payload validation — every --*-json flag must contain valid JSON
 *
 * If a flag is renamed, removed, misspelled, or a JSON payload is malformed,
 * this test catches it before the example ships in `describe command` output.
 */

import { describe, expect, test } from 'bun:test';
import { DOC_COMMAND_EXAMPLES } from '../cli/command-examples';
import { CLI_HELPER_COMMANDS } from '../cli/helper-commands';
import { CLI_COMMAND_SPECS } from '../cli/commands';
import { CLI_OPERATION_OPTION_SPECS } from '../cli/operation-params';
import { parseCommandArgs, ensureValidArgs } from '../lib/args';
import type { CliOperationId } from '../cli/operation-set';
import type { OptionSpec } from '../lib/args';

// ---------------------------------------------------------------------------
// Wrapper-added extra option specs not in CLI_OPERATION_OPTION_SPECS.
// These are added at runtime by parseWrapperOperationInput for specific ops.
// Mirror them here so the smoke test covers the full flag surface.
// ---------------------------------------------------------------------------

const WRAPPER_EXTRA_SPECS: Partial<Record<string, OptionSpec[]>> = {
  'doc.find': [
    { name: 'type', type: 'string' },
    { name: 'node-type', type: 'string' },
    { name: 'kind', type: 'string' },
    { name: 'pattern', type: 'string' },
    { name: 'mode', type: 'string' },
    { name: 'case-sensitive', type: 'boolean' },
    { name: 'query-json', type: 'string' },
    { name: 'query-file', type: 'string' },
    { name: 'within-json', type: 'string' },
    { name: 'within-file', type: 'string' },
  ],
  'doc.getNode': [{ name: 'address-file', type: 'string' }],
  'doc.lists.get': [{ name: 'address-file', type: 'string' }],
  'doc.lists.list': [
    { name: 'kind', type: 'string' },
    { name: 'level', type: 'number' },
    { name: 'ordinal', type: 'number' },
    { name: 'query-json', type: 'string' },
    { name: 'query-file', type: 'string' },
    { name: 'within-json', type: 'string' },
    { name: 'within-file', type: 'string' },
  ],
  'doc.create.paragraph': [
    { name: 'input-file', type: 'string' },
    { name: 'text', type: 'string' },
    { name: 'at', type: 'string' },
    { name: 'at-json', type: 'string' },
    { name: 'at-file', type: 'string' },
    { name: 'before-address-json', type: 'string' },
    { name: 'before-address-file', type: 'string' },
    { name: 'after-address-json', type: 'string' },
    { name: 'after-address-file', type: 'string' },
    { name: 'tracked', type: 'boolean' },
    { name: 'direct', type: 'boolean' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Shell-accurate tokenization of a CLI example string.
 * Handles single-quoted JSON payloads and double-quoted strings.
 * Single quotes are stripped (as a shell would) so the parser sees raw values.
 */
function shellTokenize(example: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < example.length; i++) {
    const ch = example[i]!;

    if (ch === '\\' && !inSingleQuote && i + 1 < example.length) {
      current += example[i + 1];
      i++;
      continue;
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      // Shell strips single quotes — don't include them in output
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      // Shell strips double quotes
      continue;
    }

    if (ch === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}

/** Builds the full option spec array for a CLI operation, combining static + wrapper extras. */
function buildFullOptionSpecs(operationId: string): OptionSpec[] {
  const staticSpecs = CLI_OPERATION_OPTION_SPECS[operationId as CliOperationId] ?? [];
  const wrapperSpecs = WRAPPER_EXTRA_SPECS[operationId] ?? [];

  const seen = new Set<string>();
  const merged: OptionSpec[] = [];
  for (const spec of [...staticSpecs, ...wrapperSpecs]) {
    if (seen.has(spec.name)) continue;
    seen.add(spec.name);
    merged.push(spec);
  }
  if (!seen.has('help')) merged.push({ name: 'help', type: 'boolean' });
  return merged;
}

/**
 * Strips `superdoc` prefix and command tokens from a tokenized example,
 * returning only the flag tokens that would be passed to `parseCommandArgs`.
 */
function stripCommandPrefix(tokens: string[], commandTokens: readonly string[]): string[] {
  const rest = [...tokens];
  if (rest[0] === 'superdoc') rest.shift();
  for (const ct of commandTokens) {
    if (rest.length > 0 && rest[0] === ct) rest.shift();
  }
  return rest;
}

/**
 * Validates that every --*-json flag value in the parsed options is valid JSON.
 * Returns an array of error descriptions (empty = all valid).
 */
function validateJsonPayloads(options: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const [flag, value] of Object.entries(options)) {
    if (!flag.endsWith('-json') || value == null) continue;
    const raw = typeof value === 'string' ? value : String(value);
    try {
      JSON.parse(raw);
    } catch {
      errors.push(`--${flag}: invalid JSON`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DOC_COMMAND_EXAMPLES parse through real CLI parser', () => {
  for (const [docApiId, examples] of Object.entries(DOC_COMMAND_EXAMPLES)) {
    const cliOpId = `doc.${docApiId}`;
    const commandSpec = CLI_COMMAND_SPECS.find((s) => s.operationId === cliOpId && !s.alias);
    const fullSpecs = buildFullOptionSpecs(cliOpId);

    for (const example of examples) {
      test(`${docApiId}: ${example.slice(0, 80)}...`, () => {
        expect(commandSpec).toBeDefined();

        // 1. Tokenize like a shell
        const allTokens = shellTokenize(example);

        // 2. Strip superdoc + command tokens
        const flagTokens = stripCommandPrefix(allTokens, commandSpec!.tokens);

        // 3. Parse through the real CLI parser
        const parsed = parseCommandArgs(flagTokens, fullSpecs);

        // 4. Validate: no unknown flags, no type errors
        expect(parsed.unknown).toEqual([]);
        expect(parsed.errors).toEqual([]);

        // ensureValidArgs would throw on unknown/errors — verify it doesn't
        expect(() => ensureValidArgs(parsed)).not.toThrow();

        // 5. Validate JSON payloads are syntactically valid
        const jsonErrors = validateJsonPayloads(parsed.options);
        expect(jsonErrors).toEqual([]);
      });
    }
  }
});

describe('CLI_HELPER_COMMANDS examples parse through real CLI parser', () => {
  for (const helper of CLI_HELPER_COMMANDS) {
    const helperKey = helper.tokens.join(' ');
    const helperSpec = CLI_COMMAND_SPECS.find((s) => s.key === helperKey);

    // Build full option specs: canonical op + wrapper extras + helper extras
    const canonicalOpId = `doc.${helper.canonicalOperationId}` as CliOperationId;
    const canonicalSpecs = CLI_OPERATION_OPTION_SPECS[canonicalOpId] ?? [];
    const wrapperSpecs = WRAPPER_EXTRA_SPECS[canonicalOpId] ?? [];
    const helperExtras: OptionSpec[] = (helper.extraOptionSpecs ?? []).map((s) => ({
      name: s.name,
      type: s.type as 'string' | 'number' | 'boolean',
    }));

    const seen = new Set<string>();
    const fullSpecs: OptionSpec[] = [];
    for (const spec of [...canonicalSpecs, ...wrapperSpecs, ...helperExtras]) {
      if (seen.has(spec.name)) continue;
      seen.add(spec.name);
      fullSpecs.push(spec);
    }
    if (!seen.has('help')) fullSpecs.push({ name: 'help', type: 'boolean' });

    for (const example of helper.examples) {
      test(`helper ${helperKey}: ${example.slice(0, 80)}...`, () => {
        expect(helperSpec).toBeDefined();

        const allTokens = shellTokenize(example);
        const flagTokens = stripCommandPrefix(allTokens, helper.tokens);

        const parsed = parseCommandArgs(flagTokens, fullSpecs);

        expect(parsed.unknown).toEqual([]);
        expect(parsed.errors).toEqual([]);
        expect(() => ensureValidArgs(parsed)).not.toThrow();

        const jsonErrors = validateJsonPayloads(parsed.options);
        expect(jsonErrors).toEqual([]);
      });
    }
  }
});
