import { describe, expect, test } from 'bun:test';
import { mapInvokeError, mapFailedReceipt } from '../../lib/error-mapping';
import { CliError } from '../../lib/errors';

describe('mapInvokeError', () => {
  test('maps blocks.delete INVALID_INPUT errors to INVALID_ARGUMENT', () => {
    const error = Object.assign(new Error('blocks.delete requires a target.'), {
      code: 'INVALID_INPUT',
      details: { field: 'target' },
    });

    const mapped = mapInvokeError('blocks.delete', error);
    expect(mapped.code).toBe('INVALID_ARGUMENT');
    expect(mapped.message).toBe('blocks.delete requires a target.');
    expect(mapped.details).toEqual({ operationId: 'blocks.delete', details: { field: 'target' } });
  });
});

// ---------------------------------------------------------------------------
// T8: Plan-engine error code passthrough in CLI error mapping
// ---------------------------------------------------------------------------

describe('mapInvokeError: plan-engine error passthrough', () => {
  const operationId = 'mutations.apply' as any;

  test('REVISION_MISMATCH preserves code and structured details', () => {
    const error = Object.assign(new Error('REVISION_MISMATCH — stale ref'), {
      code: 'REVISION_MISMATCH',
      details: {
        refRevision: '0',
        currentRevision: '2',
        refStability: 'ephemeral',
        remediation: 'Re-run query.match() to obtain a fresh ref.',
      },
    });

    const result = mapInvokeError(operationId, error);

    expect(result).toBeInstanceOf(CliError);
    expect(result.code).toBe('REVISION_MISMATCH');
    expect(result.details).toMatchObject({
      operationId,
      details: {
        refRevision: '0',
        currentRevision: '2',
        refStability: 'ephemeral',
        remediation: expect.any(String),
      },
    });
  });

  test('PLAN_CONFLICT_OVERLAP preserves code and matrix details', () => {
    const error = Object.assign(new Error('overlap'), {
      code: 'PLAN_CONFLICT_OVERLAP',
      details: {
        stepIdA: 'step-1',
        stepIdB: 'step-2',
        opKeyA: 'format.apply',
        opKeyB: 'text.rewrite',
        matrixVerdict: 'reject',
        matrixKey: 'format.apply::text.rewrite::same_target',
      },
    });

    const result = mapInvokeError(operationId, error);

    expect(result.code).toBe('PLAN_CONFLICT_OVERLAP');
    expect(result.details).toMatchObject({
      details: {
        stepIdA: 'step-1',
        stepIdB: 'step-2',
        matrixVerdict: 'reject',
      },
    });
  });

  test('DOCUMENT_IDENTITY_CONFLICT preserves code and remediation', () => {
    const error = Object.assign(new Error('duplicate IDs'), {
      code: 'DOCUMENT_IDENTITY_CONFLICT',
      details: {
        duplicateBlockIds: ['p3', 'p7'],
        blockCount: 2,
        remediation: 'Re-import the document.',
      },
    });

    const result = mapInvokeError(operationId, error);

    expect(result.code).toBe('DOCUMENT_IDENTITY_CONFLICT');
    expect(result.details).toMatchObject({
      details: {
        duplicateBlockIds: ['p3', 'p7'],
        remediation: expect.any(String),
      },
    });
  });

  test('REVISION_CHANGED_SINCE_COMPILE preserves code and details', () => {
    const error = Object.assign(new Error('drift'), {
      code: 'REVISION_CHANGED_SINCE_COMPILE',
      details: {
        compiledRevision: '3',
        currentRevision: '5',
        remediation: 'Re-compile the plan.',
      },
    });

    const result = mapInvokeError(operationId, error);

    expect(result.code).toBe('REVISION_CHANGED_SINCE_COMPILE');
    expect(result.details).toMatchObject({
      details: {
        compiledRevision: '3',
        currentRevision: '5',
      },
    });
  });

  test('INVALID_INSERTION_CONTEXT preserves code and details', () => {
    const error = Object.assign(new Error('bad context'), {
      code: 'INVALID_INSERTION_CONTEXT',
      details: {
        stepIndex: 0,
        operation: 'create.heading',
        parentType: 'table_cell',
      },
    });

    const result = mapInvokeError(operationId, error);

    expect(result.code).toBe('INVALID_INSERTION_CONTEXT');
    expect(result.details).toMatchObject({
      details: {
        stepIndex: 0,
        parentType: 'table_cell',
      },
    });
  });

  test('unknown error codes still fall through to COMMAND_FAILED', () => {
    const error = Object.assign(new Error('something weird'), {
      code: 'TOTALLY_UNKNOWN_CODE',
      details: { foo: 'bar' },
    });

    const result = mapInvokeError(operationId, error);

    expect(result.code).toBe('COMMAND_FAILED');
  });

  test('valid ref (no error) baseline — CliError passes through', () => {
    const error = new CliError('COMMAND_FAILED', 'already a CliError');

    const result = mapInvokeError(operationId, error);

    expect(result).toBe(error);
    expect(result.code).toBe('COMMAND_FAILED');
  });

  test('large revision gap stale ref still includes all structured details', () => {
    const error = Object.assign(new Error('REVISION_MISMATCH'), {
      code: 'REVISION_MISMATCH',
      details: {
        refRevision: '0',
        currentRevision: '50',
        refStability: 'ephemeral',
        remediation: 'Re-run query.match()',
      },
    });

    const result = mapInvokeError(operationId, error);

    expect(result.code).toBe('REVISION_MISMATCH');
    expect(result.details).toMatchObject({
      details: {
        refRevision: '0',
        currentRevision: '50',
        refStability: 'ephemeral',
        remediation: expect.any(String),
      },
    });
  });
});

