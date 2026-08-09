import { describe, it, expect, mock } from 'bun:test';
import { DocumentApiValidationError } from '../errors.js';
import {
  executeCrossRefsList,
  executeCrossRefsGet,
  executeCrossRefsInsert,
  executeCrossRefsRebuild,
  executeCrossRefsRemove,
  type CrossRefsAdapter,
} from './cross-refs.js';

function makeAdapter(): CrossRefsAdapter {
  return {
    list: mock().mockReturnValue({ items: [], total: 0 }),
    get: mock().mockReturnValue({}),
    insert: mock().mockReturnValue({ success: true }),
    rebuild: mock().mockReturnValue({ success: true }),
    remove: mock().mockReturnValue({ success: true }),
  };
}

const validTarget = { kind: 'inline', nodeType: 'crossRef' };

describe('cross-refs validation', () => {
  // ── Target validation ───────────────────────────────────────────────
  describe('validateCrossRefTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeCrossRefsGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
      try {
        executeCrossRefsGet(adapter, { target: null as any });
      } catch (e: any) {
        expect(e.code).toBe('INVALID_TARGET');
      }
    });

    it('throws INVALID_TARGET for undefined target', () => {
      const adapter = makeAdapter();
      expect(() => executeCrossRefsGet(adapter, { target: undefined as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeCrossRefsGet(adapter, {
          target: { kind: 'block', nodeType: 'crossRef' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong nodeType', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeCrossRefsGet(adapter, {
          target: { kind: 'inline', nodeType: 'hyperlink' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });
  });

  // ── Input validation ────────────────────────────────────────────────
  describe('executeCrossRefsInsert', () => {
    it('throws INVALID_INPUT when target is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeCrossRefsInsert(adapter, { display: 'above' } as any)).toThrow(DocumentApiValidationError);
      try {
        executeCrossRefsInsert(adapter, { display: 'above' } as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when target.kind is not a string', () => {
      const adapter = makeAdapter();
      expect(() => executeCrossRefsInsert(adapter, { target: { kind: 123 }, display: 'above' } as any)).toThrow(
        DocumentApiValidationError,
      );
    });

    it('throws INVALID_INPUT when display is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeCrossRefsInsert(adapter, { target: { kind: 'bookmark', name: 'bm1' } } as any)).toThrow(
        DocumentApiValidationError,
      );
    });

    it('delegates to adapter.insert for valid input', () => {
      const adapter = makeAdapter();
      const input = { target: { kind: 'bookmark', name: 'bm1' }, display: 'pageNumber' };
      executeCrossRefsInsert(adapter, input as any);
      expect(adapter.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Delegation tests ────────────────────────────────────────────────
  describe('executeCrossRefsList', () => {
    it('delegates to adapter.list', () => {
      const adapter = makeAdapter();
      executeCrossRefsList(adapter);
      expect(adapter.list).toHaveBeenCalledWith(undefined);
    });

    it('passes query through', () => {
      const adapter = makeAdapter();
      const query = { limit: 10 };
      executeCrossRefsList(adapter, query as any);
      expect(adapter.list).toHaveBeenCalledWith(query);
    });
  });

  describe('executeCrossRefsGet', () => {
    it('delegates to adapter.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeCrossRefsGet(adapter, input as any);
      expect(adapter.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeCrossRefsRebuild', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeCrossRefsRebuild(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.rebuild with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeCrossRefsRebuild(adapter, input as any, { dryRun: true });
      expect(adapter.rebuild).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: true });
    });
  });

  describe('executeCrossRefsRemove', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeCrossRefsRemove(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.remove with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeCrossRefsRemove(adapter, input as any);
      expect(adapter.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });
});
