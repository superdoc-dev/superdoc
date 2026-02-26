import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import type {
  CreateParagraphInput,
  CreateParagraphResult,
  ParagraphCreateLocation,
  CreateHeadingInput,
  CreateHeadingResult,
  HeadingCreateLocation,
} from '../types/create.types.js';
import { DocumentApiValidationError } from '../errors.js';

export interface CreateApi {
  paragraph(input: CreateParagraphInput, options?: MutationOptions): CreateParagraphResult;
  heading(input: CreateHeadingInput, options?: MutationOptions): CreateHeadingResult;
}

export type CreateAdapter = CreateApi;

/**
 * Validates the `at` location for create operations when `before`/`after` is used.
 * Ensures `target` is provided.
 */
function validateCreateLocation(at: ParagraphCreateLocation | HeadingCreateLocation, operationName: string): void {
  if (at.kind !== 'before' && at.kind !== 'after') return;

  const loc = at as { kind: string; target?: unknown };
  if (loc.target === undefined) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} with at.kind="${at.kind}" requires at.target.`,
      { fields: ['at.target'] },
    );
  }
}

function normalizeParagraphCreateLocation(location?: ParagraphCreateLocation): ParagraphCreateLocation {
  return location ?? { kind: 'documentEnd' };
}

export function normalizeCreateParagraphInput(input: CreateParagraphInput): CreateParagraphInput {
  return {
    at: normalizeParagraphCreateLocation(input.at),
    text: input.text ?? '',
  };
}

export function executeCreateParagraph(
  adapter: CreateAdapter,
  input: CreateParagraphInput,
  options?: MutationOptions,
): CreateParagraphResult {
  const normalized = normalizeCreateParagraphInput(input);
  validateCreateLocation(normalized.at!, 'create.paragraph');
  return adapter.paragraph(normalized, normalizeMutationOptions(options));
}

function normalizeHeadingCreateLocation(location?: HeadingCreateLocation): HeadingCreateLocation {
  return location ?? { kind: 'documentEnd' };
}

export function normalizeCreateHeadingInput(input: CreateHeadingInput): CreateHeadingInput {
  return {
    level: input.level,
    at: normalizeHeadingCreateLocation(input.at),
    text: input.text ?? '',
  };
}

export function executeCreateHeading(
  adapter: CreateAdapter,
  input: CreateHeadingInput,
  options?: MutationOptions,
): CreateHeadingResult {
  const normalized = normalizeCreateHeadingInput(input);
  validateCreateLocation(normalized.at!, 'create.heading');
  return adapter.heading(normalized, normalizeMutationOptions(options));
}
