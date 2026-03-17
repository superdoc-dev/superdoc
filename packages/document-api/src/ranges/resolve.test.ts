import { describe, it, expect, vi } from 'vitest';
import { executeResolveRange } from './resolve.js';
import type { RangeResolverAdapter, ResolveRangeInput, ResolveRangeOutput } from './ranges.types.js';
import type { SelectionTarget } from '../types/address.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STUB_TARGET: SelectionTarget = {
  kind: 'selection',
  start: { kind: 'text', blockId: 'p1', offset: 0 },
  end: { kind: 'text', blockId: 'p1', offset: 5 },
};

const STUB_OUTPUT: ResolveRangeOutput = {
  evaluatedRevision: '1',
  handle: { ref: 'text:abc', refStability: 'ephemeral', coversFullTarget: true },
  target: STUB_TARGET,
  preview: { text: 'hello', truncated: false, blocks: [] },
};

function createStubAdapter(output: ResolveRangeOutput = STUB_OUTPUT): RangeResolverAdapter {
  return { resolve: vi.fn(() => output) };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('executeResolveRange: validation', () => {
  it('rejects non-object input', () => {
    const adapter = createStubAdapter();
    expect(() => executeResolveRange(adapter, null as unknown as ResolveRangeInput)).toThrow(
      'ranges.resolve input must be a non-null object',
    );
  });

  it('rejects missing start', () => {
    const adapter = createStubAdapter();
    expect(() =>
      executeResolveRange(adapter, { end: { kind: 'document', edge: 'end' } } as unknown as ResolveRangeInput),
    ).toThrow('must provide "start"');
  });

  it('rejects missing end', () => {
    const adapter = createStubAdapter();
    expect(() =>
      executeResolveRange(adapter, { start: { kind: 'document', edge: 'start' } } as unknown as ResolveRangeInput),
    ).toThrow('must provide "end"');
  });

  it('rejects unknown top-level fields', () => {
    const adapter = createStubAdapter();
    const input = {
      start: { kind: 'document', edge: 'start' },
      end: { kind: 'document', edge: 'end' },
      bogus: true,
    };
    expect(() => executeResolveRange(adapter, input as unknown as ResolveRangeInput)).toThrow('Unknown field "bogus"');
  });

  it('rejects non-string expectedRevision', () => {
    const adapter = createStubAdapter();
    const input = {
      start: { kind: 'document', edge: 'start' },
      end: { kind: 'document', edge: 'end' },
      expectedRevision: 42,
    };
    expect(() => executeResolveRange(adapter, input as unknown as ResolveRangeInput)).toThrow(
      'expectedRevision must be a string',
    );
  });
});

// ---------------------------------------------------------------------------
// Anchor validation: document
// ---------------------------------------------------------------------------

describe('executeResolveRange: document anchor validation', () => {
  it('accepts valid document anchors', () => {
    const adapter = createStubAdapter();
    const input: ResolveRangeInput = {
      start: { kind: 'document', edge: 'start' },
      end: { kind: 'document', edge: 'end' },
    };
    const result = executeResolveRange(adapter, input);
    expect(result).toBe(STUB_OUTPUT);
    expect(adapter.resolve).toHaveBeenCalledWith(input);
  });

  it('rejects invalid document edge', () => {
    const adapter = createStubAdapter();
    const input = {
      start: { kind: 'document', edge: 'middle' },
      end: { kind: 'document', edge: 'end' },
    };
    expect(() => executeResolveRange(adapter, input as unknown as ResolveRangeInput)).toThrow(
      'start.edge must be "start" or "end"',
    );
  });
});

// ---------------------------------------------------------------------------
// Anchor validation: point
// ---------------------------------------------------------------------------

describe('executeResolveRange: point anchor validation', () => {
  it('accepts valid text point anchor', () => {
    const adapter = createStubAdapter();
    const input: ResolveRangeInput = {
      start: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 0 } },
      end: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 5 } },
    };
    executeResolveRange(adapter, input);
    expect(adapter.resolve).toHaveBeenCalledWith(input);
  });

  it('accepts valid nodeEdge point anchor', () => {
    const adapter = createStubAdapter();
    const input: ResolveRangeInput = {
      start: {
        kind: 'point',
        point: { kind: 'nodeEdge', node: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' }, edge: 'before' },
      },
      end: { kind: 'document', edge: 'end' },
    };
    executeResolveRange(adapter, input);
    expect(adapter.resolve).toHaveBeenCalledWith(input);
  });

  it('rejects invalid point', () => {
    const adapter = createStubAdapter();
    const input = {
      start: { kind: 'point', point: { kind: 'text', blockId: '', offset: 0 } },
      end: { kind: 'document', edge: 'end' },
    };
    expect(() => executeResolveRange(adapter, input as unknown as ResolveRangeInput)).toThrow(
      'start.point must be a valid SelectionPoint',
    );
  });

  it('rejects negative offset in point', () => {
    const adapter = createStubAdapter();
    const input = {
      start: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: -1 } },
      end: { kind: 'document', edge: 'end' },
    };
    expect(() => executeResolveRange(adapter, input as unknown as ResolveRangeInput)).toThrow(
      'start.point must be a valid SelectionPoint',
    );
  });
});

