/**
 * Extracts the API-level input from the CLI input object.
 *
 * The CLI wrapper parsing produces objects that mix API-level fields with
 * CLI-level fields (doc, sessionId, out, force, etc.). Some operations wrap
 * their API input in a named field (query, address, input). Some operations
 * rename API field names for the CLI (commentId → id).
 *
 * This module strips CLI-level fields, unwraps operation-specific input
 * keys, reverses param renames, and normalizes flat flags (blockId, start,
 * end, nodeId, offset) into canonical `target` objects so that `invoke()`
 * receives the correct input shape.
 */

import type { CliExposedOperationId } from '../cli/operation-set.js';

/**
 * Operations whose API input is wrapped in a named field on the CLI input object.
 *
 * For example, the `find` wrapper produces `{ doc, sessionId, query: Query }`.
 * The API's `invoke('find', input)` expects the `Query` object directly as input,
 * so we extract `cliInput.query` as the invoke input.
 */
const WRAPPED_INPUT_KEY: Partial<Record<CliExposedOperationId, string>> = {
  find: 'query',
  getNode: 'address',
  'lists.list': 'query',
  'lists.insert': 'input',
  'lists.setType': 'input',
  'lists.indent': 'input',
  'lists.outdent': 'input',
  'lists.restart': 'input',
  'lists.exit': 'input',
  'create.paragraph': 'input',
  'create.heading': 'input',
};

/**
 * Reverse param name mapping: CLI param name → API field name.
 *
 * Derived from PARAM_FLAG_OVERRIDES in operation-params.ts.
 * The CLI renames certain API fields for user convenience (e.g. `commentId` → `id`).
 * We reverse these so `invoke()` receives the original API field names.
 */
const PARAM_RENAMES: Partial<Record<CliExposedOperationId, Record<string, string>>> = {
  getNodeById: { id: 'nodeId' },
  'comments.create': { parentId: 'parentCommentId' },
  'comments.patch': { id: 'commentId' },
  'comments.delete': { id: 'commentId' },
  'comments.get': { id: 'commentId' },
};

/** Fields that belong to the CLI layer, not the document API. */
const CLI_LEVEL_KEYS = new Set(['doc', 'sessionId', 'out', 'dryRun', 'force', 'expectedRevision', 'changeMode']);

/**
 * Operations where `changeMode` is part of the API input schema, not a CLI-level option.
 * For these, `changeMode` must NOT be stripped from the input.
 */
const CHANGEMODE_IN_INPUT = new Set<CliExposedOperationId>(['mutations.apply', 'mutations.preview']);

// ---------------------------------------------------------------------------
// Flat-flag → canonical target normalization
// ---------------------------------------------------------------------------

/**
 * Operations that accept a text-range target (textAddressSchema):
 *   target: { kind: 'text', blockId, range: { start, end } }
 *
 * When the CLI input has flat `blockId` + `start` + `end` but no `target`,
 * these are folded into a canonical target object.
 */
const TEXT_TARGET_OPERATIONS = new Set<CliExposedOperationId>([
  'replace',
  'delete',
  'format.apply',
  'format.fontSize',
  'format.fontFamily',
  'format.color',
  'format.align',
  'comments.create',
  'comments.patch',
]);

/**
 * Insert is a text-range operation but uses `offset` instead of `start`/`end`
 * to specify a zero-width insertion point.
 */
const INSERT_OPERATION: CliExposedOperationId = 'insert';

/**
 * List operations that accept a list-item target (listItemAddressSchema):
 *   target: { kind: 'block', nodeType: 'listItem', nodeId }
 */
const LIST_TARGET_OPERATIONS = new Set<CliExposedOperationId>([
  'lists.insert',
  'lists.setType',
  'lists.indent',
  'lists.outdent',
  'lists.restart',
  'lists.exit',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalizes flat CLI flags into canonical `target` objects.
 *
 * This runs AFTER extraction and renaming, BEFORE dispatch to the document-api.
 * If the input already contains a `target`, flat flags are left untouched (the
 * caller provided the canonical form directly).
 */
function normalizeFlatTargetFlags(operationId: CliExposedOperationId, apiInput: unknown): unknown {
  if (!isRecord(apiInput)) return apiInput;

  // Skip if target is already provided
  if (apiInput.target !== undefined) return apiInput;

  // --- Text-range operations (replace, delete, format.apply, comments.create, comments.patch) ---
  if (TEXT_TARGET_OPERATIONS.has(operationId)) {
    const blockId = apiInput.blockId;
    if (typeof blockId === 'string') {
      const start = typeof apiInput.start === 'number' ? apiInput.start : 0;
      const end = typeof apiInput.end === 'number' ? apiInput.end : 0;
      const { blockId: _, start: _s, end: _e, ...rest } = apiInput;
      return {
        ...rest,
        target: { kind: 'text', blockId, range: { start, end } },
      };
    }
    return apiInput;
  }

  // --- Insert operation (uses offset for zero-width insertion point) ---
  if (operationId === INSERT_OPERATION) {
    const blockId = apiInput.blockId;
    if (typeof blockId === 'string') {
      const offset = typeof apiInput.offset === 'number' ? apiInput.offset : 0;
      const { blockId: _, offset: _o, ...rest } = apiInput;
      return {
        ...rest,
        target: { kind: 'text', blockId, range: { start: offset, end: offset } },
      };
    }
    return apiInput;
  }

  // --- List operations (nodeId → listItem block target) ---
  if (LIST_TARGET_OPERATIONS.has(operationId)) {
    const nodeId = apiInput.nodeId;
    if (typeof nodeId === 'string') {
      const { nodeId: _, ...rest } = apiInput;
      return {
        ...rest,
        target: { kind: 'block', nodeType: 'listItem', nodeId },
      };
    }
    return apiInput;
  }

  return apiInput;
}

/**
 * Extracts the invoke-level input from a CLI input object.
 *
 * Returns the input that should be passed to `editor.doc.invoke({ input })`.
 * Flat CLI flags (blockId, start, end, nodeId, offset) are normalized into
 * canonical `target` objects before returning.
 */
export function extractInvokeInput(operationId: CliExposedOperationId, cliInput: Record<string, unknown>): unknown {
  const wrapperKey = WRAPPED_INPUT_KEY[operationId];
  if (wrapperKey && cliInput[wrapperKey] != null) {
    // Wrapped input may also contain flat flags that need normalization
    return normalizeFlatTargetFlags(operationId, cliInput[wrapperKey]);
  }

  const renames = PARAM_RENAMES[operationId];
  const apiInput: Record<string, unknown> = {};
  const keepChangeMode = CHANGEMODE_IN_INPUT.has(operationId);
  for (const [key, value] of Object.entries(cliInput)) {
    if (CLI_LEVEL_KEYS.has(key) && !(key === 'changeMode' && keepChangeMode)) continue;
    const apiKey = renames?.[key] ?? key;
    apiInput[apiKey] = value;
  }
  return normalizeFlatTargetFlags(operationId, apiInput);
}
