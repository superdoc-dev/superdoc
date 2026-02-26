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
import type { CreateTableInput, CreateTableResult, TableCreateLocation } from '../types/table-operations.types.js';
import { DocumentApiValidationError } from '../errors.js';

export interface CreateApi {
  paragraph(input: CreateParagraphInput, options?: MutationOptions): CreateParagraphResult;
  heading(input: CreateHeadingInput, options?: MutationOptions): CreateHeadingResult;
  table(input: CreateTableInput, options?: MutationOptions): CreateTableResult;
}

export type CreateAdapter = CreateApi;

/**
 * Validates the `at` location for create operations when `before`/`after` is used.
 * Ensures either `target` or `nodeId` is provided.
 */
function validateCreateLocation(
  at: ParagraphCreateLocation | HeadingCreateLocation | TableCreateLocation,
  operationName: string,
): void {
  if (at.kind !== 'before' && at.kind !== 'after') return;

  const loc = at as { kind: string; target?: unknown; nodeId?: unknown };
  const hasTarget = loc.target !== undefined;
  const hasNodeId = loc.nodeId !== undefined;

  if (hasTarget && hasNodeId) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `Cannot combine at.target and at.nodeId for ${operationName}. Use exactly one locator mode.`,
      { fields: ['at.target', 'at.nodeId'] },
    );
  }

  if (!hasTarget && !hasNodeId) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} with at.kind="${at.kind}" requires at.target or at.nodeId.`,
      { fields: ['at.target', 'at.nodeId'] },
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

function normalizeTableCreateLocation(location?: TableCreateLocation): TableCreateLocation {
  return location ?? { kind: 'documentEnd' };
}

export function normalizeCreateTableInput(input: CreateTableInput): CreateTableInput {
  return {
    rows: input.rows,
    columns: input.columns,
    at: normalizeTableCreateLocation(input.at),
  };
}

export function executeCreateTable(
  adapter: CreateAdapter,
  input: CreateTableInput,
  options?: MutationOptions,
): CreateTableResult {
  const normalized = normalizeCreateTableInput(input);
  validateCreateLocation(normalized.at!, 'create.table');
  return adapter.table(normalized, normalizeMutationOptions(options));
}
