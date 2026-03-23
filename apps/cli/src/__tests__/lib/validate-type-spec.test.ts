import { describe, expect, test } from 'bun:test';
import { validateValueAgainstTypeSpec } from '../../lib/operation-args';
import { CliError } from '../../lib/errors';
import type { CliTypeSpec } from '../../cli/types';

describe('validateValueAgainstTypeSpec – oneOf const enumeration', () => {
  const schema: CliTypeSpec = {
    oneOf: [
      { const: 'headerRow' },
      { const: 'lastRow' },
      { const: 'totalRow' },
      { const: 'firstColumn' },
      { const: 'lastColumn' },
      { const: 'bandedRows' },
      { const: 'bandedColumns' },
    ],
  };

  test('accepts a valid const value', () => {
    expect(() => validateValueAgainstTypeSpec('headerRow', schema, 'flag')).not.toThrow();
    expect(() => validateValueAgainstTypeSpec('bandedColumns', schema, 'flag')).not.toThrow();
  });

  test('accepts lastRow as a valid flag', () => {
    expect(() => validateValueAgainstTypeSpec('lastRow', schema, 'flag')).not.toThrow();
  });

  test('accepts totalRow as a deprecated alias', () => {
    expect(() => validateValueAgainstTypeSpec('totalRow', schema, 'flag')).not.toThrow();
  });

  test('rejects an invalid value and lists all allowed values', () => {
    try {
      validateValueAgainstTypeSpec('bogusFlag', schema, 'tables set-style-option:flag');
      throw new Error('Expected CliError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      const cliError = error as CliError;
      expect(cliError.code).toBe('VALIDATION_ERROR');
      expect(cliError.message).toBe(
        'tables set-style-option:flag must be one of: headerRow, lastRow, totalRow, firstColumn, lastColumn, bandedRows, bandedColumns.',
      );
    }
  });

  test('preserves per-variant errors in details', () => {
    try {
      validateValueAgainstTypeSpec('invalid', schema, 'flag');
      throw new Error('Expected CliError to be thrown');
    } catch (error) {
      const cliError = error as CliError;
      const details = cliError.details as { errors: string[] };
      expect(details.errors).toBeArrayOfSize(7);
    }
  });
});

describe('validateValueAgainstTypeSpec – oneOf with mixed schemas', () => {
  const mixedSchema: CliTypeSpec = {
    oneOf: [{ const: 'block' }, { type: 'object', properties: { kind: { const: 'inline' } }, required: ['kind'] }],
  };

  test('falls back to generic message when variants are not all const', () => {
    try {
      validateValueAgainstTypeSpec('nope', mixedSchema, 'target');
      throw new Error('Expected CliError to be thrown');
    } catch (error) {
      const cliError = error as CliError;
      expect(cliError.message).toBe('target must match one of the allowed schema variants.');
    }
  });
});

describe('validateValueAgainstTypeSpec – enum branch', () => {
  const enumSchema: CliTypeSpec = {
    type: 'string',
    enum: ['direct', 'tracked'],
  } as CliTypeSpec & { enum: string[] };

  test('accepts a valid enum value', () => {
    expect(() => validateValueAgainstTypeSpec('direct', enumSchema, 'changeMode')).not.toThrow();
  });

  test('rejects an invalid enum value with allowed list', () => {
    try {
      validateValueAgainstTypeSpec('bogus', enumSchema, 'changeMode');
      throw new Error('Expected CliError to be thrown');
    } catch (error) {
      const cliError = error as CliError;
      expect(cliError.message).toBe('changeMode must be one of: direct, tracked.');
    }
  });
});
