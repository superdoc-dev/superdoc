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

export interface CreateApi {
  paragraph(input: CreateParagraphInput, options?: MutationOptions): CreateParagraphResult;
  heading(input: CreateHeadingInput, options?: MutationOptions): CreateHeadingResult;
}

export type CreateAdapter = CreateApi;

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
  return adapter.paragraph(normalizeCreateParagraphInput(input), normalizeMutationOptions(options));
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
  return adapter.heading(normalizeCreateHeadingInput(input), normalizeMutationOptions(options));
}
