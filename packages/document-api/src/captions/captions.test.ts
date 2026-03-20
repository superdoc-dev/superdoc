import { describe, it, expect, mock } from 'bun:test';
import { DocumentApiValidationError } from '../errors.js';
import {
  executeCaptionsList,
  executeCaptionsGet,
  executeCaptionsInsert,
  executeCaptionsUpdate,
  executeCaptionsRemove,
  executeCaptionsConfigure,
  type CaptionsAdapter,
} from './captions.js';

function makeAdapter(): CaptionsAdapter {
  return {
    list: mock().mockReturnValue({ items: [], total: 0 }),
    get: mock().mockReturnValue({}),
    insert: mock().mockReturnValue({ success: true }),
    update: mock().mockReturnValue({ success: true }),
    remove: mock().mockReturnValue({ success: true }),
    configure: mock().mockReturnValue({ success: true }),
  };
}

const validTarget = { kind: 'block', nodeType: 'paragraph', nodeId: 'cap-1' };

describe('captions validation', () => {
  // ── Target validation ───────────────────────────────────────────────
  describe('validateCaptionTarget', () => {
    it('throws INVALID_TARGET for null target', () => {
      const adapter = makeAdapter();
      expect(() => executeCaptionsGet(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
      try {
        executeCaptionsGet(adapter, { target: null as any });
      } catch (e: any) {
        expect(e.code).toBe('INVALID_TARGET');
      }
    });

    it('throws INVALID_TARGET for undefined target', () => {
      const adapter = makeAdapter();
      expect(() => executeCaptionsGet(adapter, { target: undefined as any })).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong kind', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeCaptionsGet(adapter, {
          target: { kind: 'inline', nodeType: 'paragraph', nodeId: 'cap-1' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET for wrong nodeType', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeCaptionsGet(adapter, {
          target: { kind: 'block', nodeType: 'table', nodeId: 'cap-1' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when nodeId is not a string', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeCaptionsGet(adapter, {
          target: { kind: 'block', nodeType: 'paragraph', nodeId: 42 } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_TARGET when nodeId is missing', () => {
      const adapter = makeAdapter();
      expect(() =>
        executeCaptionsGet(adapter, {
          target: { kind: 'block', nodeType: 'paragraph' } as any,
        }),
      ).toThrow(DocumentApiValidationError);
    });
  });

  // ── Input validation ────────────────────────────────────────────────
  describe('executeCaptionsInsert', () => {
    it('throws INVALID_INPUT when label is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeCaptionsInsert(adapter, {} as any)).toThrow(DocumentApiValidationError);
      try {
        executeCaptionsInsert(adapter, {} as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when label is empty', () => {
      const adapter = makeAdapter();
      expect(() => executeCaptionsInsert(adapter, { label: '' } as any)).toThrow(DocumentApiValidationError);
    });

    it('throws INVALID_INPUT when label is not a string', () => {
      const adapter = makeAdapter();
      expect(() => executeCaptionsInsert(adapter, { label: 123 } as any)).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.insert for valid input', () => {
      const adapter = makeAdapter();
      const input = { label: 'Figure' };
      executeCaptionsInsert(adapter, input as any);
      expect(adapter.insert).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeCaptionsConfigure', () => {
    it('throws INVALID_INPUT when label is missing', () => {
      const adapter = makeAdapter();
      expect(() => executeCaptionsConfigure(adapter, {} as any)).toThrow(DocumentApiValidationError);
      try {
        executeCaptionsConfigure(adapter, {} as any);
      } catch (e: any) {
        expect(e.code).toBe('INVALID_INPUT');
      }
    });

    it('throws INVALID_INPUT when label is empty', () => {
      const adapter = makeAdapter();
      expect(() => executeCaptionsConfigure(adapter, { label: '' } as any)).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.configure for valid input', () => {
      const adapter = makeAdapter();
      const input = { label: 'Table' };
      executeCaptionsConfigure(adapter, input as any, { dryRun: true });
      expect(adapter.configure).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: true });
    });
  });

  // ── Delegation tests ────────────────────────────────────────────────
  describe('executeCaptionsList', () => {
    it('delegates to adapter.list', () => {
      const adapter = makeAdapter();
      executeCaptionsList(adapter);
      expect(adapter.list).toHaveBeenCalledWith(undefined);
    });

    it('passes input through', () => {
      const adapter = makeAdapter();
      const input = { label: 'Figure' };
      executeCaptionsList(adapter, input as any);
      expect(adapter.list).toHaveBeenCalledWith(input);
    });
  });

  describe('executeCaptionsGet', () => {
    it('delegates to adapter.get for valid target', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeCaptionsGet(adapter, input as any);
      expect(adapter.get).toHaveBeenCalledWith(input);
    });
  });

  describe('executeCaptionsUpdate', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeCaptionsUpdate(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.update with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeCaptionsUpdate(adapter, input as any);
      expect(adapter.update).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });

  describe('executeCaptionsRemove', () => {
    it('throws INVALID_TARGET for invalid target', () => {
      const adapter = makeAdapter();
      expect(() => executeCaptionsRemove(adapter, { target: null as any })).toThrow(DocumentApiValidationError);
    });

    it('delegates to adapter.remove with normalized options', () => {
      const adapter = makeAdapter();
      const input = { target: validTarget };
      executeCaptionsRemove(adapter, input as any);
      expect(adapter.remove).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
    });
  });
});
