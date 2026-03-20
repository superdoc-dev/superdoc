import { describe, it, expect, mock } from 'bun:test';
import { DocumentApiValidationError } from '../errors.js';
import {
  executeFieldsList,
  executeFieldsGet,
  executeFieldsInsert,
  executeFieldsRebuild,
  executeFieldsRemove,
  type FieldsAdapter,
} from './fields.js';

function makeAdapter(): FieldsAdapter {
  return {
    list: mock().mockReturnValue({ items: [], total: 0 }),
    get: mock().mockReturnValue({}),
    insert: mock().mockReturnValue({ success: true }),
    rebuild: mock().mockReturnValue({ success: true }),
    remove: mock().mockReturnValue({ success: true }),
  };
}

const validTarget = { kind: 'field', blockId: 'b1', occurrenceIndex: 0 };

describe('fields validation', () => {
  // ── Target validation ───────────────────────────────────────────────
  describe('validateFieldTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeFieldsGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
      try {
        executeFieldsGet(adapter, { target: null as any });
      } catch (e: any) {
        expect(e.code).toBe('INVALID_TARGET');
      }
    });

    it('throws INVALID_TARGET for undefined target', () => {
      const adapter = makeAdapter();
      expect(() => executeFieldsGet(adapter, { target: undefined as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeFieldsGet(adapter, {
          target: { kind: 'block', blockId: 'b1', occurrenceIndex: 0 } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when blockId is not a string', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeFieldsGet(adapter, {
          target: { kind: 'field', blockId: 123, occurrenceIndex: 0 } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when occurrenceIndex is not a number', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeFieldsGet(adapter, {
          target: { kind: 'field', blockId: 'b1', occurrenceIndex: '0' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when blockId is missing', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeFieldsGet(adapter, {
          target: { kind: 'field', occurrenceIndex: 0 } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });
  });

  // ── Input validation ────────────────────────────────────────────────
  describe('executeFieldsInsert', () => {
    it('throws INVALID_INPUT when mode is not raw', () => {
      const adapter = makeAdapter();
      expect(() => executeFieldsInsert(adapter, { mode: 'normal', instruction: 'TOC' } as any)).toThrow(
        DocumentApiValidationError,
      );
      try {
        executeFieldsInsert(adapter, { mode: 'normal', instruction: 'TOC' } as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when mode is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeFieldsInsert(adapter, { instruction: 'TOC' } as any)).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_INPUT when instruction is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeFieldsInsert(adapter, { mode: 'raw' } as any)).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_INPUT when instruction is empty', () => {
      const adapter = makeAdapter();
      expect(() => executeFieldsInsert(adapter, { mode: 'raw', instruction: '' } as any)).toThrow(
        DocumentApiValidationError,
      );
    });

    it('throws INVALID_INPUT when instruction is not a string', () => {
      const adapter = makeAdapter();
      expect(() => executeFieldsInsert(adapter, { mode: 'raw', instruction: 42 } as any)).toThrow(
        DocumentApiValidationError,
      );
    });

    it('delegates to adapter.insert for valid input', () => {
      const adapter = makeAdapter();
      const input = { mode: 'raw', instruction: 'TOC \\o "1-3"' };
      executeFieldsInsert(adapter, input as any);
      expect(adapter.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeFieldsRemove', () => {
    it('throws INVALID_INPUT when mode is not raw', () => {
      const adapter = makeAdapter();
      expect(() => executeFieldsRemove(adapter, { mode: 'normal', target: validTarget } as any)).toThrow(
        DocumentApiValidationError,
      );
      try {
        executeFieldsRemove(adapter, { mode: 'normal', target: validTarget } as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when mode is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeFieldsRemove(adapter, { target: validTarget } as any)).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for invalid target after mode check', () => {
      const adapter = makeAdapter();
      expect(() => executeFieldsRemove(adapter, { mode: 'raw', target: null } as any)).toThrow(
        DocumentApiValidationError,
      );
    });

    it('delegates to adapter.remove for valid input', () => {
      const adapter = makeAdapter();
      const input = { mode: 'raw', target: validTarget };
      executeFieldsRemove(adapter, input as any);
      expect(adapter.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  // ── Delegation tests ────────────────────────────────────────────────
  describe('executeFieldsList', () => {
    it('delegates to adapter.list', () => {
      const adapter = makeAdapter();
      executeFieldsList(adapter);
      expect(adapter.list).toHaveBeenCalledWith(undefined);
    });

    it('passes query through', () => {
      const adapter = makeAdapter();
      const query = { fieldType: 'TOC' };
      executeFieldsList(adapter, query as any);
      expect(adapter.list).toHaveBeenCalledWith(query);
    });
  });

  describe('executeFieldsGet', () => {
    it('delegates to adapter.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeFieldsGet(adapter, input as any);
      expect(adapter.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeFieldsRebuild', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeFieldsRebuild(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.rebuild with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeFieldsRebuild(adapter, input as any, { dryRun: true });
      expect(adapter.rebuild).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: true });
    });
  });
});
