/**
 * Validation functions for `styles.apply` input.
 *
 * Walks the ValueSchema AST recursively — one function handles all depths.
 * Imports only from registry.ts.
 */

import { DocumentApiValidationError } from '../errors.js';
import { isRecord } from '../validation-primitives.js';
import type { ValueSchema, StylesChannel } from './registry.js';
import { PROPERTY_REGISTRY, ALLOWED_KEYS_BY_CHANNEL, EXCLUDED_KEYS, getPropertyDefinition } from './registry.js';

// ---------------------------------------------------------------------------
// Recursive ValueSchema validation
// ---------------------------------------------------------------------------

/**
 * Validates a value against a ValueSchema AST node.
 *
 * @param path - Dot-delimited path for error messages (e.g. "patch.borders.top.size")
 * @param value - The value to validate
 * @param schema - The schema to validate against
 */
export function validateValue(path: string, value: unknown, schema: ValueSchema): void {
  switch (schema.kind) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new DocumentApiValidationError('INVALID_INPUT', `${path} must be a boolean, got ${typeof value}.`, {
          field: path,
          value,
        });
      }
      return;

    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        throw new DocumentApiValidationError(
          'INVALID_INPUT',
          `${path} must be a finite integer, got ${JSON.stringify(value)}.`,
          { field: path, value },
        );
      }
      if (schema.min !== undefined && value < schema.min) {
        throw new DocumentApiValidationError('INVALID_INPUT', `${path} must be >= ${schema.min}, got ${value}.`, {
          field: path,
          value,
        });
      }
      if (schema.max !== undefined && value > schema.max) {
        throw new DocumentApiValidationError('INVALID_INPUT', `${path} must be <= ${schema.max}, got ${value}.`, {
          field: path,
          value,
        });
      }
      return;
    }

    case 'enum':
      if (typeof value !== 'string' || !schema.values.includes(value)) {
        throw new DocumentApiValidationError(
          'INVALID_INPUT',
          `${path} must be one of: ${schema.values.join(', ')}. Got ${JSON.stringify(value)}.`,
          { field: path, value },
        );
      }
      return;

    case 'string':
      if (typeof value !== 'string' || value.length === 0) {
        throw new DocumentApiValidationError(
          'INVALID_INPUT',
          `${path} must be a non-empty string, got ${JSON.stringify(value)}.`,
          { field: path, value },
        );
      }
      return;

    case 'object':
      validateObjectValue(path, value, schema.children);
      return;

    case 'array':
      validateArrayValue(path, value, schema.item);
      return;
  }
}

function validateObjectValue(path: string, value: unknown, children: Record<string, ValueSchema>): void {
  if (!isRecord(value)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${path} must be a non-null object, got ${typeof value}.`, {
      field: path,
      value,
    });
  }

  const allowedKeys = new Set(Object.keys(children));
  const keys = Object.keys(value);

  if (keys.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${path} must include at least one property.`, {
      field: path,
    });
  }

  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown key "${key}" on ${path}. Allowed keys: ${[...allowedKeys].join(', ')}.`,
        { field: path, key },
      );
    }
    validateValue(`${path}.${key}`, value[key], children[key]);
  }
}

function validateArrayValue(path: string, value: unknown, itemSchema: ValueSchema): void {
  if (!Array.isArray(value)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${path} must be an array, got ${typeof value}.`, {
      field: path,
      value,
    });
  }

  // Empty arrays are legal (e.g. tabStops: [] means "clear all")
  for (let i = 0; i < value.length; i++) {
    validateValue(`${path}[${i}]`, value[i], itemSchema);
  }
}

// ---------------------------------------------------------------------------
// Top-level input / options validation
// ---------------------------------------------------------------------------

export type StylesApplyInputShape = {
  target: { scope: 'docDefaults'; channel: StylesChannel };
  patch: Record<string, unknown>;
};

const INPUT_ALLOWED_KEYS = new Set(['target', 'patch']);
const TARGET_ALLOWED_KEYS = new Set(['scope', 'channel']);
const OPTIONS_ALLOWED_KEYS = new Set(['dryRun', 'expectedRevision']);
const VALID_CHANNELS = new Set<string>(['run', 'paragraph']);

