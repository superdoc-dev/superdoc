import { describe, expect, it, mock } from 'bun:test';
import { executeTrackChangesGet, executeTrackChangesDecide } from './track-changes.js';

const stubAdapter = () =>
  ({
    list: mock(() => ({ items: [], total: 0 })),
    get: mock(() => ({ id: 'tc1' })),
    accept: mock(() => ({ success: true })),
    reject: mock(() => ({ success: true })),
    acceptAll: mock(() => ({ success: true })),
    rejectAll: mock(() => ({ success: true })),
  }) as any;

describe('executeTrackChangesGet validation', () => {
  it('rejects null input', () => {
    expect(() => executeTrackChangesGet(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('rejects undefined input', () => {
    expect(() => executeTrackChangesGet(stubAdapter(), undefined as any)).toThrow(/non-null object/);
  });

  it('rejects non-string id', () => {
    expect(() => executeTrackChangesGet(stubAdapter(), { id: 42 } as any)).toThrow(/non-empty string/);
  });

  it('rejects empty string id', () => {
    expect(() => executeTrackChangesGet(stubAdapter(), { id: '' })).toThrow(/non-empty string/);
  });

  it('accepts valid input', () => {
    const adapter = stubAdapter();
    executeTrackChangesGet(adapter, { id: 'tc-1' });
    expect(adapter.get).toHaveBeenCalledWith({ id: 'tc-1' });
  });
});

describe('executeTrackChangesDecide validation', () => {
  it('rejects null input', () => {
    expect(() => executeTrackChangesDecide(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('rejects invalid decision', () => {
    expect(() => executeTrackChangesDecide(stubAdapter(), { decision: 'maybe', target: { id: 'tc1' } } as any)).toThrow(
      /must be "accept" or "reject"/,
    );
  });

  it('rejects missing target', () => {
    expect(() => executeTrackChangesDecide(stubAdapter(), { decision: 'accept' } as any)).toThrow(/target must be/);
  });
});
