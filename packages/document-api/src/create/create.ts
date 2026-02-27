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
import type {
  CreateSectionBreakInput,
  CreateSectionBreakResult,
  SectionBreakCreateLocation,
  SectionBreakType,
} from '../sections/sections.types.js';
import { DocumentApiValidationError } from '../errors.js';

export interface CreateApi {
  paragraph(input: CreateParagraphInput, options?: MutationOptions): CreateParagraphResult;
  heading(input: CreateHeadingInput, options?: MutationOptions): CreateHeadingResult;
  table(input: CreateTableInput, options?: MutationOptions): CreateTableResult;
  sectionBreak(input: CreateSectionBreakInput, options?: MutationOptions): CreateSectionBreakResult;
}

export type CreateAdapter = CreateApi;

/**
 * Validates target-only create locations (paragraph, heading, section break)
 * when `before`/`after` is used.
 * These operations require `at.target` and do not accept `at.nodeId`.
 */
function validateTargetOnlyCreateLocation(
  at: ParagraphCreateLocation | HeadingCreateLocation | SectionBreakCreateLocation,
  operationName: string,
): void {
  if (at.kind !== 'before' && at.kind !== 'after') return;

  const loc = at as { kind: string; target?: unknown; nodeId?: unknown };
  if (loc.nodeId !== undefined) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} does not support at.nodeId. Use at.target for before/after placement.`,
      { field: 'at.nodeId' },
    );
  }

  if (loc.target === undefined) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} with at.kind="${at.kind}" requires at.target.`,
      { field: 'at.target' },
    );
  }
}

/**
 * Validates create locations that support either `at.target` or `at.nodeId`
 * when `before`/`after` is used.
 */
function validateTargetOrNodeIdCreateLocation(at: TableCreateLocation, operationName: string): void {
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

const SECTION_BREAK_TYPES: readonly SectionBreakType[] = ['continuous', 'nextPage', 'evenPage', 'oddPage'] as const;

function normalizeSectionBreakCreateLocation(location?: SectionBreakCreateLocation): SectionBreakCreateLocation {
  return location ?? { kind: 'documentEnd' };
}

function validateMarginValue(field: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${field} must be a non-negative number.`, {
      field,
      value,
    });
  }
}

function validateCreateSectionBreakInput(input: CreateSectionBreakInput): void {
  if (input.breakType !== undefined && !SECTION_BREAK_TYPES.includes(input.breakType)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `create.sectionBreak breakType must be one of: ${SECTION_BREAK_TYPES.join(', ')}.`,
      { field: 'breakType', value: input.breakType },
    );
  }

  if (input.pageMargins) {
    const { top, right, bottom, left, gutter } = input.pageMargins;
    if (top !== undefined) validateMarginValue('pageMargins.top', top);
    if (right !== undefined) validateMarginValue('pageMargins.right', right);
    if (bottom !== undefined) validateMarginValue('pageMargins.bottom', bottom);
    if (left !== undefined) validateMarginValue('pageMargins.left', left);
    if (gutter !== undefined) validateMarginValue('pageMargins.gutter', gutter);
  }

  if (input.headerFooterMargins) {
    const { header, footer } = input.headerFooterMargins;
    if (header !== undefined) validateMarginValue('headerFooterMargins.header', header);
    if (footer !== undefined) validateMarginValue('headerFooterMargins.footer', footer);
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
  validateTargetOnlyCreateLocation(normalized.at!, 'create.paragraph');
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
  validateTargetOnlyCreateLocation(normalized.at!, 'create.heading');
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
  validateTargetOrNodeIdCreateLocation(normalized.at!, 'create.table');
  return adapter.table(normalized, normalizeMutationOptions(options));
}

export function normalizeCreateSectionBreakInput(input: CreateSectionBreakInput): CreateSectionBreakInput {
  return {
    at: normalizeSectionBreakCreateLocation(input.at),
    breakType: input.breakType,
    pageMargins: input.pageMargins,
    headerFooterMargins: input.headerFooterMargins,
  };
}

export function executeCreateSectionBreak(
  adapter: CreateAdapter,
  input: CreateSectionBreakInput,
  options?: MutationOptions,
): CreateSectionBreakResult {
  const normalized = normalizeCreateSectionBreakInput(input);
  validateTargetOnlyCreateLocation(normalized.at!, 'create.sectionBreak');
  validateCreateSectionBreakInput(normalized);
  return adapter.sectionBreak(normalized, normalizeMutationOptions(options));
}
