import { describe, expect, it, vi } from 'vitest';
import { executeBlocksDelete, type BlocksAdapter } from './blocks.js';
import type { BlocksDeleteInput, BlocksDeleteResult } from '../types/blocks.types.js';
import { DocumentApiValidationError } from '../errors.js';

function makeAdapter(result?: BlocksDeleteResult): BlocksAdapter {
  const defaultResult: BlocksDeleteResult = {
    success: true,
    deleted: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
  };
  return {
    delete: vi.fn(() => result ?? defaultResult),
  };
}

function makeInput(nodeType: string, nodeId: string): BlocksDeleteInput {
  return { target: { kind: 'block', nodeType: nodeType as BlocksDeleteInput['target']['nodeType'], nodeId } };
}

describe('executeBlocksDelete', () => {
  describe('input validation', () => {
    it('rejects null input', () => {
      expect(() => executeBlocksDelete(makeAdapter(), null as any)).toThrow(DocumentApiValidationError);
    });

    it('rejects input without target', () => {
      expect(() => executeBlocksDelete(makeAdapter(), {} as any)).toThrow(DocumentApiValidationError);
    });

    it('rejects target with wrong kind', () => {
      expect(() =>
        executeBlocksDelete(makeAdapter(), {
          target: { kind: 'text' as any, blockId: 'p1', range: { start: 0, end: 1 } },
        } as any),
      ).toThrow(DocumentApiValidationError);
    });

    it('rejects target without nodeId', () => {
      expect(() =>
        executeBlocksDelete(makeAdapter(), {
          target: { kind: 'block', nodeType: 'paragraph' },
        } as any),
      ).toThrow(DocumentApiValidationError);
    });

    it('rejects tableRow target', () => {
      try {
        executeBlocksDelete(makeAdapter(), makeInput('tableRow', 'tr1'));
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DocumentApiValidationError);
        expect((error as DocumentApiValidationError).code).toBe('INVALID_TARGET');
        expect((error as DocumentApiValidationError).message).toContain('tableRow');
      }
    });

    it('rejects tableCell target', () => {
      try {
        executeBlocksDelete(makeAdapter(), makeInput('tableCell', 'tc1'));
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DocumentApiValidationError);
        expect((error as DocumentApiValidationError).code).toBe('INVALID_TARGET');
      }
    });

    it('rejects unknown node type', () => {
      try {
        executeBlocksDelete(makeAdapter(), makeInput('footnote', 'fn1'));
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DocumentApiValidationError);
        expect((error as DocumentApiValidationError).code).toBe('INVALID_TARGET');
      }
    });
  });

  describe('valid input', () => {
    it('accepts paragraph target', () => {
      const adapter = makeAdapter();
      const result = executeBlocksDelete(adapter, makeInput('paragraph', 'p1'));
      expect(result.success).toBe(true);
      expect(adapter.delete).toHaveBeenCalledWith(
        makeInput('paragraph', 'p1'),
        expect.objectContaining({ changeMode: 'direct' }),
      );
    });

    it('accepts heading target', () => {
      const adapter = makeAdapter({ success: true, deleted: { kind: 'block', nodeType: 'heading', nodeId: 'h1' } });
      const result = executeBlocksDelete(adapter, makeInput('heading', 'h1'));
      expect(result.success).toBe(true);
    });

    it('accepts listItem target', () => {
      const adapter = makeAdapter({ success: true, deleted: { kind: 'block', nodeType: 'listItem', nodeId: 'li1' } });
      const result = executeBlocksDelete(adapter, makeInput('listItem', 'li1'));
      expect(result.success).toBe(true);
    });

    it('accepts table target', () => {
      const adapter = makeAdapter({ success: true, deleted: { kind: 'block', nodeType: 'table', nodeId: 't1' } });
      const result = executeBlocksDelete(adapter, makeInput('table', 't1'));
      expect(result.success).toBe(true);
    });

    it('rejects image target (inline-only in ProseMirror schema)', () => {
      expect(() => executeBlocksDelete(makeAdapter(), makeInput('image', 'img1'))).toThrow(DocumentApiValidationError);
    });

    it('accepts sdt target', () => {
      const adapter = makeAdapter({ success: true, deleted: { kind: 'block', nodeType: 'sdt', nodeId: 'sdt1' } });
      const result = executeBlocksDelete(adapter, makeInput('sdt', 'sdt1'));
      expect(result.success).toBe(true);
    });
  });

  describe('mutation options normalization', () => {
    it('defaults changeMode to direct when omitted', () => {
      const adapter = makeAdapter();
      executeBlocksDelete(adapter, makeInput('paragraph', 'p1'));
      expect(adapter.delete).toHaveBeenCalledWith(
        makeInput('paragraph', 'p1'),
        expect.objectContaining({ changeMode: 'direct' }),
      );
    });

    it('passes through dryRun option', () => {
      const adapter = makeAdapter();
      executeBlocksDelete(adapter, makeInput('paragraph', 'p1'), { dryRun: true });
      expect(adapter.delete).toHaveBeenCalledWith(
        makeInput('paragraph', 'p1'),
        expect.objectContaining({ dryRun: true }),
      );
    });

    it('passes through changeMode option', () => {
      const adapter = makeAdapter();
      executeBlocksDelete(adapter, makeInput('paragraph', 'p1'), { changeMode: 'direct' });
      expect(adapter.delete).toHaveBeenCalledWith(
        makeInput('paragraph', 'p1'),
        expect.objectContaining({ changeMode: 'direct' }),
      );
    });
  });
});
