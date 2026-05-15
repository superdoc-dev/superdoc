import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  CustomXmlPartsCreateInput,
  CustomXmlPartsCreateResult,
  CustomXmlPartsGetInput,
  CustomXmlPartsListInput,
  CustomXmlPartsListResult,
  CustomXmlPartsMutationResult,
  CustomXmlPartsPatchInput,
  CustomXmlPartsRemoveInput,
  CustomXmlPartInfo,
  CustomXmlPartTarget,
} from './customXml.types.js';

// ---------------------------------------------------------------------------
// Adapter / API interface
// ---------------------------------------------------------------------------

export interface CustomXmlPartsApi {
  list(query?: CustomXmlPartsListInput): CustomXmlPartsListResult;
  get(input: CustomXmlPartsGetInput): CustomXmlPartInfo | null;
  create(input: CustomXmlPartsCreateInput, options?: MutationOptions): CustomXmlPartsCreateResult;
  patch(input: CustomXmlPartsPatchInput, options?: MutationOptions): CustomXmlPartsMutationResult;
  remove(input: CustomXmlPartsRemoveInput, options?: MutationOptions): CustomXmlPartsMutationResult;
}

export type CustomXmlPartsAdapter = CustomXmlPartsApi;

export interface CustomXmlApi {
  parts: CustomXmlPartsApi;
}

export type CustomXmlAdapter = CustomXmlApi;

// ---------------------------------------------------------------------------
// Target validation
// ---------------------------------------------------------------------------

function validateTarget(target: unknown, operationName: string): asserts target is CustomXmlPartTarget {
  if (!target || typeof target !== 'object') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} requires a target with either { id } or { partName }.`,
      { target },
    );
  }
  const t = target as Record<string, unknown>;
  const hasId = typeof t.id === 'string' && t.id.length > 0;
  const hasPartName = typeof t.partName === 'string' && t.partName.length > 0;
  if (!hasId && !hasPartName) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must have a non-empty 'id' or 'partName'.`,
      { target },
    );
  }
  if (hasId && hasPartName) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must not provide both 'id' and 'partName'; choose one.`,
      { target },
    );
  }
}

// ---------------------------------------------------------------------------
// Content validation
// ---------------------------------------------------------------------------

/**
 * Lightweight well-formedness check for the Storage Part content. Catches
 * empty strings, non-strings, and obviously malformed XML (no root element).
 * Full XML parsing happens in the adapter; this is a fast boundary check
 * to keep adapter errors actionable.
 */
function validateContent(content: unknown, operationName: string): asserts content is string {
  if (typeof content !== 'string' || content.length === 0) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `${operationName} requires a non-empty 'content' string of well-formed XML.`,
      { contentType: typeof content },
    );
  }
  // Minimal smell-test: there must be at least one '<' starting an element.
  // The adapter does full parsing.
  if (!/<\s*[A-Za-z_]/.test(content)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `${operationName} 'content' does not contain a root XML element.`,
    );
  }
}

function validateSchemaRefs(schemaRefs: unknown, operationName: string): asserts schemaRefs is string[] {
  if (!Array.isArray(schemaRefs)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} 'schemaRefs' must be an array of strings.`);
  }
  for (const [i, entry] of schemaRefs.entries()) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `${operationName} 'schemaRefs[${i}]' must be a non-empty string.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers
// ---------------------------------------------------------------------------

export function executeCustomXmlPartsList(
  adapter: CustomXmlPartsAdapter,
  query?: CustomXmlPartsListInput,
): CustomXmlPartsListResult {
  if (query?.rootNamespace !== undefined && typeof query.rootNamespace !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `customXml.parts.list 'rootNamespace' must be a string when provided.`,
    );
  }
  if (query?.schemaRef !== undefined && typeof query.schemaRef !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `customXml.parts.list 'schemaRef' must be a string when provided.`,
    );
  }
  return adapter.list(query);
}

export function executeCustomXmlPartsGet(
  adapter: CustomXmlPartsAdapter,
  input: CustomXmlPartsGetInput,
): CustomXmlPartInfo | null {
  validateTarget(input.target, 'customXml.parts.get');
  return adapter.get(input);
}

export function executeCustomXmlPartsCreate(
  adapter: CustomXmlPartsAdapter,
  input: CustomXmlPartsCreateInput,
  options?: MutationOptions,
): CustomXmlPartsCreateResult {
  validateContent(input.content, 'customXml.parts.create');
  if (input.schemaRefs !== undefined) {
    validateSchemaRefs(input.schemaRefs, 'customXml.parts.create');
  }
  return adapter.create(input, normalizeMutationOptions(options));
}

export function executeCustomXmlPartsPatch(
  adapter: CustomXmlPartsAdapter,
  input: CustomXmlPartsPatchInput,
  options?: MutationOptions,
): CustomXmlPartsMutationResult {
  validateTarget(input.target, 'customXml.parts.patch');
  if (input.content === undefined && input.schemaRefs === undefined) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `customXml.parts.patch requires at least one of 'content' or 'schemaRefs'.`,
    );
  }
  if (input.content !== undefined) {
    validateContent(input.content, 'customXml.parts.patch');
  }
  if (input.schemaRefs !== undefined) {
    validateSchemaRefs(input.schemaRefs, 'customXml.parts.patch');
  }
  return adapter.patch(input, normalizeMutationOptions(options));
}

export function executeCustomXmlPartsRemove(
  adapter: CustomXmlPartsAdapter,
  input: CustomXmlPartsRemoveInput,
  options?: MutationOptions,
): CustomXmlPartsMutationResult {
  validateTarget(input.target, 'customXml.parts.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}
