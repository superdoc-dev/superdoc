import { describe, expect, it, vi } from 'vitest';
import { applyDirectMutationMeta, applyTrackedMutationMeta } from './transaction-meta.js';

function makeFakeTransaction() {
  const meta = new Map<string, unknown>();
  return {
    setMeta: vi.fn((key: string, value: unknown) => meta.set(key, value)),
    getMeta: (key: string) => meta.get(key),
    _meta: meta,
  };
}

describe('applyDirectMutationMeta', () => {
  it('sets inputType to programmatic', () => {
    const tr = makeFakeTransaction();
    applyDirectMutationMeta(tr as any);
    expect(tr.setMeta).toHaveBeenCalledWith('inputType', 'programmatic');
  });

  it('sets skipTrackChanges to true', () => {
    const tr = makeFakeTransaction();
    applyDirectMutationMeta(tr as any);
    expect(tr.setMeta).toHaveBeenCalledWith('skipTrackChanges', true);
  });

  it('returns the same transaction', () => {
    const tr = makeFakeTransaction();
    const result = applyDirectMutationMeta(tr as any);
    expect(result).toBe(tr);
  });
});

describe('applyTrackedMutationMeta', () => {
  it('sets inputType to programmatic', () => {
    const tr = makeFakeTransaction();
    applyTrackedMutationMeta(tr as any);
    expect(tr.setMeta).toHaveBeenCalledWith('inputType', 'programmatic');
  });

  it('sets forceTrackChanges to true', () => {
    const tr = makeFakeTransaction();
    applyTrackedMutationMeta(tr as any);
    expect(tr.setMeta).toHaveBeenCalledWith('forceTrackChanges', true);
  });

  it('returns the same transaction', () => {
    const tr = makeFakeTransaction();
    const result = applyTrackedMutationMeta(tr as any);
    expect(result).toBe(tr);
  });
});
