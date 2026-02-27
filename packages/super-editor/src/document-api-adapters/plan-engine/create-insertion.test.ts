import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { resolveBlockInsertionPos } from './create-insertion.js';
import { PlanError } from './errors.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockedDeps = vi.hoisted(() => ({
  getBlockIndex: vi.fn(),
}));

vi.mock('../helpers/index-cache.js', () => ({
  getBlockIndex: mockedDeps.getBlockIndex,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEditor(): Editor {
  return {} as unknown as Editor;
}

// ---------------------------------------------------------------------------
// Tests
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
