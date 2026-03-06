import { describe, it, expect, vi } from 'vitest';
import { DocumentApiValidationError } from '../errors.js';
import {
  executeCitationsList,
  executeCitationsGet,
  executeCitationsInsert,
  executeCitationsUpdate,
  executeCitationsRemove,
  executeCitationSourcesList,
  executeCitationSourcesGet,
  executeCitationSourcesInsert,
  executeCitationSourcesUpdate,
  executeCitationSourcesRemove,
  executeBibliographyGet,
  executeBibliographyInsert,
  executeBibliographyRebuild,
  executeBibliographyConfigure,
  executeBibliographyRemove,
  type CitationsAdapter,
} from './citations.js';

function makeAdapter(): CitationsAdapter {
  return {
    list: vi.fn().mockReturnValue({ items: [], total: 0 }),
    get: vi.fn().mockReturnValue({}),
    insert: vi.fn().mockReturnValue({ success: true }),
    update: vi.fn().mockReturnValue({ success: true }),
    remove: vi.fn().mockReturnValue({ success: true }),
    sources: {
      list: vi.fn().mockReturnValue({ items: [], total: 0 }),
      get: vi.fn().mockReturnValue({}),
      insert: vi.fn().mockReturnValue({ success: true }),
      update: vi.fn().mockReturnValue({ success: true }),
      remove: vi.fn().mockReturnValue({ success: true }),
    },
    bibliography: {
      get: vi.fn().mockReturnValue({}),
      insert: vi.fn().mockReturnValue({ success: true }),
      rebuild: vi.fn().mockReturnValue({ success: true }),
      configure: vi.fn().mockReturnValue({ success: true }),
      remove: vi.fn().mockReturnValue({ success: true }),
    },
  };
}

const validCitationTarget = { kind: 'inline', nodeType: 'citation' };
const validSourceTarget = { kind: 'entity', entityType: 'citationSource', sourceId: 'src-1' };
const validBibTarget = { kind: 'block', nodeType: 'bibliography', nodeId: 'bib-1' };

