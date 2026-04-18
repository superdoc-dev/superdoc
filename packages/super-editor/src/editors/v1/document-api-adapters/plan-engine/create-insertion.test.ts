import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { resolveBlockInsertionPos, resolveCreateAnchor } from './create-insertion.js';
import { PlanError } from './errors.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockedDeps = vi.hoisted(() => ({
  getBlockIndex: vi.fn(),
  findBlockByNodeIdOnly: vi.fn(),
}));

vi.mock('../helpers/index-cache.js', () => ({
  getBlockIndex: mockedDeps.getBlockIndex,
}));

vi.mock('../helpers/node-address-resolver.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    findBlockByNodeIdOnly: mockedDeps.findBlockByNodeIdOnly,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEditor(): Editor {
  return {} as unknown as Editor;
}

function makeCandidate(overrides: Partial<{ nodeType: string; nodeId: string; pos: number; end: number }> = {}) {
  return {
    nodeType: 'paragraph',
    nodeId: 'p1',
    pos: 10,
    end: 25,
    node: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveBlockInsertionPos (legacy helper — kept for plan-engine executor)
// ---------------------------------------------------------------------------

describe('resolveBlockInsertionPos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns candidate.pos for position "before"', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [{ nodeId: 'p1', pos: 10, end: 25 }],
    });

    const result = resolveBlockInsertionPos(makeEditor(), 'p1', 'before');

    expect(result).toBe(10);
  });

  it('returns candidate.end for position "after"', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [{ nodeId: 'p1', pos: 10, end: 25 }],
    });

    const result = resolveBlockInsertionPos(makeEditor(), 'p1', 'after');

    expect(result).toBe(25);
  });

  it('throws TARGET_NOT_FOUND when block is not in the index', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [],
    });

    try {
      resolveBlockInsertionPos(makeEditor(), 'missing-block', 'after', 'step-1');
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('TARGET_NOT_FOUND');
      expect((error as PlanError).stepId).toBe('step-1');
      expect((error as PlanError).message).toContain('missing-block');
      return;
    }

    throw new Error('expected resolveBlockInsertionPos to throw TARGET_NOT_FOUND');
  });

  it('resolves the correct block when multiple candidates exist', () => {
    mockedDeps.getBlockIndex.mockReturnValue({
      candidates: [
        { nodeId: 'p1', pos: 0, end: 12 },
        { nodeId: 'p2', pos: 20, end: 35 },
        { nodeId: 'p3', pos: 40, end: 50 },
      ],
    });

    expect(resolveBlockInsertionPos(makeEditor(), 'p2', 'before')).toBe(20);
    expect(resolveBlockInsertionPos(makeEditor(), 'p2', 'after')).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// resolveCreateAnchor (typed-target resolver with pre-flight validation)
// ---------------------------------------------------------------------------

describe('resolveCreateAnchor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeps.getBlockIndex.mockReturnValue({ candidates: [], byId: new Map() });
  });

  it('returns pos and anchor for exact nodeType match with "before"', () => {
    const candidate = makeCandidate({ nodeType: 'paragraph', nodeId: 'p1', pos: 10, end: 25 });
    mockedDeps.findBlockByNodeIdOnly.mockReturnValue(candidate);

    const result = resolveCreateAnchor(makeEditor(), { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' }, 'before');

    expect(result.pos).toBe(10);
    expect(result.anchor).toBe(candidate);
  });

  it('returns end position for "after"', () => {
    const candidate = makeCandidate({ pos: 10, end: 25 });
    mockedDeps.findBlockByNodeIdOnly.mockReturnValue(candidate);

    const result = resolveCreateAnchor(makeEditor(), { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' }, 'after');

    expect(result.pos).toBe(25);
  });

  it('succeeds when target has no nodeType (any block type accepted)', () => {
    const candidate = makeCandidate({ nodeType: 'heading', nodeId: 'h1', pos: 5, end: 20 });
    mockedDeps.findBlockByNodeIdOnly.mockReturnValue(candidate);

    const result = resolveCreateAnchor(
      makeEditor(),
      { kind: 'block', nodeId: 'h1' } as { kind: 'block'; nodeType: string; nodeId: string },
      'before',
    );

    expect(result.pos).toBe(5);
    expect(result.anchor.nodeType).toBe('heading');
  });

  it('throws INVALID_TARGET when nodeType does not match', () => {
    const candidate = makeCandidate({ nodeType: 'listItem', nodeId: 'li1' });
    mockedDeps.findBlockByNodeIdOnly.mockReturnValue(candidate);

    try {
      resolveCreateAnchor(makeEditor(), { kind: 'block', nodeType: 'paragraph', nodeId: 'li1' }, 'before');
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('INVALID_TARGET');
      expect((error as PlanError).details).toMatchObject({
        requestedNodeType: 'paragraph',
        actualNodeType: 'listItem',
        nodeId: 'li1',
      });
      return;
    }

    throw new Error('expected resolveCreateAnchor to throw INVALID_TARGET');
  });

  it('provides listItem-specific remediation when target is a listItem', () => {
    const candidate = makeCandidate({ nodeType: 'listItem', nodeId: 'li1' });
    mockedDeps.findBlockByNodeIdOnly.mockReturnValue(candidate);

    try {
      resolveCreateAnchor(makeEditor(), { kind: 'block', nodeType: 'paragraph', nodeId: 'li1' }, 'before');
    } catch (error) {
      expect((error as PlanError).details).toMatchObject({
        remediation: 'Use lists.insert to add an item to a list sequence.',
      });
      return;
    }

    throw new Error('expected resolveCreateAnchor to throw');
  });

  it('propagates TARGET_NOT_FOUND from findBlockByNodeIdOnly', () => {
    mockedDeps.findBlockByNodeIdOnly.mockImplementation(() => {
      throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Block with nodeId "gone" was not found.', {
        nodeId: 'gone',
      });
    });

    try {
      resolveCreateAnchor(makeEditor(), { kind: 'block', nodeType: 'paragraph', nodeId: 'gone' }, 'before', 'step-42');
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('TARGET_NOT_FOUND');
      expect((error as PlanError).stepId).toBe('step-42');
      return;
    }

    throw new Error('expected resolveCreateAnchor to throw TARGET_NOT_FOUND');
  });

  it('propagates AMBIGUOUS_TARGET from findBlockByNodeIdOnly', () => {
    mockedDeps.findBlockByNodeIdOnly.mockImplementation(() => {
      throw new DocumentApiAdapterError('AMBIGUOUS_TARGET', 'Multiple blocks share nodeId "dup".', {
        nodeId: 'dup',
        count: 2,
      });
    });

    try {
      resolveCreateAnchor(makeEditor(), { kind: 'block', nodeType: 'paragraph', nodeId: 'dup' }, 'before');
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError);
      expect((error as PlanError).code).toBe('AMBIGUOUS_TARGET');
      return;
    }

    throw new Error('expected resolveCreateAnchor to throw AMBIGUOUS_TARGET');
  });

  it('attaches stepId to re-wrapped errors', () => {
    mockedDeps.findBlockByNodeIdOnly.mockImplementation(() => {
      throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Not found.', { nodeId: 'x' });
    });

    try {
      resolveCreateAnchor(makeEditor(), { kind: 'block', nodeType: 'paragraph', nodeId: 'x' }, 'after', 'my-step');
    } catch (error) {
      expect((error as PlanError).stepId).toBe('my-step');
      return;
    }

    throw new Error('expected resolveCreateAnchor to throw');
  });
});
