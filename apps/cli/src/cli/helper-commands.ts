/**
 * CLI helper commands — convenience tokens that map to canonical operations
 * with pre-filled default arguments.
 *
 * Helper commands are NOT derived from OPERATION_DEFINITIONS. They exist
 * only in the CLI and SDK layers, providing familiar shortcuts like
 * `superdoc format bold` that route to `format.apply` with inline styles pre-filled.
 *
 * Each entry maps CLI tokens → canonical OperationId + default args to merge.
 * Helper commands route through the standard doc operation dispatch (read/mutation
 * orchestrator), not custom runners.
 */

import type { CliCommandSpec, CliCategory } from './types.js';

export interface CliHelperCommand {
  /** CLI command tokens (e.g., ['format', 'bold']). */
  tokens: readonly string[];
  /** The canonical operation this helper routes to. */
  canonicalOperationId: string;
  /** Default input fields merged into the parsed CLI input before dispatch. */
  defaultInput: Record<string, unknown>;
  /** Human-readable description shown in help text. */
  description: string;
  /** Help category for grouping in `superdoc --help`. */
  category: CliCategory;
  /** Whether this helper performs a mutation. */
  mutates: boolean;
  /** Example CLI invocations. */
  examples: readonly string[];
  /** Extra CLI option specs recognized by this helper but not in the canonical operation. */
  extraOptionSpecs?: readonly { name: string; type: 'string' | 'boolean' | 'number' }[];
  /** Post-parse transform that maps helper-specific flags into the canonical input shape. */
  inputTransform?: (input: Record<string, unknown>) => Record<string, unknown>;
}

/** Maps a flat `--id` flag to the `target: { id }` shape expected by trackChanges.decide. */
function mapIdToTarget(input: Record<string, unknown>): Record<string, unknown> {
  if (typeof input.id === 'string' && input.target === undefined) {
    const { id, ...rest } = input;
    return { ...rest, target: { id } };
  }
  return input;
}

/**
 * Format helper commands — map `format <mark>` to `format.apply` with pre-filled inline styles.
 * These keep `superdoc format bold|italic|underline|strikethrough` as ergonomic
 * shortcuts over the canonical `format.apply` contract operation.
 */
