import { describe, it, expect, vi } from 'vitest';
import {
  executeStylesApply,
  PROPERTY_REGISTRY,
  EXCLUDED_KEYS,
  type StylesAdapter,
  type StylesApplyReceipt,
  type ValueSchema,
} from './index.js';
import { DocumentApiValidationError } from '../errors.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeAdapter(): StylesAdapter {
  return {
    apply: vi.fn(
      (): StylesApplyReceipt => ({
        success: true,
        changed: true,
        resolution: {
          scope: 'docDefaults',
          channel: 'run',
          xmlPart: 'word/styles.xml',
          xmlPath: 'w:styles/w:docDefaults/w:rPrDefault/w:rPr',
        },
        dryRun: false,
        before: {},
        after: {},
      }),
    ),
  };
}

function expectValidationError(fn: () => void, code: string, messagePattern?: RegExp) {
  try {
    fn();
    throw new Error('Expected DocumentApiValidationError to be thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(DocumentApiValidationError);
    expect((err as DocumentApiValidationError).code).toBe(code);
    if (messagePattern) {
      expect((err as DocumentApiValidationError).message).toMatch(messagePattern);
    }
  }
}

/** Generates a valid test value for a given schema. */
function validValueForSchema(schema: ValueSchema): unknown {
  switch (schema.kind) {
    case 'boolean':
      return true;
    case 'integer':
      return schema.min ?? 1;
    case 'enum':
      return schema.values[0];
    case 'string':
      return 'test';
    case 'object': {
      const firstKey = Object.keys(schema.children)[0];
      return { [firstKey]: validValueForSchema(schema.children[firstKey]) };
    }
    case 'array':
      return []; // Empty array is always valid
  }
}

/** Generates an invalid test value for a given schema. */
function invalidValueForSchema(schema: ValueSchema): unknown {
  switch (schema.kind) {
    case 'boolean':
      return 'not-a-boolean';
    case 'integer':
      return 'not-a-number';
    case 'enum':
      return 'INVALID_ENUM_VALUE';
    case 'string':
      return 42;
    case 'object':
      return 'not-an-object';
    case 'array':
      return 'not-an-array';
  }
}

// ---------------------------------------------------------------------------
// Registry-driven acceptance tests
// ---------------------------------------------------------------------------

describe('styles.apply validation: registry-driven property acceptance', () => {
  for (const def of PROPERTY_REGISTRY) {
    it(`accepts valid ${def.channel}.${def.key} (${def.schema.kind})`, () => {
      const adapter = makeAdapter();
      const value = validValueForSchema(def.schema);
      expect(() =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: def.channel },
          patch: { [def.key]: value },
        }),
      ).not.toThrow();
    });
  }
});

// ---------------------------------------------------------------------------
// Registry-driven rejection tests
// ---------------------------------------------------------------------------