describe('citations validation', () => {
  // ── Citation target validation ──────────────────────────────────────
  describe('validateCitationTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationsGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
      try {
        executeCitationsGet(adapter, { target: null as any });
      } catch (e: any) {
        expect(e.code).toBe('INVALID_TARGET');
      }
    });

    it('throws INVALID_TARGET for undefined target', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationsGet(adapter, { target: undefined as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationsGet(adapter, { target: { kind: 'block', nodeType: 'citation' } as any })).toThrow(
        DocumentApiValidationError,
      );
    });

    it('throws INVALID_TARGET for wrong nodeType', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationsGet(adapter, { target: { kind: 'inline', nodeType: 'hyperlink' } as any })).toThrow(
        DocumentApiValidationError,
      );
    });
  });

  // ── Citation source target validation ───────────────────────────────
  describe('validateCitationSourceTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationSourcesGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeCitationSourcesGet(adapter, {
          target: { kind: 'inline', entityType: 'citationSource', sourceId: 'x' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong entityType', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeCitationSourcesGet(adapter, {
          target: { kind: 'entity', entityType: 'bookmark', sourceId: 'x' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when sourceId is not a string', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeCitationSourcesGet(adapter, {
          target: { kind: 'entity', entityType: 'citationSource', sourceId: 42 } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when sourceId is missing', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeCitationSourcesGet(adapter, {
          target: { kind: 'entity', entityType: 'citationSource' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });
  });

  // ── Bibliography target validation ──────────────────────────────────
  describe('validateBibliographyTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeBibliographyGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeBibliographyGet(adapter, {
          target: { kind: 'inline', nodeType: 'bibliography', nodeId: 'x' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong nodeType', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeBibliographyGet(adapter, {
          target: { kind: 'block', nodeType: 'index', nodeId: 'x' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when nodeId is not a string', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeBibliographyGet(adapter, {
          target: { kind: 'block', nodeType: 'bibliography', nodeId: 42 } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });
  });

  // ── Citation input validation ───────────────────────────────────────
  describe('executeCitationsInsert', () => {
    it('throws INVALID_INPUT when sourceIds is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationsInsert(adapter, {} as any)).toThrow(DocumentApiValidationError);
      try {
        executeCitationsInsert(adapter, {} as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when sourceIds is empty array', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationsInsert(adapter, { sourceIds: [] } as any)).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_INPUT when sourceIds is not an array', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationsInsert(adapter, { sourceIds: 'src-1' } as any)).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.insert for valid input', () => {
      const adapter = makeAdapter();
      const input = { sourceIds: ['src-1', 'src-2'] };
      executeCitationsInsert(adapter, input as any);
      expect(adapter.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Citation source input validation ────────────────────────────────
  describe('executeCitationSourcesInsert', () => {
    it('throws INVALID_INPUT when type is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationSourcesInsert(adapter, {} as any)).toThrow(DocumentApiValidationError);
      try {
        executeCitationSourcesInsert(adapter, {} as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when type is empty', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationSourcesInsert(adapter, { type: '' } as any)).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.sources.insert for valid input', () => {
      const adapter = makeAdapter();
      const input = { type: 'book', title: 'A Title' };
      executeCitationSourcesInsert(adapter, input as any);
      expect(adapter.sources.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Bibliography input validation ───────────────────────────────────
  describe('executeBibliographyConfigure', () => {
    it('throws INVALID_INPUT when style is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeBibliographyConfigure(adapter, {} as any)).toThrow(DocumentApiValidationError);
      try {
        executeBibliographyConfigure(adapter, {} as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when style is empty', () => {
      const adapter = makeAdapter();
      expect(() => executeBibliographyConfigure(adapter, { style: '' } as any)).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_INPUT when style is not a string', () => {
      const adapter = makeAdapter();
      expect(() => executeBibliographyConfigure(adapter, { style: 42 } as any)).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.bibliography.configure for valid input', () => {
      const adapter = makeAdapter();
      const input = { style: 'apa' };
      executeBibliographyConfigure(adapter, input as any);
      expect(adapter.bibliography.configure).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Delegation tests — Citations ────────────────────────────────────
  describe('executeCitationsList', () => {
    it('delegates to adapter.list', () => {
      const adapter = makeAdapter();
      executeCitationsList(adapter);
      expect(adapter.list).toHaveBeenCalledWith(undefined);
    });
  });

  describe('executeCitationsGet', () => {
    it('delegates to adapter.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validCitationTarget };
      executeCitationsGet(adapter, input as any);
      expect(adapter.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeCitationsUpdate', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationsUpdate(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.update with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validCitationTarget };
      executeCitationsUpdate(adapter, input as any);
      expect(adapter.update).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeCitationsRemove', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationsRemove(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.remove with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validCitationTarget };
      executeCitationsRemove(adapter, input as any);
      expect(adapter.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Delegation tests — Citation Sources ─────────────────────────────
  describe('executeCitationSourcesList', () => {
    it('delegates to adapter.sources.list', () => {
      const adapter = makeAdapter();
      executeCitationSourcesList(adapter);
      expect(adapter.sources.list).toHaveBeenCalledWith(undefined);
    });
  });

  describe('executeCitationSourcesGet', () => {
    it('delegates to adapter.sources.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validSourceTarget };
      executeCitationSourcesGet(adapter, input as any);
      expect(adapter.sources.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeCitationSourcesUpdate', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationSourcesUpdate(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.sources.update with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validSourceTarget };
      executeCitationSourcesUpdate(adapter, input as any);
      expect(adapter.sources.update).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeCitationSourcesRemove', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeCitationSourcesRemove(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.sources.remove with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validSourceTarget };
      executeCitationSourcesRemove(adapter, input as any);
      expect(adapter.sources.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Delegation tests — Bibliography ─────────────────────────────────
  describe('executeBibliographyGet', () => {
    it('delegates to adapter.bibliography.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validBibTarget };
      executeBibliographyGet(adapter, input as any);
      expect(adapter.bibliography.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeBibliographyInsert', () => {
    it('delegates to adapter.bibliography.insert (no input validation)', () => {
      const adapter = makeAdapter();
      const input = { position: 'end' };
      executeBibliographyInsert(adapter, input as any);
      expect(adapter.bibliography.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeBibliographyRebuild', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeBibliographyRebuild(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.bibliography.rebuild with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validBibTarget };
      executeBibliographyRebuild(adapter, input as any, { dryRun: true });
      expect(adapter.bibliography.rebuild).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: true });
    });
  });

  describe('executeBibliographyRemove', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeBibliographyRemove(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.bibliography.remove with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validBibTarget };
      executeBibliographyRemove(adapter, input as any);
      expect(adapter.bibliography.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });
});
