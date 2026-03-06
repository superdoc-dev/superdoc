import { describe, it, expect, vi } from 'vitest';
import { DocumentApiValidationError } from '../errors.js';
import {
  executeLinksList,
  executeLinksGet,
  executeLinksInsert,
  executeLinksUpdate,
  executeLinksRemove,
  type LinksAdapter,
} from './links.js';

function makeAdapter(): LinksAdapter {
  return {
    list: vi.fn().mockReturnValue({ items: [], total: 0 }),
    get: vi.fn().mockReturnValue({}),
    insert: vi.fn().mockReturnValue({ success: true }),
    update: vi.fn().mockReturnValue({ success: true }),
    remove: vi.fn().mockReturnValue({ success: true }),
  };
}

const validTarget = {
  kind: 'inline',
  nodeType: 'hyperlink',
  anchor: { start: { blockId: 'b1', offset: 0 }, end: { blockId: 'b1', offset: 5 } },
};

describe('links validation', () => {
  // ── Target validation ───────────────────────────────────────────────
  describe('validateLinkTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeLinksGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
      try {
        executeLinksGet(adapter, { target: null as any });
      } catch (e: any) {
        expect(e.code).toBe('INVALID_TARGET');
      }
    });

    it('throws INVALID_TARGET for undefined target', () => {
      const adapter = makeAdapter();
      expect(() => executeLinksGet(adapter, { target: undefined as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeLinksGet(adapter, {
          target: { kind: 'block', nodeType: 'hyperlink', anchor: validTarget.anchor } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong nodeType', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeLinksGet(adapter, {
          target: { kind: 'inline', nodeType: 'bookmark', anchor: validTarget.anchor } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when anchor is missing', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeLinksGet(adapter, {
          target: { kind: 'inline', nodeType: 'hyperlink' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when anchor.start is missing', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeLinksGet(adapter, {
          target: { kind: 'inline', nodeType: 'hyperlink', anchor: { end: {} } } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when anchor.end is missing', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeLinksGet(adapter, {
          target: { kind: 'inline', nodeType: 'hyperlink', anchor: { start: {} } } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });
  });

  // ── Input validation ────────────────────────────────────────────────
  describe('executeLinksInsert', () => {
    it('throws INVALID_INPUT when destination is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeLinksInsert(adapter, {} as any)).toThrow(DocumentApiValidationError);
      try {
        executeLinksInsert(adapter, {} as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when destination.kind is not a string', () => {
      const adapter = makeAdapter();
      expect(() => executeLinksInsert(adapter, { destination: { kind: 123 } } as any)).toThrow(
        DocumentApiValidationError,
      );
    });

    it('delegates to adapter.insert with normalized options', () => {
      const adapter = makeAdapter();
      const input = { destination: { kind: 'url', url: 'https://example.com' } };
      executeLinksInsert(adapter, input as any, { dryRun: true });
      expect(adapter.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: true });
    });
  });

  // ── Delegation tests ────────────────────────────────────────────────
  describe('executeLinksList', () => {
    it('delegates to adapter.list', () => {
      const adapter = makeAdapter();
      executeLinksList(adapter);
      expect(adapter.list).toHaveBeenCalledWith(undefined);
    });

    it('passes query through', () => {
      const adapter = makeAdapter();
      const query = { limit: 5 };
      executeLinksList(adapter, query as any);
      expect(adapter.list).toHaveBeenCalledWith(query);
    });
  });

  describe('executeLinksGet', () => {
    it('delegates to adapter.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeLinksGet(adapter, input as any);
      expect(adapter.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeLinksUpdate', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeLinksUpdate(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.update with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeLinksUpdate(adapter, input as any);
      expect(adapter.update).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeLinksRemove', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeLinksRemove(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.remove with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeLinksRemove(adapter, input as any);
      expect(adapter.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });
});