export const CLI_HELPER_COMMANDS: readonly CliHelperCommand[] = [
  // --- Format helpers (route to format.apply) ---
  {
    tokens: ['format', 'bold'],
    canonicalOperationId: 'format.apply',
    defaultInput: { inline: { bold: true } },
    description: 'Apply bold formatting to a text range.',
    category: 'format',
    mutates: true,
    examples: [
      'superdoc format bold --blockId p1 --start 0 --end 5',
      'superdoc format bold --target \'{"kind":"text","blockId":"p1","range":{"start":0,"end":5}}\'',
    ],
  },
  {
    tokens: ['format', 'italic'],
    canonicalOperationId: 'format.apply',
    defaultInput: { inline: { italic: true } },
    description: 'Apply italic formatting to a text range.',
    category: 'format',
    mutates: true,
    examples: ['superdoc format italic --blockId p1 --start 0 --end 5'],
  },
  {
    tokens: ['format', 'underline'],
    canonicalOperationId: 'format.apply',
    defaultInput: { inline: { underline: true } },
    description: 'Apply underline formatting to a text range.',
    category: 'format',
    mutates: true,
    examples: ['superdoc format underline --blockId p1 --start 0 --end 5'],
  },
  {
    tokens: ['format', 'strikethrough'],
    canonicalOperationId: 'format.apply',
    defaultInput: { inline: { strike: true } },
    description: 'Apply strikethrough formatting to a text range.',
    category: 'format',
    mutates: true,
    examples: ['superdoc format strikethrough --blockId p1 --start 0 --end 5'],
  },
  // --- Track-changes review helpers (route to trackChanges.decide) ---
  {
    tokens: ['track-changes', 'accept'],
    canonicalOperationId: 'trackChanges.decide',
    defaultInput: { decision: 'accept' },
    description: 'Accept a tracked change by ID.',
    category: 'trackChanges',
    mutates: true,
    examples: ['superdoc track-changes accept --id tc-1'],
    extraOptionSpecs: [{ name: 'id', type: 'string' }],
    inputTransform: mapIdToTarget,
  },
  {
    tokens: ['track-changes', 'reject'],
    canonicalOperationId: 'trackChanges.decide',
    defaultInput: { decision: 'reject' },
    description: 'Reject a tracked change by ID.',
    category: 'trackChanges',
    mutates: true,
    examples: ['superdoc track-changes reject --id tc-1'],
    extraOptionSpecs: [{ name: 'id', type: 'string' }],
    inputTransform: mapIdToTarget,
  },
  {
    tokens: ['track-changes', 'accept-all'],
    canonicalOperationId: 'trackChanges.decide',
    defaultInput: { decision: 'accept', target: { scope: 'all' } },
    description: 'Accept all tracked changes.',
    category: 'trackChanges',
    mutates: true,
    examples: ['superdoc track-changes accept-all'],
  },
  {
    tokens: ['track-changes', 'reject-all'],
    canonicalOperationId: 'trackChanges.decide',
    defaultInput: { decision: 'reject', target: { scope: 'all' } },
    description: 'Reject all tracked changes.',
    category: 'trackChanges',
    mutates: true,
    examples: ['superdoc track-changes reject-all'],
  },
  // --- Comment helpers (route to comments.create / comments.patch / comments.delete) ---
  {
    tokens: ['comments', 'add'],
    canonicalOperationId: 'comments.create',
    defaultInput: {},
    description: 'Add a new comment thread anchored to a text range.',
    category: 'comments',
    mutates: true,
    examples: [
      'superdoc comments add --target \'{"kind":"text","blockId":"p1","range":{"start":0,"end":5}}\' --text "Review this"',
    ],
  },
  {
    tokens: ['comments', 'reply'],
    canonicalOperationId: 'comments.create',
    defaultInput: {},
    description: 'Reply to an existing comment thread.',
    category: 'comments',
    mutates: true,
    examples: ['superdoc comments reply --parent-id c1 --text "Looks good"'],
  },
  {
    tokens: ['comments', 'edit'],
    canonicalOperationId: 'comments.patch',
    defaultInput: {},
    description: 'Edit the content of an existing comment.',
    category: 'comments',
    mutates: true,
    examples: ['superdoc comments edit --id c1 --text "Updated text"'],
  },
  {
    tokens: ['comments', 'move'],
    canonicalOperationId: 'comments.patch',
    defaultInput: {},
    description: 'Move a comment thread to a new anchor range.',
    category: 'comments',
    mutates: true,
    examples: [
      'superdoc comments move --id c1 --target \'{"kind":"text","blockId":"p2","range":{"start":0,"end":5}}\'',
    ],
  },
  {
    tokens: ['comments', 'resolve'],
    canonicalOperationId: 'comments.patch',
    defaultInput: { status: 'resolved' },
    description: 'Resolve a comment thread.',
    category: 'comments',
    mutates: true,
    examples: ['superdoc comments resolve --id c1'],
  },
  {
    tokens: ['comments', 'remove'],
    canonicalOperationId: 'comments.delete',
    defaultInput: {},
    description: 'Remove a comment by ID.',
    category: 'comments',
    mutates: true,
    examples: ['superdoc comments remove --id c1'],
  },
  {
    tokens: ['comments', 'set-internal'],
    canonicalOperationId: 'comments.patch',
    defaultInput: {},
    description: 'Toggle the internal (private) flag on a comment thread.',
    category: 'comments',
    mutates: true,
    examples: ['superdoc comments set-internal --id c1 --is-internal true'],
  },
];

/**
 * Builds CLI command specs from the helper command registry.
 * Helper specs route to the canonical operation but carry `defaultInput`
 * that gets merged into the CLI input before dispatch.
 */
export function buildHelperSpecs(): CliCommandSpec[] {
  return CLI_HELPER_COMMANDS.map((helper) => {
    const key = helper.tokens.join(' ');
    return {
      key,
      tokens: helper.tokens,
      operationId: `doc.${helper.canonicalOperationId}`,
      category: helper.category,
      description: helper.description,
      mutates: helper.mutates,
      requiresDocumentContext: true,
      alias: false,
      canonicalKey: key,
      examples: helper.examples,
      defaultInput: helper.defaultInput,
      extraOptionSpecs: helper.extraOptionSpecs,
      inputTransform: helper.inputTransform,
    };
  });
}
