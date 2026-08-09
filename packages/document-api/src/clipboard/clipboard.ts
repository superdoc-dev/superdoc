import { DocumentApiValidationError } from '../errors.js';
import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import type {
  ClipboardInsertInput,
  ClipboardInsertResult,
  ClipboardParseOptions,
  ClipboardParseResult,
  ClipboardPayload,
  ClipboardSerializeInput,
  ClipboardSerializeResult,
} from '../types/clipboard.js';

export interface ClipboardApi {
  parse(payload: ClipboardPayload, options?: ClipboardParseOptions): ClipboardParseResult;
  insert(input: ClipboardInsertInput, options?: MutationOptions): ClipboardInsertResult;
  serializeSelection(input?: ClipboardSerializeInput): ClipboardSerializeResult;
}

export type ClipboardAdapter = ClipboardApi;

export function executeClipboardParse(
  adapter: ClipboardAdapter,
  payload: ClipboardPayload,
  options?: ClipboardParseOptions,
): ClipboardParseResult {
  validateClipboardPayload(payload, 'clipboard.parse');
  return adapter.parse(payload, options);
}

export function executeClipboardInsert(
  adapter: ClipboardAdapter,
  input: ClipboardInsertInput,
  options?: MutationOptions,
): ClipboardInsertResult {
  if (!input || typeof input !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'clipboard.insert requires an input object.');
  }
  const sourceCount =
    Number(input.payload !== undefined) + Number(input.plan !== undefined) + Number(input.fragment !== undefined);
  if (sourceCount !== 1) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'clipboard.insert requires exactly one of payload, plan, or fragment.',
    );
  }
  if (input.payload !== undefined) validateClipboardPayload(input.payload, 'clipboard.insert');
  if (input.plan !== undefined) validateClipboardPlan(input.plan, 'clipboard.insert');
  if (input.fragment !== undefined) validatePasteFragment(input.fragment, 'clipboard.insert');
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeClipboardSerializeSelection(
  adapter: ClipboardAdapter,
  input?: ClipboardSerializeInput,
): ClipboardSerializeResult {
  if (input !== undefined && (!input || typeof input !== 'object')) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'clipboard.serializeSelection input must be an object when provided.',
    );
  }
  return adapter.serializeSelection(input);
}

function validateClipboardPayload(payload: ClipboardPayload, operationName: string): void {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} requires a ClipboardPayload with items.`);
  }
  for (const [index, item] of payload.items.entries()) {
    if (!item || typeof item !== 'object') {
      throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} item ${index} must be an object.`);
    }
    if (typeof item.type !== 'string' || item.type.length === 0) {
      throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} item ${index} requires a MIME type.`);
    }
    if (item.kind !== 'string' && item.kind !== 'bytes') {
      throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} item ${index} has an invalid kind.`);
    }
    if (item.kind === 'string' && typeof item.data !== 'string') {
      throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} item ${index} requires string data.`);
    }
    if (item.kind === 'bytes' && !(item.data instanceof Uint8Array)) {
      throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} item ${index} requires Uint8Array data.`);
    }
  }
}

function validateClipboardPlan(plan: ClipboardInsertInput['plan'], operationName: string): void {
  if (!plan || typeof plan !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} plan must be an object.`);
  }
  validatePasteFragment(plan.fragment, operationName);
  if (!Array.isArray(plan.diagnostics)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} plan.diagnostics must be an array.`);
  }
}

function validatePasteFragment(fragment: ClipboardInsertInput['fragment'], operationName: string): void {
  if (!fragment || typeof fragment !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} fragment must be an object.`);
  }
  if (!Array.isArray(fragment.blocks)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} fragment.blocks must be an array.`);
  }
}
