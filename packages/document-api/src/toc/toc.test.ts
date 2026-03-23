import { describe, expect, it, mock } from 'bun:test';
import {
  executeTocGet,
  executeTocConfigure,
  executeTocUpdate,
  executeTocRemove,
  executeTocMarkEntry,
  executeTocUnmarkEntry,
  executeTocGetEntry,
  executeTocEditEntry,
} from './toc.js';

const tocTarget = { kind: 'block' as const, nodeType: 'tableOfContents' as const, nodeId: 'toc-1' };
const entryTarget = { kind: 'inline' as const, nodeType: 'tableOfContentsEntry' as const, nodeId: 'entry-1' };

const stubAdapter = () =>
  ({
    list: mock(() => ({ items: [], total: 0 })),
    get: mock(() => ({})),
    configure: mock(() => ({ success: true, toc: tocTarget })),
    update: mock(() => ({ success: true, toc: tocTarget })),
    remove: mock(() => ({ success: true, toc: tocTarget })),
    markEntry: mock(() => ({ success: true, entry: entryTarget })),
    unmarkEntry: mock(() => ({ success: true, entry: entryTarget })),
    listEntries: mock(() => ({ items: [], total: 0 })),
    getEntry: mock(() => ({})),
    editEntry: mock(() => ({ success: true, entry: entryTarget })),
  }) as any;

describe('TOC input object guards', () => {
  it('toc.get rejects null input', () => {
    expect(() => executeTocGet(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('toc.configure rejects null input', () => {
    expect(() => executeTocConfigure(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('toc.update rejects null input', () => {
    expect(() => executeTocUpdate(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('toc.remove rejects null input', () => {
    expect(() => executeTocRemove(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('toc.markEntry rejects null input', () => {
    expect(() => executeTocMarkEntry(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('toc.unmarkEntry rejects null input', () => {
    expect(() => executeTocUnmarkEntry(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('toc.getEntry rejects null input', () => {
    expect(() => executeTocGetEntry(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('toc.editEntry rejects null input', () => {
    expect(() => executeTocEditEntry(stubAdapter(), null as any)).toThrow(/non-null object/);
  });
});

describe('executeTocUpdate validation', () => {
  it('rejects invalid mode', () => {
    expect(() => executeTocUpdate(stubAdapter(), { target: tocTarget, mode: 'bogus' as any })).toThrow(
      /must be "all" or "pageNumbers"/,
    );
  });

  it('accepts valid mode "all"', () => {
    const adapter = stubAdapter();
    executeTocUpdate(adapter, { target: tocTarget, mode: 'all' });
    expect(adapter.update).toHaveBeenCalled();
  });

  it('accepts omitted mode', () => {
    const adapter = stubAdapter();
    executeTocUpdate(adapter, { target: tocTarget });
    expect(adapter.update).toHaveBeenCalled();
  });
});

describe('executeTocEditEntry validation', () => {
  it('rejects non-object patch', () => {
    expect(() => executeTocEditEntry(stubAdapter(), { target: entryTarget, patch: 'bad' as any })).toThrow(
      /patch must be a non-null object/,
    );
  });

  it('rejects unknown patch fields', () => {
    expect(() => executeTocEditEntry(stubAdapter(), { target: entryTarget, patch: { unknown: 1 } as any })).toThrow(
      /Unknown field/,
    );
  });

  it('rejects non-string patch.text', () => {
    expect(() => executeTocEditEntry(stubAdapter(), { target: entryTarget, patch: { text: 123 } as any })).toThrow(
      /text must be a string/,
    );
  });

  it('rejects non-integer patch.level', () => {
    expect(() => executeTocEditEntry(stubAdapter(), { target: entryTarget, patch: { level: 'high' } as any })).toThrow(
      /level must be a positive integer/,
    );
  });

  it('rejects zero patch.level', () => {
    expect(() => executeTocEditEntry(stubAdapter(), { target: entryTarget, patch: { level: 0 } })).toThrow(
      /level must be a positive integer/,
    );
  });

  it('rejects non-boolean patch.omitPageNumber', () => {
    expect(() =>
      executeTocEditEntry(stubAdapter(), { target: entryTarget, patch: { omitPageNumber: 1 } as any }),
    ).toThrow(/omitPageNumber must be a boolean/);
  });

  it('accepts valid patch', () => {
    const adapter = stubAdapter();
    executeTocEditEntry(adapter, { target: entryTarget, patch: { text: 'Updated', level: 2 } });
    expect(adapter.editEntry).toHaveBeenCalled();
  });
});
