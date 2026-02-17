import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import type { CreateParagraphInput, CreateParagraphResult, ParagraphCreateLocation } from '../types/create.types.js';

export interface CreateApi {
  paragraph(input: CreateParagraphInput, options?: MutationOptions): CreateParagraphResult;
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
