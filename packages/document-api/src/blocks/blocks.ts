import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import type {
  BlocksDeleteInput,
  BlocksDeleteResult,
  BlocksListInput,
  BlocksListResult,
  BlocksDeleteRangeInput,
  BlocksDeleteRangeResult,
  BlocksMergeInput,
  BlocksMergeResult,
  BlocksMoveInput,
  BlocksMoveResult,
  BlocksSplitInput,
  BlocksSplitResult,
} from '../types/blocks.types.js';
import { BLOCK_NODE_TYPES, DELETABLE_BLOCK_NODE_TYPES } from '../types/base.js';
import { storyLocatorToKey, type StoryLocator } from '../types/story.types.js';
import { DocumentApiValidationError } from '../errors.js';
import { validateStoryLocator } from '../validation/story-validator.js';
// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------
export interface BlocksApi {
  list(input?: BlocksListInput): BlocksListResult;
  delete(input: BlocksDeleteInput, options?: MutationOptions): BlocksDeleteResult;
  deleteRange(input: BlocksDeleteRangeInput, options?: MutationOptions): BlocksDeleteRangeResult;
  /** Split a paragraph at a visible-text offset. */
  split(input: BlocksSplitInput, options?: MutationOptions): BlocksSplitResult;
  /** Merge two adjacent paragraphs in the same story. */
  merge(input: BlocksMergeInput, options?: MutationOptions): BlocksMergeResult;
  /** Move a paragraph within the same story. */
  move(input: BlocksMoveInput, options?: MutationOptions): BlocksMoveResult;
}
export interface BlocksAdapter {
  list(input?: BlocksListInput): BlocksListResult;
  delete(input: BlocksDeleteInput, options?: MutationOptions): BlocksDeleteResult;
  deleteRange(input: BlocksDeleteRangeInput, options?: MutationOptions): BlocksDeleteRangeResult;
  /** Structural block operations. Engines that don't support them
   * may reject with CAPABILITY_UNAVAILABLE. */
  split?(input: BlocksSplitInput, options?: MutationOptions): BlocksSplitResult;
  merge?(input: BlocksMergeInput, options?: MutationOptions): BlocksMergeResult;
  move?(input: BlocksMoveInput, options?: MutationOptions): BlocksMoveResult;
}
// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------
const SUPPORTED_DELETE_NODE_TYPES = new Set<string>(DELETABLE_BLOCK_NODE_TYPES);
const REJECTED_DELETE_NODE_TYPES = new Set(['tableRow', 'tableCell']);
const VALID_BLOCK_NODE_TYPES = new Set<string>(BLOCK_NODE_TYPES);
const BODY_STORY_LOCATOR: StoryLocator = { kind: 'story', storyType: 'body' };
// ---------------------------------------------------------------------------
// blocks.list validation
// ---------------------------------------------------------------------------
function normalizeBlocksListInput(input?: BlocksListInput): BlocksListInput | undefined {
  if (!input) return input;
  // Treat limit=0 as "all blocks" (same as omitting)
  if (input.limit != null && input.limit === 0) {
    const { limit: _, ...rest } = input;
    input = Object.keys(rest).length > 0 ? rest : undefined;
    if (!input) return input;
  }
  // Treat empty nodeTypes array as "no filter" (same as omitting)
  if (Array.isArray(input.nodeTypes) && input.nodeTypes.length === 0) {
    const { nodeTypes: _, ...rest } = input;
    input = Object.keys(rest).length > 0 ? rest : undefined;
    if (!input) return input;
  }
  return input;
}
function validateBlocksListInput(input?: BlocksListInput): void {
  if (!input) return;
  validateStoryLocator(input.in, 'in');
  if (input.offset != null && (typeof input.offset !== 'number' || input.offset < 0)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.list offset must be a non-negative number.', {
      fields: ['offset'],
    });
  }
  if (input.limit != null && (typeof input.limit !== 'number' || input.limit < 1)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.list limit must be a positive number.', {
      fields: ['limit'],
    });
  }
  if (input.nodeTypes != null) {
    if (!Array.isArray(input.nodeTypes) || input.nodeTypes.length === 0) {
      throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.list nodeTypes must be a non-empty array.', {
        fields: ['nodeTypes'],
      });
    }
    for (const nt of input.nodeTypes) {
      if (!VALID_BLOCK_NODE_TYPES.has(nt)) {
        throw new DocumentApiValidationError('INVALID_INPUT', `blocks.list nodeTypes contains unknown type "${nt}".`, {
          fields: ['nodeTypes'],
          nodeType: nt,
        });
      }
    }
  }
  if (input.includeText != null && typeof input.includeText !== 'boolean') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.list includeText must be a boolean.', {
      fields: ['includeText'],
    });
  }
  validateStoryLocator(input.in, 'in');
}
// ---------------------------------------------------------------------------
// blocks.delete validation
// ---------------------------------------------------------------------------
function validateBlocksDeleteInput(input: BlocksDeleteInput): void {
  if (!input || typeof input !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.delete requires an input object.', {
      fields: ['input'],
    });
  }
  if (!input.target) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.delete requires a target.', {
      fields: ['target'],
    });
  }
  if (input.target.kind !== 'block') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.delete target must have kind "block".', {
      fields: ['target.kind'],
    });
  }
  if (!input.target.nodeId || typeof input.target.nodeId !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.delete target requires a nodeId string.', {
      fields: ['target.nodeId'],
    });
  }
  validateStoryLocator(input.target.story, 'target.story');
  const { nodeType } = input.target;
  if (REJECTED_DELETE_NODE_TYPES.has(nodeType)) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `blocks.delete does not support "${nodeType}" targets. Table row/column operations are out of scope.`,
      { fields: ['target.nodeType'], nodeType },
    );
  }
  if (!SUPPORTED_DELETE_NODE_TYPES.has(nodeType)) {
    throw new DocumentApiValidationError('INVALID_TARGET', `blocks.delete does not support "${nodeType}" targets.`, {
      fields: ['target.nodeType'],
      nodeType,
    });
  }
}
// ---------------------------------------------------------------------------
// blocks.deleteRange validation
// ---------------------------------------------------------------------------
function validateBlockNodeAddress(address: unknown, label: string): void {
  if (!address || typeof address !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', `blocks.deleteRange requires a ${label} address.`, {
      fields: [label],
    });
  }
  const addr = address as Record<string, unknown>;
  if (addr.kind !== 'block') {
    throw new DocumentApiValidationError('INVALID_INPUT', `blocks.deleteRange ${label} must have kind "block".`, {
      fields: [`${label}.kind`],
    });
  }
  if (!addr.nodeId || typeof addr.nodeId !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', `blocks.deleteRange ${label} requires a nodeId string.`, {
      fields: [`${label}.nodeId`],
    });
  }
  if (!addr.nodeType || typeof addr.nodeType !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', `blocks.deleteRange ${label} requires a nodeType string.`, {
      fields: [`${label}.nodeType`],
    });
  }
  validateStoryLocator(addr.story, `${label}.story`);
}
function validateBlocksDeleteRangeStoryConsistency(input: BlocksDeleteRangeInput): void {
  const startStory = input.start.story ?? BODY_STORY_LOCATOR;
  const endStory = input.end.story ?? BODY_STORY_LOCATOR;
  const startKey = storyLocatorToKey(startStory);
  const endKey = storyLocatorToKey(endStory);
  if (startKey !== endKey) {
    throw new DocumentApiValidationError(
      'STORY_MISMATCH',
      `blocks.deleteRange start and end must target the same story (${startKey} vs ${endKey}).`,
      {
        startStory: startKey,
        endStory: endKey,
      },
    );
  }
}
function validateBlocksDeleteRangeInput(input: BlocksDeleteRangeInput): void {
  if (!input || typeof input !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.deleteRange requires an input object.', {
      fields: ['input'],
    });
  }
  validateBlockNodeAddress(input.start, 'start');
  validateBlockNodeAddress(input.end, 'end');
  validateBlocksDeleteRangeStoryConsistency(input);
}
// ---------------------------------------------------------------------------
// Execute functions
// ---------------------------------------------------------------------------
export function executeBlocksList(adapter: BlocksAdapter, input?: BlocksListInput): BlocksListResult {
  const normalized = normalizeBlocksListInput(input);
  validateBlocksListInput(normalized);
  return adapter.list(normalized);
}
export function executeBlocksDelete(
  adapter: BlocksAdapter,
  input: BlocksDeleteInput,
  options?: MutationOptions,
): BlocksDeleteResult {
  validateBlocksDeleteInput(input);
  return adapter.delete(input, normalizeMutationOptions(options));
}
export function executeBlocksDeleteRange(
  adapter: BlocksAdapter,
  input: BlocksDeleteRangeInput,
  options?: MutationOptions,
): BlocksDeleteRangeResult {
  validateBlocksDeleteRangeInput(input);
  return adapter.deleteRange(input, normalizeMutationOptions(options));
}
// ---------------------------------------------------------------------------
// blocks.split / blocks.merge / blocks.move validation
// ---------------------------------------------------------------------------
const PARAGRAPH_SHAPE_TYPES = new Set<string>(['paragraph', 'heading', 'listItem']);
function validateBlockNodeAddressParagraph(address: unknown, operationLabel: string, field: string): void {
  if (!address || typeof address !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationLabel} requires a ${field}.`, {
      fields: [field],
    });
  }
  const addr = address as Record<string, unknown>;
  if (addr.kind !== 'block') {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationLabel} ${field}.kind must be "block".`, {
      fields: [`${field}.kind`],
    });
  }
  if (!addr.nodeId || typeof addr.nodeId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `${operationLabel} ${field}.nodeId must be a non-empty string.`,
      { fields: [`${field}.nodeId`] },
    );
  }
  if (typeof addr.nodeType !== 'string' || !PARAGRAPH_SHAPE_TYPES.has(addr.nodeType)) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationLabel} ${field}.nodeType must be paragraph, heading, or listItem; got "${String(addr.nodeType)}".`,
      { fields: [`${field}.nodeType`] },
    );
  }
  validateStoryLocator(addr.story, `${field}.story`);
}
function validateBlocksSplitInput(input: BlocksSplitInput): void {
  if (!input || typeof input !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.split requires an input object.', {
      fields: ['input'],
    });
  }
  validateBlockNodeAddressParagraph(input.target, 'blocks.split', 'target');
  if (typeof input.offset !== 'number' || !Number.isInteger(input.offset) || input.offset < 0) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `blocks.split offset must be a non-negative integer, got ${JSON.stringify(input.offset)}.`,
      { fields: ['offset'] },
    );
  }
}
function validateBlocksMergeInput(input: BlocksMergeInput): void {
  if (!input || typeof input !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.merge requires an input object.', {
      fields: ['input'],
    });
  }
  validateBlockNodeAddressParagraph(input.first, 'blocks.merge', 'first');
  validateBlockNodeAddressParagraph(input.second, 'blocks.merge', 'second');
}
function validateBlocksMoveInput(input: BlocksMoveInput): void {
  if (!input || typeof input !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.move requires an input object.', {
      fields: ['input'],
    });
  }
  validateBlockNodeAddressParagraph(input.source, 'blocks.move', 'source');
  validateBlockNodeAddressParagraph(input.destination, 'blocks.move', 'destination');
  if (input.placement !== 'before' && input.placement !== 'after') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.move placement must be "before" or "after".', {
      fields: ['placement'],
    });
  }
}
function unavailableBlocksResult<TResult extends BlocksSplitResult | BlocksMergeResult | BlocksMoveResult>(
  operationName: string,
): TResult {
  return {
    success: false,
    failure: {
      code: 'CAPABILITY_UNAVAILABLE',
      message: `${operationName} is not available. The host engine has not provided an adapter for this capability.`,
      details: { operation: operationName },
    },
  } as TResult;
}
export function executeBlocksSplit(
  adapter: BlocksAdapter,
  input: BlocksSplitInput,
  options?: MutationOptions,
): BlocksSplitResult {
  validateBlocksSplitInput(input);
  if (!adapter.split) return unavailableBlocksResult<BlocksSplitResult>('blocks.split');
  return adapter.split(input, normalizeMutationOptions(options));
}
export function executeBlocksMerge(
  adapter: BlocksAdapter,
  input: BlocksMergeInput,
  options?: MutationOptions,
): BlocksMergeResult {
  validateBlocksMergeInput(input);
  if (!adapter.merge) return unavailableBlocksResult<BlocksMergeResult>('blocks.merge');
  return adapter.merge(input, normalizeMutationOptions(options));
}
export function executeBlocksMove(
  adapter: BlocksAdapter,
  input: BlocksMoveInput,
  options?: MutationOptions,
): BlocksMoveResult {
  validateBlocksMoveInput(input);
  if (!adapter.move) return unavailableBlocksResult<BlocksMoveResult>('blocks.move');
  return adapter.move(input, normalizeMutationOptions(options));
}
