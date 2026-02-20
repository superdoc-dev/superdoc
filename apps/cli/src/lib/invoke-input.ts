/**
 * Extracts the API-level input from the CLI input object.
 *
 * The CLI wrapper parsing produces objects that mix API-level fields with
 * CLI-level fields (doc, sessionId, out, force, etc.). Some operations wrap
 * their API input in a named field (query, address, input). Some operations
 * rename API field names for the CLI (commentId → id).
 *
 * This module strips CLI-level fields, unwraps operation-specific input
 * keys, and reverses param renames so that `invoke()` receives the correct
 * input shape.
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
  'comments.add': { id: 'commentId' },
  'comments.edit': { id: 'commentId' },
  'comments.reply': { parentId: 'parentCommentId' },
  'comments.move': { id: 'commentId' },
  'comments.resolve': { id: 'commentId' },
  'comments.remove': { id: 'commentId' },
  'comments.setInternal': { id: 'commentId' },
  'comments.setActive': { id: 'commentId' },
  'comments.goTo': { id: 'commentId' },
  'comments.get': { id: 'commentId' },
};

/** Fields that belong to the CLI layer, not the document API. */
const CLI_LEVEL_KEYS = new Set(['doc', 'sessionId', 'out', 'dryRun', 'force', 'expectedRevision', 'changeMode']);

/**
 * Extracts the invoke-level input from a CLI input object.
 *
 * Returns the input that should be passed to `editor.doc.invoke({ input })`.
 */
export function extractInvokeInput(operationId: CliExposedOperationId, cliInput: Record<string, unknown>): unknown {
  const wrapperKey = WRAPPED_INPUT_KEY[operationId];
  if (wrapperKey && cliInput[wrapperKey] != null) {
    return cliInput[wrapperKey];
  }

  const renames = PARAM_RENAMES[operationId];
  const apiInput: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cliInput)) {
    if (CLI_LEVEL_KEYS.has(key)) continue;
    const apiKey = renames?.[key] ?? key;
    apiInput[apiKey] = value;
  }
  return apiInput;
}
