/**
 * `ranges.resolve` operation — deterministic range construction from
 * explicit document anchors.
 *
 * Validates input shape, then delegates to the RangeResolverAdapter
 * for ProseMirror-level resolution, ref encoding, and preview generation.
 */

import type { ResolveRangeInput, ResolveRangeOutput, RangeResolverAdapter, RangeAnchor } from './ranges.types.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, assertNoUnknownFields } from '../validation-primitives.js';
import { isSelectionPoint } from '../validation/selection-target-validator.js';
import { validateStoryLocator } from '../validation/story-validator.js';

// ---------------------------------------------------------------------------
// Anchor validation
// ---------------------------------------------------------------------------

const VALID_DOCUMENT_EDGES: ReadonlySet<string> = new Set(['start', 'end']);
const VALID_REF_BOUNDARIES: ReadonlySet<string> = new Set(['start', 'end']);
const VALID_ANCHOR_KINDS: ReadonlySet<string> = new Set(['document', 'point', 'ref']);

function validateAnchor(value: unknown, fieldName: string): asserts value is RangeAnchor {
  if (!isRecord(value)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${fieldName} must be a non-null object.`, {
      field: fieldName,
    });
  }

  if (typeof value.kind !== 'string' || !VALID_ANCHOR_KINDS.has(value.kind)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `${fieldName}.kind must be "document", "point", or "ref", got ${JSON.stringify(value.kind)}.`,
      { field: `${fieldName}.kind`, value: value.kind },
    );
  }

  switch (value.kind) {
    case 'document':
      if (typeof value.edge !== 'string' || !VALID_DOCUMENT_EDGES.has(value.edge)) {
        throw new DocumentApiValidationError(
          'INVALID_INPUT',
          `${fieldName}.edge must be "start" or "end", got ${JSON.stringify(value.edge)}.`,
          { field: `${fieldName}.edge`, value: value.edge },
        );
      }
      break;

    case 'point':
      if (!isSelectionPoint(value.point)) {
        throw new DocumentApiValidationError('INVALID_INPUT', `${fieldName}.point must be a valid SelectionPoint.`, {
          field: `${fieldName}.point`,
          value: value.point,
        });
      }
      break;

    case 'ref':
      if (typeof value.ref !== 'string' || value.ref === '') {
        throw new DocumentApiValidationError('INVALID_INPUT', `${fieldName}.ref must be a non-empty string.`, {
          field: `${fieldName}.ref`,
          value: value.ref,
        });
      }
      if (typeof value.boundary !== 'string' || !VALID_REF_BOUNDARIES.has(value.boundary)) {
        throw new DocumentApiValidationError(
          'INVALID_INPUT',
          `${fieldName}.boundary must be "start" or "end", got ${JSON.stringify(value.boundary)}.`,
          { field: `${fieldName}.boundary`, value: value.boundary },
        );
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const RESOLVE_RANGE_ALLOWED_KEYS = new Set(['start', 'end', 'expectedRevision', 'in']);

function validateResolveRangeInput(input: unknown): asserts input is ResolveRangeInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'ranges.resolve input must be a non-null object.');
  }

  assertNoUnknownFields(input, RESOLVE_RANGE_ALLOWED_KEYS, 'ranges.resolve');

  if (input.start === undefined) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'ranges.resolve input must provide "start".', {
      field: 'start',
    });
  }

  if (input.end === undefined) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'ranges.resolve input must provide "end".', {
      field: 'end',
    });
  }

  validateAnchor(input.start, 'start');
  validateAnchor(input.end, 'end');

  if (input.expectedRevision !== undefined && typeof input.expectedRevision !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `expectedRevision must be a string, got ${typeof input.expectedRevision}.`,
      { field: 'expectedRevision', value: input.expectedRevision },
    );
  }

  validateStoryLocator(input.in, 'in');
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export function executeResolveRange(adapter: RangeResolverAdapter, input: ResolveRangeInput): ResolveRangeOutput {
  validateResolveRangeInput(input);
  return adapter.resolve(input);
}