// ---------------------------------------------------------------------------
// Anchor validation: ref
// ---------------------------------------------------------------------------

describe('executeResolveRange: ref anchor validation', () => {
  it('accepts valid ref anchor', () => {
    const adapter = createStubAdapter();
    const input: ResolveRangeInput = {
      start: { kind: 'ref', ref: 'text:abc123', boundary: 'start' },
      end: { kind: 'ref', ref: 'text:def456', boundary: 'end' },
    };
    executeResolveRange(adapter, input);
    expect(adapter.resolve).toHaveBeenCalledWith(input);
  });

  it('rejects empty ref string', () => {
    const adapter = createStubAdapter();
    const input = {
      start: { kind: 'ref', ref: '', boundary: 'start' },
      end: { kind: 'document', edge: 'end' },
    };
    expect(() => executeResolveRange(adapter, input as unknown as ResolveRangeInput)).toThrow(
      'start.ref must be a non-empty string',
    );
  });

  it('rejects invalid boundary', () => {
    const adapter = createStubAdapter();
    const input = {
      start: { kind: 'ref', ref: 'text:abc', boundary: 'middle' },
      end: { kind: 'document', edge: 'end' },
    };
    expect(() => executeResolveRange(adapter, input as unknown as ResolveRangeInput)).toThrow(
      'start.boundary must be "start" or "end"',
    );
  });

  it('rejects missing boundary', () => {
    const adapter = createStubAdapter();
    const input = {
      start: { kind: 'ref', ref: 'text:abc' },
      end: { kind: 'document', edge: 'end' },
    };
    expect(() => executeResolveRange(adapter, input as unknown as ResolveRangeInput)).toThrow(
      'start.boundary must be "start" or "end"',
    );
  });
});

// ---------------------------------------------------------------------------
// Anchor validation: kind
// ---------------------------------------------------------------------------

describe('executeResolveRange: anchor kind validation', () => {
  it('rejects unknown anchor kind', () => {
    const adapter = createStubAdapter();
    const input = {
      start: { kind: 'fuzzy', pattern: 'Exhibit B' },
      end: { kind: 'document', edge: 'end' },
    };
    expect(() => executeResolveRange(adapter, input as unknown as ResolveRangeInput)).toThrow(
      'start.kind must be "document", "point", or "ref"',
    );
  });

  it('rejects non-object anchor', () => {
    const adapter = createStubAdapter();
    const input = {
      start: 'document:start',
      end: { kind: 'document', edge: 'end' },
    };
    expect(() => executeResolveRange(adapter, input as unknown as ResolveRangeInput)).toThrow(
      'start must be a non-null object',
    );
  });
});

// ---------------------------------------------------------------------------
// Delegation
// ---------------------------------------------------------------------------

describe('executeResolveRange: delegation to adapter', () => {
  it('passes validated input through to adapter', () => {
    const adapter = createStubAdapter();
    const input: ResolveRangeInput = {
      start: { kind: 'document', edge: 'start' },
      end: { kind: 'document', edge: 'end' },
      expectedRevision: '5',
    };

    const result = executeResolveRange(adapter, input);

    expect(adapter.resolve).toHaveBeenCalledOnce();
    expect(adapter.resolve).toHaveBeenCalledWith(input);
    expect(result).toBe(STUB_OUTPUT);
  });

  it('returns adapter output directly', () => {
    const customOutput: ResolveRangeOutput = {
      evaluatedRevision: '42',
      handle: { ref: 'text:custom', refStability: 'ephemeral', coversFullTarget: true },
      target: STUB_TARGET,
      preview: {
        text: 'custom text',
        truncated: true,
        blocks: [{ nodeId: 'p1', nodeType: 'paragraph', textPreview: 'custom' }],
      },
    };
    const adapter = createStubAdapter(customOutput);
    const input: ResolveRangeInput = {
      start: { kind: 'document', edge: 'start' },
      end: { kind: 'document', edge: 'end' },
    };

    const result = executeResolveRange(adapter, input);
    expect(result).toBe(customOutput);
  });
});
