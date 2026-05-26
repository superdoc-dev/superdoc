import { describe, expect, test } from 'bun:test';
import { validateValueAgainstTypeSpec } from '../../lib/operation-args';
import { CliError } from '../../lib/errors';
import type { CliTypeSpec } from '../../cli/types';
import { CLI_OPERATION_METADATA } from '../../cli/operation-params';

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

describe('validateValueAgainstTypeSpec – repeated actionable oneOf errors', () => {
  const repeatedUnknownKeySchema: CliTypeSpec = {
    oneOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'string' },
          op: { const: 'text.rewrite' },
        },
        required: ['id', 'op'],
      },
      {
        type: 'object',
        properties: {
          id: { type: 'string' },
          op: { const: 'text.insert' },
        },
        required: ['id', 'op'],
      },
    ],
  };

  test('surfaces the shared nested schema error instead of the generic oneOf message', () => {
    try {
      validateValueAgainstTypeSpec({ id: 'r1', op: 'text.rewrite', '},{': ':' }, repeatedUnknownKeySchema, 'steps[0]');
      throw new Error('Expected CliError to be thrown');
    } catch (error) {
      const cliError = error as CliError;
      expect(cliError.message).toBe('steps[0].},{ is not allowed by schema.');
      expect((cliError.details as { selectedError?: string }).selectedError).toBe(
        'steps[0].},{ is not allowed by schema.',
      );
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

// ---------------------------------------------------------------------------
// doc.find select schema override
// ---------------------------------------------------------------------------

describe('doc.find select schema — accepts canonical and shorthand forms', () => {
  const metadata = CLI_OPERATION_METADATA['doc.find'];
  const selectParam = metadata.params.find((p) => p.name === 'select');
  const schema = selectParam?.schema;

  if (!schema) throw new Error('doc.find metadata missing select param with schema');

  test('accepts canonical text selector', () => {
    expect(() => validateValueAgainstTypeSpec({ type: 'text', pattern: 'hello' }, schema, 'select')).not.toThrow();
  });

  test('accepts canonical text selector with all optional fields', () => {
    expect(() =>
      validateValueAgainstTypeSpec(
        { type: 'text', pattern: 'hello', mode: 'regex', caseSensitive: true },
        schema,
        'select',
      ),
    ).not.toThrow();
  });

  test('accepts canonical node selector', () => {
    expect(() => validateValueAgainstTypeSpec({ type: 'node', nodeType: 'heading' }, schema, 'select')).not.toThrow();
  });

  test('accepts canonical node selector with kind', () => {
    expect(() => validateValueAgainstTypeSpec({ type: 'node', kind: 'block' }, schema, 'select')).not.toThrow();
  });

  test('accepts shorthand node selector', () => {
    expect(() => validateValueAgainstTypeSpec({ type: 'paragraph' }, schema, 'select')).not.toThrow();
  });

  test('accepts shorthand for inline node type', () => {
    expect(() => validateValueAgainstTypeSpec({ type: 'hyperlink' }, schema, 'select')).not.toThrow();
  });

  test('rejects invalid shorthand node type', () => {
    expect(() => validateValueAgainstTypeSpec({ type: 'magic' }, schema, 'select')).toThrow(CliError);
  });

  test('rejects text selector missing required pattern', () => {
    expect(() => validateValueAgainstTypeSpec({ type: 'text' }, schema, 'select')).toThrow(CliError);
  });
});

describe('comments target schema — accepts selection and tracked-change targets', () => {
  const createMetadata = CLI_OPERATION_METADATA['doc.comments.create'];
  const patchMetadata = CLI_OPERATION_METADATA['doc.comments.patch'];
  const createTargetSchema = createMetadata.params.find((p) => p.name === 'target')?.schema;
  const patchTargetSchema = patchMetadata.params.find((p) => p.name === 'target')?.schema;

  if (!createTargetSchema || !patchTargetSchema) {
    throw new Error('comments metadata missing target schema');
  }

  const selectionTarget = {
    kind: 'selection',
    start: { kind: 'text', blockId: '36D666B6', offset: 10 },
    end: { kind: 'text', blockId: '36D666B6', offset: 18 },
  };

  test('accepts SelectionTarget for comments.create', () => {
    expect(() => validateValueAgainstTypeSpec(selectionTarget, createTargetSchema, 'target')).not.toThrow();
  });

  test('accepts SelectionTarget for comments.patch', () => {
    expect(() => validateValueAgainstTypeSpec(selectionTarget, patchTargetSchema, 'target')).not.toThrow();
  });

  test('accepts tracked-change target without explicit kind for comments.create', () => {
    expect(() => validateValueAgainstTypeSpec({ trackedChangeId: 'tc-1' }, createTargetSchema, 'target')).not.toThrow();
  });

  test('accepts tracked-change target without explicit kind for comments.patch', () => {
    expect(() => validateValueAgainstTypeSpec({ trackedChangeId: 'tc-1' }, patchTargetSchema, 'target')).not.toThrow();
  });
});

describe('validateValueAgainstTypeSpec – object without explicit properties', () => {
  // type: 'object' schemas that use additionalProperties (or nothing at all)
  // must not crash the validator when `properties` is absent.
  const schema = {
    type: 'object',
    additionalProperties: { type: 'string' },
  } as unknown as CliTypeSpec;

  test('accepts any object when properties is absent', () => {
    expect(() => validateValueAgainstTypeSpec({ foo: 'bar' }, schema, 'params')).not.toThrow();
    expect(() => validateValueAgainstTypeSpec({}, schema, 'params')).not.toThrow();
  });

  test('still rejects non-object values', () => {
    expect(() => validateValueAgainstTypeSpec('nope', schema, 'params')).toThrow(CliError);
    expect(() => validateValueAgainstTypeSpec(42, schema, 'params')).toThrow(CliError);
    expect(() => validateValueAgainstTypeSpec(null, schema, 'params')).toThrow(CliError);
  });
});