describe('styles.apply validation: registry-driven type rejection', () => {
  for (const def of PROPERTY_REGISTRY) {
    it(`rejects invalid ${def.channel}.${def.key} type`, () => {
      const adapter = makeAdapter();
      const value = invalidValueForSchema(def.schema);
      expectValidationError(
        () =>
          executeStylesApply(adapter, {
            target: { scope: 'docDefaults', channel: def.channel },
            patch: { [def.key]: value },
          }),
        'INVALID_INPUT',
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Excluded-key tests
// ---------------------------------------------------------------------------

describe('styles.apply validation: excluded keys', () => {
  for (const [channel, keys] of Object.entries(EXCLUDED_KEYS) as [string, Map<string, string>][]) {
    for (const [key, xmlPath] of keys) {
      it(`rejects excluded key "${key}" on ${channel} with reason 'excluded_docdefaults_key'`, () => {
        const adapter = makeAdapter();
        try {
          executeStylesApply(adapter, {
            target: { scope: 'docDefaults', channel: channel as 'run' | 'paragraph' },
            patch: { [key]: true },
          });
          throw new Error('Expected error');
        } catch (err) {
          expect(err).toBeInstanceOf(DocumentApiValidationError);
          const e = err as DocumentApiValidationError;
          expect(e.code).toBe('INVALID_INPUT');
          expect(e.message).toContain(key);
          expect(e.message).toContain('docDefaults');
          expect((e as unknown as { details: Record<string, unknown> }).details?.reason).toBe(
            'excluded_docdefaults_key',
          );
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Manual edge-case tests
// ---------------------------------------------------------------------------

describe('styles.apply validation: manual edge cases', () => {
  // Integer range boundaries
  it('accepts outlineLvl: 0 (minimum)', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'paragraph' },
        patch: { outlineLvl: 0 },
      }),
    ).not.toThrow();
  });

  it('accepts outlineLvl: 9 (maximum)', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'paragraph' },
        patch: { outlineLvl: 9 },
      }),
    ).not.toThrow();
  });

  it('rejects outlineLvl: 10 (above maximum)', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { outlineLvl: 10 },
        }),
      'INVALID_INPUT',
      /<= 9/,
    );
  });

  it('rejects outlineLvl: -1 (below minimum)', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { outlineLvl: -1 },
        }),
      'INVALID_INPUT',
      />= 0/,
    );
  });

  it('accepts w: 1 (minimum character scaling)', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'run' },
        patch: { w: 1 },
      }),
    ).not.toThrow();
  });

  it('accepts w: 600 (maximum character scaling)', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'run' },
        patch: { w: 600 },
      }),
    ).not.toThrow();
  });

  it('rejects w: 601 (above maximum)', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { w: 601 },
        }),
      'INVALID_INPUT',
      /<= 600/,
    );
  });

  it('rejects w: 0 (below minimum)', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { w: 0 },
        }),
      'INVALID_INPUT',
      />= 1/,
    );
  });

  // underline.val token validation
  it('accepts valid underline.val token', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'run' },
        patch: { underline: { val: 'single' } },
      }),
    ).not.toThrow();
  });

  it('rejects invalid underline.val token', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { underline: { val: 'invalid-style' } },
        }),
      'INVALID_INPUT',
      /must be one of/,
    );
  });

  // tabStops: [] (empty array is legal)
  it('accepts tabStops: [] (empty array clears tab stops)', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'paragraph' },
        patch: { tabStops: [] },
      }),
    ).not.toThrow();
  });

  // tabStops: valid non-empty array
  it('accepts valid tabStops array', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'paragraph' },
        patch: { tabStops: [{ tab: { tabType: 'left', pos: 720 } }] },
      }),
    ).not.toThrow();
  });

  // tabStops: invalid item
  it('rejects tabStops with invalid item structure', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { tabStops: ['invalid'] },
        }),
      'INVALID_INPUT',
    );
  });

  // Nested paragraph borders validation
  it('accepts valid paragraph borders with edge sub-keys', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'paragraph' },
        patch: { borders: { top: { val: 'single', size: 4 } } },
      }),
    ).not.toThrow();
  });

  it('rejects paragraph borders with unknown edge key', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { borders: { invalid: { val: 'single' } } },
        }),
      'INVALID_INPUT',
      /Unknown key/,
    );
  });

  // String property validation
  it('accepts valid effect string', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'run' },
        patch: { effect: 'blinkBackground' },
      }),
    ).not.toThrow();
  });

  it('rejects empty string for effect', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { effect: '' },
        }),
      'INVALID_INPUT',
      /non-empty string/,
    );
  });

  // Mixed-type object sub-keys (eastAsianLayout)
  it('accepts eastAsianLayout with mixed sub-key types', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'run' },
        patch: { eastAsianLayout: { id: 1, combine: true, vert: false } },
      }),
    ).not.toThrow();
  });

  it('rejects eastAsianLayout with wrong sub-key type', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { eastAsianLayout: { id: 'not-a-number' } },
        }),
      'INVALID_INPUT',
      /finite integer/,
    );
  });
});
