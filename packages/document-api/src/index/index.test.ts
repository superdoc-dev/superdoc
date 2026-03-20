import { describe, it, expect, vi } from 'vitest';
import { DocumentApiValidationError } from '../errors.js';
import {
  executeIndexList,
  executeIndexGet,
  executeIndexInsert,
  executeIndexConfigure,
  executeIndexRebuild,
  executeIndexRemove,
  executeIndexEntryList,
  executeIndexEntryGet,
  executeIndexEntryInsert,
  executeIndexEntryUpdate,
  executeIndexEntryRemove,
  type IndexAdapter,
} from './index.js';

function makeAdapter(): IndexAdapter {
  return {
    list: vi.fn().mockReturnValue({ items: [], total: 0 }),
    get: vi.fn().mockReturnValue({}),
    insert: vi.fn().mockReturnValue({ success: true }),
    configure: vi.fn().mockReturnValue({ success: true }),
    rebuild: vi.fn().mockReturnValue({ success: true }),
    remove: vi.fn().mockReturnValue({ success: true }),
    entries: {
      list: vi.fn().mockReturnValue({ items: [], total: 0 }),
      get: vi.fn().mockReturnValue({}),
      insert: vi.fn().mockReturnValue({ success: true }),
      update: vi.fn().mockReturnValue({ success: true }),
      remove: vi.fn().mockReturnValue({ success: true }),
    },
  };
}

const validIndexTarget = { kind: 'block', nodeType: 'index', nodeId: 'idx-1' };
const validEntryTarget = {
  kind: 'inline',
  nodeType: 'indexEntry',
  anchor: { start: { blockId: 'b1', offset: 0 }, end: { blockId: 'b1', offset: 5 } },
};

describe('index validation', () => {
  // ── Index target validation ─────────────────────────────────────────
  describe('validateIndexTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeIndexGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
      try {
        executeIndexGet(adapter, { target: null as any });
      } catch (e: any) {
        expect(e.code).toBe('INVALID_TARGET');
      }
    });

    it('throws INVALID_TARGET for undefined target', () => {
      const adapter = makeAdapter();
      expect(() => executeIndexGet(adapter, { target: undefined as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeIndexGet(adapter, {
          target: { kind: 'inline', nodeType: 'index', nodeId: 'idx-1' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong nodeType', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeIndexGet(adapter, {
          target: { kind: 'block', nodeType: 'paragraph', nodeId: 'idx-1' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when nodeId is not a string', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeIndexGet(adapter, {
          target: { kind: 'block', nodeType: 'index', nodeId: 123 } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when nodeId is missing', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeIndexGet(adapter, {
          target: { kind: 'block', nodeType: 'index' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });
  });

  // ── Index entry target validation ───────────────────────────────────
  describe('validateIndexEntryTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeIndexEntryGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeIndexEntryGet(adapter, {
          target: { kind: 'block', nodeType: 'indexEntry', anchor: validEntryTarget.anchor } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong nodeType', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeIndexEntryGet(adapter, {
          target: { kind: 'inline', nodeType: 'hyperlink', anchor: validEntryTarget.anchor } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when anchor is missing', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeIndexEntryGet(adapter, {
          target: { kind: 'inline', nodeType: 'indexEntry' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when anchor.start is not an object', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeIndexEntryGet(adapter, {
          target: { kind: 'inline', nodeType: 'indexEntry', anchor: { start: 'bad', end: {} } } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when anchor.end is not an object', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeIndexEntryGet(adapter, {
          target: { kind: 'inline', nodeType: 'indexEntry', anchor: { start: {}, end: 'bad' } } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });
  });

  // ── Input validation ────────────────────────────────────────────────
  describe('executeIndexEntryInsert', () => {
    it('throws INVALID_INPUT when entry is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeIndexEntryInsert(adapter, {} as any)).toThrow(DocumentApiValidationError);
      try {
        executeIndexEntryInsert(adapter, {} as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when entry.text is empty', () => {
      const adapter = makeAdapter();
      expect(() => executeIndexEntryInsert(adapter, { entry: { text: '' } } as any)).toThrow(
        DocumentApiValidationError,
      );
    });

    it('throws INVALID_INPUT when entry.text is not a string', () => {
      const adapter = makeAdapter();
      expect(() => executeIndexEntryInsert(adapter, { entry: { text: 42 } } as any)).toThrow(
        DocumentApiValidationError,
      );
    });

    it('delegates to adapter.entries.insert for valid input', () => {
      const adapter = makeAdapter();
      const input = { entry: { text: 'Term' } };
      executeIndexEntryInsert(adapter, input as any);
      expect(adapter.entries.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Index delegation tests ──────────────────────────────────────────
  describe('executeIndexList', () => {
    it('delegates to adapter.list', () => {
      const adapter = makeAdapter();
      executeIndexList(adapter);
      expect(adapter.list).toHaveBeenCalledWith(undefined);
    });
  });

  describe('executeIndexGet', () => {
    it('delegates to adapter.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validIndexTarget };
      executeIndexGet(adapter, input as any);
      expect(adapter.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeIndexInsert', () => {
    it('delegates to adapter.insert (no target validation)', () => {
      const adapter = makeAdapter();
      const input = { position: 'end' };
      executeIndexInsert(adapter, input as any);
      expect(adapter.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeIndexConfigure', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeIndexConfigure(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.configure for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validIndexTarget };
      executeIndexConfigure(adapter, input as any);
      expect(adapter.configure).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeIndexRebuild', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeIndexRebuild(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.rebuild for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validIndexTarget };
      executeIndexRebuild(adapter, input as any, { dryRun: true });
      expect(adapter.rebuild).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: true });
    });
  });

  describe('executeIndexRemove', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeIndexRemove(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.remove for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validIndexTarget };
      executeIndexRemove(adapter, input as any);
      expect(adapter.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Index entry delegation tests ────────────────────────────────────
  describe('executeIndexEntryList', () => {
    it('delegates to adapter.entries.list', () => {
      const adapter = makeAdapter();
      executeIndexEntryList(adapter);
      expect(adapter.entries.list).toHaveBeenCalledWith(undefined);
    });
  });

  describe('executeIndexEntryGet', () => {
    it('delegates to adapter.entries.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validEntryTarget };
      executeIndexEntryGet(adapter, input as any);
      expect(adapter.entries.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeIndexEntryUpdate', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeIndexEntryUpdate(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.entries.update for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validEntryTarget };
      executeIndexEntryUpdate(adapter, input as any);
      expect(adapter.entries.update).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeIndexEntryRemove', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeIndexEntryRemove(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.entries.remove for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validEntryTarget };
      executeIndexEntryRemove(adapter, input as any);
      expect(adapter.entries.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });
});
