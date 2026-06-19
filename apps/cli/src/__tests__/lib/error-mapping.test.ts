import { describe, expect, test } from 'bun:test';
import { mapInvokeError, mapFailedReceipt } from '../../lib/error-mapping';
import { CliError } from '../../lib/errors';

describe('mapInvokeError', () => {
  test('preserves trackChanges.decide INVALID_INPUT validation errors', () => {
    const error = Object.assign(new Error('structural partial decisions fail closed'), {
      code: 'INVALID_INPUT',
      details: { field: 'target.range' },
    });

    const mapped = mapInvokeError('trackChanges.decide', error);
    expect(mapped.code).toBe('INVALID_INPUT');
    expect(mapped.details).toEqual({ operationId: 'trackChanges.decide', details: { field: 'target.range' } });
  });

  test('maps trackChanges.get TARGET_NOT_FOUND errors to TRACK_CHANGE_NOT_FOUND', () => {
    const error = Object.assign(new Error('missing tracked change'), {
      code: 'TARGET_NOT_FOUND',
      details: { id: 'tc-missing' },
    });

    const mapped = mapInvokeError('trackChanges.get', error);
    expect(mapped.code).toBe('TRACK_CHANGE_NOT_FOUND');
    expect(mapped.details).toEqual({ operationId: 'trackChanges.get', details: { id: 'tc-missing' } });
  });

  test('preserves trackChanges.decide INVALID_TARGET validation errors', () => {
    const error = Object.assign(new Error('track-changes decide:target.kind is required.'), {
      code: 'INVALID_TARGET',
      details: { field: 'target.kind' },
    });

    const mapped = mapInvokeError('trackChanges.decide', error);
    expect(mapped.code).toBe('INVALID_TARGET');
    expect(mapped.details).toEqual({ operationId: 'trackChanges.decide', details: { field: 'target.kind' } });
  });

  test('preserves comments.create INVALID_TARGET validation errors', () => {
    const error = Object.assign(new Error('comments.create requires a target for root comments.'), {
      code: 'INVALID_TARGET',
      details: { field: 'target' },
    });

    const mapped = mapInvokeError('comments.create' as any, error);
    expect(mapped.code).toBe('INVALID_TARGET');
    expect(mapped.details).toEqual({ operationId: 'comments.create', details: { field: 'target' } });
  });

  test('preserves comments.patch INVALID_INPUT atomicity errors', () => {
    const error = Object.assign(
      new Error('comments.patch accepts exactly one mutation field per call, got 2: text, status.'),
      {
        code: 'INVALID_INPUT',
        details: { providedFields: ['text', 'status'] },
      },
    );

    const mapped = mapInvokeError('comments.patch' as any, error);
    expect(mapped.code).toBe('INVALID_INPUT');
    expect(mapped.details).toEqual({
      operationId: 'comments.patch',
      details: { providedFields: ['text', 'status'] },
    });
  });

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

  test('maps query.match AMBIGUOUS_MATCH errors to COMMAND_FAILED with the ambiguity marker in the message', () => {
    const error = Object.assign(new Error('selector matched 5 nodes, expected exactly one.'), {
      code: 'AMBIGUOUS_MATCH',
      details: { selectorType: 'node', nodeType: 'paragraph', total: 5 },
    });

    const mapped = mapInvokeError('query.match', error);
    expect(mapped.code).toBe('COMMAND_FAILED');
    expect(mapped.message).toContain('AMBIGUOUS_MATCH');
    expect(mapped.message).toContain('selector matched 5 nodes');
    expect(mapped.details).toEqual({
      operationId: 'query.match',
      details: { selectorType: 'node', nodeType: 'paragraph', total: 5 },
    });
  });

  test('preserves nested NO_OP failure details for images.removeCaption command failures', () => {
    const error = Object.assign(new Error('No caption to remove.'), {
      code: 'COMMAND_FAILED',
      details: {
        operationId: 'images.removeCaption',
        failure: { code: 'NO_OP', message: 'No caption to remove.' },
      },
    });

    const mapped = mapInvokeError('images.removeCaption' as any, error);
    expect(mapped.code).toBe('COMMAND_FAILED');
    expect(mapped.details).toMatchObject({
      operationId: 'images.removeCaption',
      failure: { code: 'NO_OP', message: 'No caption to remove.' },
    });
  });

  test('preserves TARGET_NOT_FOUND for trackChanges.decide stale ids', () => {
    const error = Object.assign(new Error('Tracked change "tc-1" was not found.'), {
      code: 'TARGET_NOT_FOUND',
      details: { id: 'tc-1' },
    });

    const mapped = mapInvokeError('trackChanges.decide' as any, error);
    expect(mapped.code).toBe('TARGET_NOT_FOUND');
    expect(mapped.details).toEqual({ operationId: 'trackChanges.decide', details: { id: 'tc-1' } });
  });

  test('maps track-changes accept/reject helper missing ids to TRACK_CHANGE_NOT_FOUND', () => {
    const error = Object.assign(new Error('Tracked change "tc-1" was not found.'), {
      code: 'TARGET_NOT_FOUND',
      details: { id: 'tc-1' },
    });

    const accept = mapInvokeError('trackChanges.decide' as any, error, { commandName: 'track-changes accept' });
    const reject = mapInvokeError('trackChanges.decide' as any, error, { commandName: 'track-changes reject' });
    const canonical = mapInvokeError('trackChanges.decide' as any, error, { commandName: 'track-changes decide' });

    expect(accept.code).toBe('TRACK_CHANGE_NOT_FOUND');
    expect(reject.code).toBe('TRACK_CHANGE_NOT_FOUND');
    expect(canonical.code).toBe('TARGET_NOT_FOUND');
  });

  test.each([
    'blocks.split',
    'lists.apply',
    'format.paragraph.setMarkRunProps',
    'tables.moveRow',
    'fields.insert',
  ] as const)('%s preserves CAPABILITY_UNAVAILABLE for unsupported v1/v2-gated paths', (operationId) => {
    const error = Object.assign(new Error(`${operationId} is only available on v2-backed sessions.`), {
      code: 'CAPABILITY_UNAVAILABLE',
    });

    const mapped = mapInvokeError(operationId as any, error);
    expect(mapped.code).toBe('CAPABILITY_UNAVAILABLE');
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

  test('maps helper trackChanges.decide TARGET_NOT_FOUND receipts to TRACK_CHANGE_NOT_FOUND', () => {
    const receipt = {
      success: false,
      failure: {
        code: 'TARGET_NOT_FOUND',
        message: 'Tracked change "tc-1" was not found.',
      },
    };

    const helper = mapFailedReceipt('trackChanges.decide' as any, receipt, { commandName: 'track-changes accept' });
    const canonical = mapFailedReceipt('trackChanges.decide' as any, receipt, {
      commandName: 'track-changes decide',
    });

    expect(helper?.code).toBe('TRACK_CHANGE_NOT_FOUND');
    expect(canonical?.code).toBe('TARGET_NOT_FOUND');
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

  test('trackChanges TARGET_NOT_FOUND receipt failures map to TRACK_CHANGE_NOT_FOUND for get', () => {
    const receipt = {
      success: false,
      failure: {
        code: 'TARGET_NOT_FOUND',
        message: 'No tracked change with id "missing".',
        details: { id: 'missing' },
      },
    };

    const result = mapFailedReceipt('trackChanges.get' as any, receipt);
    expect(result).toBeInstanceOf(CliError);
    expect(result!.code).toBe('TRACK_CHANGE_NOT_FOUND');
    expect(result!.details).toMatchObject({
      operationId: 'trackChanges.get',
      failure: { code: 'TARGET_NOT_FOUND', details: { id: 'missing' } },
    });
  });

  test('comments.patch INVALID_INPUT receipt failures stay INVALID_INPUT', () => {
    const receipt = {
      success: false,
      failure: {
        code: 'INVALID_INPUT',
        message: 'comments.patch accepts exactly one mutation field per call, got 2: text, status.',
        details: { providedFields: ['text', 'status'] },
      },
    };

    const result = mapFailedReceipt('comments.patch' as any, receipt);
    expect(result!.code).toBe('INVALID_INPUT');
    expect(result!.details).toMatchObject({
      operationId: 'comments.patch',
      failure: { code: 'INVALID_INPUT', details: { providedFields: ['text', 'status'] } },
    });
  });

  test('comments.create INVALID_TARGET receipt failures stay INVALID_TARGET', () => {
    const receipt = {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'comments.create requires a target for root comments.',
        details: { field: 'target' },
      },
    };

    const result = mapFailedReceipt('comments.create' as any, receipt);
    expect(result!.code).toBe('INVALID_TARGET');
    expect(result!.details).toMatchObject({
      operationId: 'comments.create',
      failure: { code: 'INVALID_TARGET', details: { field: 'target' } },
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

  test('NO_OP failure codes pass through for expected no-op receipts', () => {
    const receipt = {
      success: false,
      failure: { code: 'NO_OP', message: 'no change' },
    };

    const result = mapFailedReceipt(operationId, receipt);
    expect(result).toBeInstanceOf(CliError);
    expect(result!.code).toBe('NO_OP');
  });

  test('paragraph mutation receipt maps INVALID_TARGET to INVALID_ARGUMENT', () => {
    const receipt = {
      success: false,
      failure: { code: 'INVALID_TARGET', message: 'Paragraph target is invalid.' },
    };

    const result = mapFailedReceipt('format.paragraph.setAlignment' as any, receipt);
    expect(result).toBeInstanceOf(CliError);
    expect(result!.code).toBe('INVALID_ARGUMENT');
  });

  test('text-mutation receipts preserve TARGET_NOT_FOUND', () => {
    const receipt = {
      success: false,
      failure: { code: 'TARGET_NOT_FOUND', message: 'selection target was not found.' },
    };

    const result = mapFailedReceipt('format.bold' as any, receipt);
    expect(result).toBeInstanceOf(CliError);
    expect(result!.code).toBe('TARGET_NOT_FOUND');
  });

  test('image receipts preserve INVALID_INPUT for payload validation failures', () => {
    const receipt = {
      success: false,
      failure: {
        code: 'INVALID_INPUT',
        message: 'Image dimensions could not be determined.',
      },
    };

    const result = mapFailedReceipt('create.image' as any, receipt);
    expect(result).toBeInstanceOf(CliError);
    expect(result!.code).toBe('INVALID_INPUT');
  });

  test.each(['images.setSize', 'images.setZOrder'] as const)(
    'image mutation receipts fail closed to COMMAND_FAILED for %s INVALID_INPUT validation',
    (operationId) => {
      const receipt = {
        success: false,
        failure: {
          code: 'INVALID_INPUT',
          message: `${operationId} validation failed.`,
        },
      };

      const result = mapFailedReceipt(operationId as any, receipt);
      expect(result).toBeInstanceOf(CliError);
      expect(result!.code).toBe('COMMAND_FAILED');
    },
  );

  test.each([
    'blocks.split',
    'lists.apply',
    'format.paragraph.setMarkRunProps',
    'tables.moveRow',
    'footnotes.insert',
  ] as const)('%s failed receipts preserve CAPABILITY_UNAVAILABLE', (operationId) => {
    const receipt = {
      success: false,
      failure: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: `${operationId} is only available on v2-backed sessions.`,
      },
    };

    const result = mapFailedReceipt(operationId as any, receipt);
    expect(result).toBeInstanceOf(CliError);
    expect(result!.code).toBe('CAPABILITY_UNAVAILABLE');
  });
});

// ---------------------------------------------------------------------------
// textMutation: INVALID_INPUT ordering — plan-engine must win over adapter remap
// ---------------------------------------------------------------------------

describe('mapInvokeError: textMutation INVALID_INPUT ordering', () => {
  test('plan-engine INVALID_INPUT passes through verbatim for text mutations', () => {
    const error = Object.assign(new Error('step schema invalid'), {
      code: 'INVALID_INPUT',
      details: {
        stepIndex: 0,
        operation: 'text.rewrite',
        remediation: 'Fix the step payload.',
      },
    });

    const result = mapInvokeError('format.inline.apply' as any, error);
    expect(result).toBeInstanceOf(CliError);
    // Must preserve INVALID_INPUT — not remap to INVALID_ARGUMENT
    expect(result.code).toBe('INVALID_INPUT');
    expect(result.details).toMatchObject({
      details: { stepIndex: 0, operation: 'text.rewrite' },
    });
  });
});

describe('mapInvokeError: create INVALID_INPUT', () => {
  test('preserves INVALID_INPUT for create.image payload validation failures', () => {
    const error = Object.assign(new Error('Image dimensions could not be determined.'), {
      code: 'INVALID_INPUT',
      details: { source: 'decodeImageSource' },
    });

    const result = mapInvokeError('create.image' as any, error);
    expect(result).toBeInstanceOf(CliError);
    expect(result.code).toBe('INVALID_INPUT');
    expect(result.message).toBe('Image dimensions could not be determined.');
    expect(result.details).toMatchObject({
      operationId: 'create.image',
      details: { source: 'decodeImageSource' },
    });
  });
});

describe('mapInvokeError: images INVALID_INPUT fail-closed mappings', () => {
  test.each(['images.setSize', 'images.setZOrder'] as const)(
    'maps %s INVALID_INPUT failures to COMMAND_FAILED',
    (operationId) => {
      const error = Object.assign(new Error(`${operationId} validation failed.`), {
        code: 'INVALID_INPUT',
        details: { field: operationId === 'images.setSize' ? 'size' : 'zOrder' },
      });

      const result = mapInvokeError(operationId as any, error);
      expect(result).toBeInstanceOf(CliError);
      expect(result.code).toBe('COMMAND_FAILED');
      expect(result.details).toMatchObject({
        operationId,
        details: { field: operationId === 'images.setSize' ? 'size' : 'zOrder' },
      });
    },
  );
});

describe('templates.apply error mapping', () => {
  test('preserves thrown CAPABILITY_UNAVAILABLE for templates.apply', () => {
    const error = Object.assign(new Error('converter missing'), {
      code: 'CAPABILITY_UNAVAILABLE',
      details: { backend: 'converter' },
    });

    const result = mapInvokeError('templates.apply' as any, error);

    expect(result).toBeInstanceOf(CliError);
    expect(result.code).toBe('CAPABILITY_UNAVAILABLE');
    expect(result.details).toEqual({
      operationId: 'templates.apply',
      details: { backend: 'converter' },
    });
  });

  test('preserves receipt INVALID_PACKAGE for templates.apply', () => {
    const receipt = {
      success: false,
      failure: {
        code: 'INVALID_PACKAGE',
        message: 'bad zip',
        details: { path: '/tmp/source.docx' },
      },
    };

    const result = mapFailedReceipt('templates.apply' as any, receipt);

    expect(result).toBeInstanceOf(CliError);
    expect(result!.code).toBe('INVALID_PACKAGE');
    expect(result!.details).toEqual({
      operationId: 'templates.apply',
      failure: {
        code: 'INVALID_PACKAGE',
        message: 'bad zip',
        details: { path: '/tmp/source.docx' },
      },
    });
  });

  test('preserves receipt UNSUPPORTED_TEMPLATE_CONTENT for templates.apply', () => {
    const receipt = {
      success: false,
      failure: {
        code: 'UNSUPPORTED_TEMPLATE_CONTENT',
        message: 'source part could not be parsed',
      },
    };

    const result = mapFailedReceipt('templates.apply' as any, receipt);

    expect(result).toBeInstanceOf(CliError);
    expect(result!.code).toBe('UNSUPPORTED_TEMPLATE_CONTENT');
  });
});
