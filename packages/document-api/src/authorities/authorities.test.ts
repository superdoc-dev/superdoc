import { describe, it, expect, mock } from 'bun:test';
import { DocumentApiValidationError } from '../errors.js';
import {
  executeAuthoritiesList,
  executeAuthoritiesGet,
  executeAuthoritiesInsert,
  executeAuthoritiesConfigure,
  executeAuthoritiesRebuild,
  executeAuthoritiesRemove,
  executeAuthorityEntriesList,
  executeAuthorityEntriesGet,
  executeAuthorityEntriesInsert,
  executeAuthorityEntriesUpdate,
  executeAuthorityEntriesRemove,
  type AuthoritiesAdapter,
} from './authorities.js';

function makeAdapter(): AuthoritiesAdapter {
  return {
    list: mock().mockReturnValue({ items: [], total: 0 }),
    get: mock().mockReturnValue({}),
    insert: mock().mockReturnValue({ success: true }),
    configure: mock().mockReturnValue({ success: true }),
    rebuild: mock().mockReturnValue({ success: true }),
    remove: mock().mockReturnValue({ success: true }),
    entries: {
      list: mock().mockReturnValue({ items: [], total: 0 }),
      get: mock().mockReturnValue({}),
      insert: mock().mockReturnValue({ success: true }),
      update: mock().mockReturnValue({ success: true }),
      remove: mock().mockReturnValue({ success: true }),
    },
  };
}

const validAuthoritiesTarget = { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: 'toa-1' };
const validEntryTarget = { kind: 'inline', nodeType: 'authorityEntry' };

describe('authorities validation', () => {
  // ── Authorities target validation ───────────────────────────────────
  describe('validateAuthoritiesTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthoritiesGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
      try {
        executeAuthoritiesGet(adapter, { target: null as any });
      } catch (e: any) {
        expect(e.code).toBe('INVALID_TARGET');
      }
    });

    it('throws INVALID_TARGET for undefined target', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthoritiesGet(adapter, { target: undefined as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeAuthoritiesGet(adapter, {
          target: { kind: 'inline', nodeType: 'tableOfAuthorities', nodeId: 'toa-1' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong nodeType', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeAuthoritiesGet(adapter, {
          target: { kind: 'block', nodeType: 'index', nodeId: 'toa-1' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when nodeId is not a string', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeAuthoritiesGet(adapter, {
          target: { kind: 'block', nodeType: 'tableOfAuthorities', nodeId: 42 } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when nodeId is missing', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeAuthoritiesGet(adapter, {
          target: { kind: 'block', nodeType: 'tableOfAuthorities' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });
  });

  // ── Authority entry target validation ───────────────────────────────
  describe('validateAuthorityEntryTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthorityEntriesGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for undefined target', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthorityEntriesGet(adapter, { target: undefined as any })).toThrow(
        DocumentApiValidationError,
      );
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeAuthorityEntriesGet(adapter, {
          target: { kind: 'block', nodeType: 'authorityEntry' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong nodeType', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeAuthorityEntriesGet(adapter, {
          target: { kind: 'inline', nodeType: 'hyperlink' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });
  });

  // ── Input validation ────────────────────────────────────────────────
  describe('executeAuthorityEntriesInsert', () => {
    it('throws INVALID_INPUT when entry is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthorityEntriesInsert(adapter, {} as any)).toThrow(DocumentApiValidationError);
      try {
        executeAuthorityEntriesInsert(adapter, {} as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when entry.longCitation is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthorityEntriesInsert(adapter, { entry: {} } as any)).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_INPUT when entry.longCitation is empty', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthorityEntriesInsert(adapter, { entry: { longCitation: '' } } as any)).toThrow(
        DocumentApiValidationError,
      );
    });

    it('delegates to adapter.entries.insert for valid input', () => {
      const adapter = makeAdapter();
      const input = { entry: { longCitation: 'Smith v. Jones, 123 F.3d 456 (2020)' } };
      executeAuthorityEntriesInsert(adapter, input as any);
      expect(adapter.entries.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Authorities delegation tests ────────────────────────────────────
  describe('executeAuthoritiesList', () => {
    it('delegates to adapter.list', () => {
      const adapter = makeAdapter();
      executeAuthoritiesList(adapter);
      expect(adapter.list).toHaveBeenCalledWith(undefined);
    });

    it('passes query through', () => {
      const adapter = makeAdapter();
      const query = { limit: 10 };
      executeAuthoritiesList(adapter, query as any);
      expect(adapter.list).toHaveBeenCalledWith(query);
    });
  });

  describe('executeAuthoritiesGet', () => {
    it('delegates to adapter.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validAuthoritiesTarget };
      executeAuthoritiesGet(adapter, input as any);
      expect(adapter.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeAuthoritiesInsert', () => {
    it('delegates to adapter.insert (no target validation)', () => {
      const adapter = makeAdapter();
      const input = { position: 'end' };
      executeAuthoritiesInsert(adapter, input as any);
      expect(adapter.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeAuthoritiesConfigure', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthoritiesConfigure(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.configure for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validAuthoritiesTarget };
      executeAuthoritiesConfigure(adapter, input as any);
      expect(adapter.configure).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeAuthoritiesRebuild', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthoritiesRebuild(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.rebuild for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validAuthoritiesTarget };
      executeAuthoritiesRebuild(adapter, input as any, { dryRun: true });
      expect(adapter.rebuild).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: true });
    });
  });

  describe('executeAuthoritiesRemove', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthoritiesRemove(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.remove for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validAuthoritiesTarget };
      executeAuthoritiesRemove(adapter, input as any);
      expect(adapter.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Authority entry delegation tests ────────────────────────────────
  describe('executeAuthorityEntriesList', () => {
    it('delegates to adapter.entries.list', () => {
      const adapter = makeAdapter();
      executeAuthorityEntriesList(adapter);
      expect(adapter.entries.list).toHaveBeenCalledWith(undefined);
    });
  });

  describe('executeAuthorityEntriesGet', () => {
    it('delegates to adapter.entries.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validEntryTarget };
      executeAuthorityEntriesGet(adapter, input as any);
      expect(adapter.entries.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeAuthorityEntriesUpdate', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthorityEntriesUpdate(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.entries.update for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validEntryTarget };
      executeAuthorityEntriesUpdate(adapter, input as any);
      expect(adapter.entries.update).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeAuthorityEntriesRemove', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeAuthorityEntriesRemove(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.entries.remove for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validEntryTarget };
      executeAuthorityEntriesRemove(adapter, input as any);
      expect(adapter.entries.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });
});
