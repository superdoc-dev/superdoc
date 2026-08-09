import { describe, expect, it } from 'bun:test';
import { executeBlocksDelete, type BlocksAdapter } from '../blocks/blocks.js';
import type { BlocksDeleteResult } from '../types/blocks.types.js';
import { DocumentApiValidationError } from '../errors.js';
import { OPERATION_DEFINITIONS } from './operation-definitions.js';
import { buildInternalContractSchemas } from './schemas.js';

function makeAdapter(result?: BlocksDeleteResult): BlocksAdapter {
  const defaultResult: BlocksDeleteResult = {
    success: true,
    deleted: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
  };

  return {
    delete: () => result ?? defaultResult,
  };
}

describe('blocks.delete contract metadata', () => {
  it('declares INVALID_INPUT in throws.preApply for malformed input', () => {
    try {
      executeBlocksDelete(makeAdapter(), null as never);
      expect.unreachable('expected INVALID_INPUT validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentApiValidationError);
      expect((error as DocumentApiValidationError).code).toBe('INVALID_INPUT');
    }

    expect(OPERATION_DEFINITIONS['blocks.delete'].metadata.throws.preApply).toContain('INVALID_INPUT');
  });

  it('advertises tracked deleteRange receipts in metadata and schemas', () => {
    expect(OPERATION_DEFINITIONS['blocks.deleteRange'].metadata.supportsTrackedMode).toBe(true);

    const deleteRangeSchemas = buildInternalContractSchemas().operations['blocks.deleteRange'];
    const receiptFields = [
      'affectedStories',
      'deletedBlocks',
      'deletedCount',
      'dryRun',
      'invalidatedRefs',
      'revision',
      'success',
      'textRangeShifts',
      'trackedChangeRefs',
      'txId',
    ];

    for (const schema of [deleteRangeSchemas.output, deleteRangeSchemas.success]) {
      expect(schema).toBeDefined();
      expect(schema!.additionalProperties).toBe(false);
      expect(Object.keys(schema!.properties as Record<string, unknown>).sort()).toEqual(receiptFields);
    }
  });
});
