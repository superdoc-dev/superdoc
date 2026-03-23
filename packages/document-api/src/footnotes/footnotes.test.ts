import { describe, it, expect, mock } from 'bun:test';
import { DocumentApiValidationError } from '../errors.js';
import {
  executeFootnotesList,
  executeFootnotesGet,
  executeFootnotesInsert,
  executeFootnotesUpdate,
  executeFootnotesRemove,
  executeFootnotesConfigure,
  type FootnotesAdapter,
} from './footnotes.js';

function makeAdapter(): FootnotesAdapter {
  return {
    list: mock().mockReturnValue({ items: [], total: 0 }),
    get: mock().mockReturnValue({}),
    insert: mock().mockReturnValue({ success: true }),
    update: mock().mockReturnValue({ success: true }),
    remove: mock().mockReturnValue({ success: true }),
    configure: mock().mockReturnValue({ success: true }),
  };
}

const validTarget = { kind: 'entity', entityType: 'footnote', noteId: 'fn-1' };

describe('footnotes validation', () => {
  // ── Target validation ───────────────────────────────────────────────
  describe('validateFootnoteTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeFootnotesGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
      try {
        executeFootnotesGet(adapter, { target: null as any });
      } catch (e: any) {
        expect(e.code).toBe('INVALID_TARGET');
      }
    });

    it('throws INVALID_TARGET for undefined target', () => {
      const adapter = makeAdapter();
      expect(() => executeFootnotesGet(adapter, { target: undefined as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeFootnotesGet(adapter, {
          target: { kind: 'block', entityType: 'footnote', noteId: 'fn-1' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong entityType', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeFootnotesGet(adapter, {
          target: { kind: 'entity', entityType: 'bookmark', noteId: 'fn-1' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when noteId is not a string', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeFootnotesGet(adapter, {
          target: { kind: 'entity', entityType: 'footnote', noteId: 42 } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when noteId is missing', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeFootnotesGet(adapter, {
          target: { kind: 'entity', entityType: 'footnote' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });
  });

  // ── Input validation ────────────────────────────────────────────────
  describe('executeFootnotesInsert', () => {
    it('throws INVALID_INPUT when type is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeFootnotesInsert(adapter, { content: 'text' } as any)).toThrow(DocumentApiValidationError);
      try {
        executeFootnotesInsert(adapter, { content: 'text' } as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when type is invalid', () => {
      const adapter = makeAdapter();
      expect(() => executeFootnotesInsert(adapter, { type: 'comment', content: 'text' } as any)).toThrow(
        DocumentApiValidationError,
      );
    });

    it('throws INVALID_INPUT when content is not a string', () => {
      const adapter = makeAdapter();
      expect(() => executeFootnotesInsert(adapter, { type: 'footnote', content: 123 } as any)).toThrow(
        DocumentApiValidationError,
      );
    });

    it('throws INVALID_INPUT when content is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeFootnotesInsert(adapter, { type: 'footnote' } as any)).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.insert for valid footnote input', () => {
      const adapter = makeAdapter();
      const input = { type: 'footnote', content: 'Hello' };
      executeFootnotesInsert(adapter, input as any);
      expect(adapter.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });

    it('delegates to adapter.insert for valid endnote input', () => {
      const adapter = makeAdapter();
      const input = { type: 'endnote', content: 'Hello' };
      executeFootnotesInsert(adapter, input as any);
      expect(adapter.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeFootnotesConfigure', () => {
    it('throws INVALID_INPUT when type is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeFootnotesConfigure(adapter, {} as any)).toThrow(DocumentApiValidationError);
      try {
        executeFootnotesConfigure(adapter, {} as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when type is invalid', () => {
      const adapter = makeAdapter();
      expect(() => executeFootnotesConfigure(adapter, { type: 'sidenote' } as any)).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.configure for valid input', () => {
      const adapter = makeAdapter();
      const input = { type: 'footnote', numberFormat: 'decimal' };
      executeFootnotesConfigure(adapter, input as any);
      expect(adapter.configure).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Delegation tests ────────────────────────────────────────────────
  describe('executeFootnotesList', () => {
    it('delegates to adapter.list', () => {
      const adapter = makeAdapter();
      executeFootnotesList(adapter);
      expect(adapter.list).toHaveBeenCalledWith(undefined);
    });
  });

  describe('executeFootnotesGet', () => {
    it('delegates to adapter.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeFootnotesGet(adapter, input as any);
      expect(adapter.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeFootnotesUpdate', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeFootnotesUpdate(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.update with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeFootnotesUpdate(adapter, input as any, { dryRun: true });
      expect(adapter.update).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: true });
    });
  });

  describe('executeFootnotesRemove', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeFootnotesRemove(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.remove with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeFootnotesRemove(adapter, input as any);
      expect(adapter.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });
});