// ---------------------------------------------------------------------------
// T8 extension: mapFailedReceipt — plan-engine code passthrough + envelope
// ---------------------------------------------------------------------------

describe('mapFailedReceipt: plan-engine code passthrough', () => {
  const operationId = 'insert' as any;

  test('returns null for successful receipts', () => {
    expect(mapFailedReceipt(operationId, { success: true })).toBeNull();
  });

  test('returns null for non-receipt values', () => {
    expect(mapFailedReceipt(operationId, 'not a receipt')).toBeNull();
    expect(mapFailedReceipt(operationId, null)).toBeNull();
    expect(mapFailedReceipt(operationId, 42)).toBeNull();
  });

  test('returns COMMAND_FAILED when failure has no code', () => {
    const result = mapFailedReceipt(operationId, { success: false });
    expect(result).toBeInstanceOf(CliError);
    expect(result!.code).toBe('COMMAND_FAILED');
  });

  test('plan-engine code MATCH_NOT_FOUND passes through with structured details', () => {
    const receipt = {
      success: false,
      failure: {
        code: 'MATCH_NOT_FOUND',
        message: 'No match found for selector',
        details: { selectorType: 'text', selectorPattern: 'foo', candidateCount: 0 },
      },
    };

    const result = mapFailedReceipt(operationId, receipt);
    expect(result).toBeInstanceOf(CliError);
    expect(result!.code).toBe('MATCH_NOT_FOUND');
    expect(result!.details).toMatchObject({
      operationId,
      failure: { code: 'MATCH_NOT_FOUND', details: { selectorType: 'text' } },
    });
  });

  test('plan-engine code PRECONDITION_FAILED passes through', () => {
    const receipt = {
      success: false,
      failure: { code: 'PRECONDITION_FAILED', message: 'Assert failed' },
    };

    const result = mapFailedReceipt(operationId, receipt);
    expect(result!.code).toBe('PRECONDITION_FAILED');
  });

  test('plan-engine code REVISION_MISMATCH passes through', () => {
    const receipt = {
      success: false,
      failure: {
        code: 'REVISION_MISMATCH',
        message: 'stale ref',
        details: { refRevision: '0', currentRevision: '3' },
      },
    };

    const result = mapFailedReceipt(operationId, receipt);
    expect(result!.code).toBe('REVISION_MISMATCH');
    expect(result!.details).toMatchObject({
      failure: { details: { refRevision: '0', currentRevision: '3' } },
    });
  });

  test('non-plan-engine failure codes go through per-family normalization', () => {
    const receipt = {
      success: false,
      failure: { code: 'NO_OP', message: 'no change' },
    };

    const result = mapFailedReceipt(operationId, receipt);
    // NO_OP is not a plan-engine passthrough code, so it normalizes
    expect(result).toBeInstanceOf(CliError);
    expect(result!.code).not.toBe('NO_OP');
  });
});
