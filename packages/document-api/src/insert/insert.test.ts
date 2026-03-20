import { describe, it, expect, vi } from 'vitest';
import { executeInsert, type InsertInput } from './insert.js';
import type { SelectionMutationAdapter } from '../selection-mutation.js';
import type { WriteAdapter } from '../write/write.js';

// ---------------------------------------------------------------------------
// Stub adapters — validation runs before any adapter method is called, so
// these stubs only need to exist (they should never be invoked in error cases).
// ---------------------------------------------------------------------------

function createStubSelectionAdapter(): SelectionMutationAdapter {
  return { execute: vi.fn() } as unknown as SelectionMutationAdapter;
}

function createStubWriteAdapter(): WriteAdapter {
  return { write: vi.fn(), insertStructured: vi.fn(), replaceStructured: vi.fn() } as unknown as WriteAdapter;
}

// ---------------------------------------------------------------------------
// ref validation
// ---------------------------------------------------------------------------

describe('executeInsert: ref validation', () => {
  it('rejects empty string ref', () => {
    const input: InsertInput = { value: 'hello', ref: '' } as unknown as InsertInput;
    expect(() => executeInsert(createStubSelectionAdapter(), createStubWriteAdapter(), input)).toThrow(
      'ref must be a non-empty string',
    );
  });

  it('rejects non-string ref', () => {
    const input = { value: 'hello', ref: 42 } as unknown as InsertInput;
    expect(() => executeInsert(createStubSelectionAdapter(), createStubWriteAdapter(), input)).toThrow(
      'ref must be a non-empty string',
    );
  });

  it('does not reject undefined ref (untargeted insert is valid)', () => {
    const writeAdapter = createStubWriteAdapter();
    (writeAdapter.write as ReturnType<typeof vi.fn>).mockReturnValue({ success: true, ref: 'r1' });
    expect(() => executeInsert(createStubSelectionAdapter(), writeAdapter, { value: 'hello' })).not.toThrow();
  });
});