export function validateStylesApplyInput(input: unknown): asserts input is StylesApplyInputShape {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'styles.apply input must be a non-null object.');
  }

  assertNoUnknownFields(input, INPUT_ALLOWED_KEYS);

  // --- Target ---
  const { target, patch } = input;

  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'styles.apply requires a target object.');
  }
  if (!isRecord(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a non-null object.', {
      field: 'target',
      value: target,
    });
  }

  assertNoUnknownFields(target, TARGET_ALLOWED_KEYS, 'target');

  if (target.scope !== 'docDefaults') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `target.scope must be "docDefaults", got ${JSON.stringify(target.scope)}.`,
      { field: 'target.scope', value: target.scope },
    );
  }
  if (!VALID_CHANNELS.has(target.channel as string)) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `target.channel must be "run" or "paragraph", got ${JSON.stringify(target.channel)}.`,
      { field: 'target.channel', value: target.channel },
    );
  }

  const channel = target.channel as StylesChannel;

  // --- Patch ---
  if (patch === undefined || patch === null) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'styles.apply requires a patch object.');
  }
  if (!isRecord(patch)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'patch must be a non-null object.', {
      field: 'patch',
      value: patch,
    });
  }

  const patchKeys = Object.keys(patch);
  if (patchKeys.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'patch must include at least one property.');
  }

  const allowedKeys = ALLOWED_KEYS_BY_CHANNEL[channel];
  const otherChannel: StylesChannel = channel === 'run' ? 'paragraph' : 'run';

  for (const key of patchKeys) {
    // 1. Check excluded keys first
    const excludedEntry = EXCLUDED_KEYS[channel].get(key);
    if (excludedEntry !== undefined) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `patch key '${key}' is not valid in Word docDefaults (${excludedEntry}). This is an intentional restriction per MS-OI29500.`,
        { field: 'patch', key, reason: 'excluded_docdefaults_key' },
      );
    }

    // 2. Check cross-channel
    if (!allowedKeys.has(key)) {
      const belongsToOther = ALLOWED_KEYS_BY_CHANNEL[otherChannel].has(key);
      if (belongsToOther) {
        throw new DocumentApiValidationError(
          'INVALID_INPUT',
          `Unknown patch key "${key}" for channel "${channel}". "${key}" is a ${otherChannel}-channel property. Allowed keys: ${[...allowedKeys].join(', ')}.`,
          { field: 'patch', key },
        );
      }

      // 3. Check excluded on other channel
      const otherExcluded = EXCLUDED_KEYS[otherChannel].get(key);
      if (otherExcluded !== undefined) {
        throw new DocumentApiValidationError(
          'INVALID_INPUT',
          `patch key '${key}' is not valid in Word docDefaults (${otherExcluded}). This is an intentional restriction per MS-OI29500.`,
          { field: 'patch', key, reason: 'excluded_docdefaults_key' },
        );
      }

      // 4. Completely unknown
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown patch key "${key}" for channel "${channel}". Allowed keys: ${[...allowedKeys].join(', ')}.`,
        { field: 'patch', key },
      );
    }

    // Validate the value against the registry schema
    const def = getPropertyDefinition(key, channel);
    if (def) validateValue(`patch.${key}`, patch[key], def.schema);
  }
}

export function validateStylesApplyOptions(options: unknown): void {
  if (options === undefined || options === null) return;

  if (!isRecord(options)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'styles.apply options must be a non-null object.');
  }

  for (const key of Object.keys(options)) {
    if (!OPTIONS_ALLOWED_KEYS.has(key)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown options key "${key}". Allowed keys: ${[...OPTIONS_ALLOWED_KEYS].join(', ')}.`,
        { field: 'options', key },
      );
    }
  }

  if (options.dryRun !== undefined && typeof options.dryRun !== 'boolean') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'options.dryRun must be a boolean.', {
      field: 'options.dryRun',
      value: options.dryRun,
    });
  }

  if (options.expectedRevision !== undefined && typeof options.expectedRevision !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'options.expectedRevision must be a string.', {
      field: 'options.expectedRevision',
      value: options.expectedRevision,
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function assertNoUnknownFields(obj: Record<string, unknown>, allowlist: ReadonlySet<string>, prefix?: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowlist.has(key)) {
      const location = prefix ? `${prefix}.${key}` : key;
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown field "${location}" on styles.apply input. Allowed fields: ${[...allowlist].join(', ')}.`,
        { field: location },
      );
    }
  }
}
