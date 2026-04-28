/**
 * `ranges.scrollIntoView` operation — scrolls the editor so the target
 * text range is visible. Handles paginated, virtualized layouts by mounting
 * the target page on demand.
 *
 * Primitive for custom sidebars (comments, track changes, mentions) that
 * need to navigate the document to a specific range on user interaction.
 */

import type { RangeScrollAdapter, ScrollIntoViewInput, ScrollIntoViewOutput } from './ranges.types.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, isTextTarget, assertNoUnknownFields } from '../validation-primitives.js';

const VALID_ENTITY_TYPES: ReadonlySet<string> = new Set(['comment', 'trackedChange']);

function isEntityAddress(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind !== 'entity') return false;
  if (typeof value.entityType !== 'string' || !VALID_ENTITY_TYPES.has(value.entityType)) return false;
  if (typeof value.entityId !== 'string' || value.entityId.length === 0) return false;
  return true;
}

const SCROLL_INTO_VIEW_ALLOWED_KEYS = new Set(['target', 'block', 'behavior']);
const VALID_BLOCK_VALUES: ReadonlySet<string> = new Set(['start', 'center', 'end', 'nearest']);
const VALID_BEHAVIOR_VALUES: ReadonlySet<string> = new Set(['auto', 'smooth']);

function validateScrollIntoViewInput(input: unknown): asserts input is ScrollIntoViewInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'ranges.scrollIntoView input must be a non-null object.');
  }

  assertNoUnknownFields(input, SCROLL_INTO_VIEW_ALLOWED_KEYS, 'ranges.scrollIntoView');

  const { target, block, behavior } = input;

  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'ranges.scrollIntoView requires a target.', {
      field: 'target',
    });
  }
  if (!isTextAddress(target) && !isTextTarget(target) && !isEntityAddress(target)) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'target must be a TextAddress, TextTarget, or EntityAddress object.',
      { field: 'target', value: target },
    );
  }

  if (block !== undefined && (typeof block !== 'string' || !VALID_BLOCK_VALUES.has(block))) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `block must be one of "start" | "center" | "end" | "nearest", got ${JSON.stringify(block)}.`,
      { field: 'block', value: block },
    );
  }

  if (behavior !== undefined && (typeof behavior !== 'string' || !VALID_BEHAVIOR_VALUES.has(behavior))) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `behavior must be "auto" or "smooth", got ${JSON.stringify(behavior)}.`,
      { field: 'behavior', value: behavior },
    );
  }
}

export async function executeScrollIntoView(
  adapter: RangeScrollAdapter,
  input: ScrollIntoViewInput,
): Promise<ScrollIntoViewOutput> {
  validateScrollIntoViewInput(input);
  return adapter.scrollIntoView(input);
}
