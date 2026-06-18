// plan.execute executor semantics - failure classification parity with the
// stepwise replay path (thrown errors AND returned failure receipts).

import { describe, expect, it } from 'vitest';
import { DocumentApiValidationError } from '../errors.js';
import { createPlanApi, type PlanExecuteEntry } from './plan.js';

const NO_OP_RECEIPT = { success: false, failure: { code: 'NO_OP', message: 'produced no change' } };

function planWith(results: Record<string, unknown>, calls: string[] = []) {
  return createPlanApi((operationId, input) => {
    calls.push(operationId);
    if (operationId === 'throws.validation') {
      const error = new Error('target must be a SelectionTarget object.') as Error & { code: string };
      error.code = 'INVALID_TARGET';
      throw error;
    }
    return results[operationId] ?? { success: true, echo: input };
  });
}

function expectPlanValidationError(fn: () => unknown, code: string, messageIncludes: string): void {
  try {
    fn();
    throw new Error(`Expected plan.execute to throw ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(DocumentApiValidationError);
    expect((error as DocumentApiValidationError).code).toBe(code);
    expect((error as Error).message).toContain(messageIncludes);
  }
}

describe('plan.execute failure classification', () => {
  it('throws INVALID_INPUT for malformed entries input', () => {
    const plan = planWith({});
    expectPlanValidationError(
      () => plan.execute({ entries: null as never }),
      'INVALID_INPUT',
      'input.entries to be an array',
    );
  });

  it('rejects unsupported async operations before executing any entry', () => {
    const calls: string[] = [];
    const plan = planWith({}, calls);
    expectPlanValidationError(
      () =>
        plan.execute({
          entries: [
            { operationId: 'templates.apply', input: { source: { kind: 'path', path: '/tmp/goal.docx' } } },
            { operationId: 'after', input: {} },
          ],
        }),
      'CAPABILITY_UNAVAILABLE',
      'does not support batching "templates.apply"',
    );
    expect(calls).toEqual([]);
  });

  it('rejects nested plan.execute entries before executing any prefix', () => {
    const calls: string[] = [];
    const plan = planWith({}, calls);
    expectPlanValidationError(
      () =>
        plan.execute({
          entries: [
            { operationId: 'first', input: {} },
            { operationId: 'plan.execute', input: { entries: [] } },
          ],
        }),
      'CAPABILITY_UNAVAILABLE',
      'does not support batching "plan.execute"',
    );
    expect(calls).toEqual([]);
  });

  it('rejects malformed captureReturns before executing any prefix', () => {
    const calls: string[] = [];
    const plan = planWith({}, calls);
    expectPlanValidationError(
      () =>
        plan.execute({
          entries: [{ operationId: 'first', input: {}, captureAs: 'first' }],
          captureReturns: { first: true } as never,
        }),
      'INVALID_INPUT',
      'captureReturns must be "*" or an array of strings',
    );
    expect(calls).toEqual([]);
  });

  it('classifies a returned failure receipt as allowed-failure on message match', () => {
    const plan = planWith({ 'mutate.noop': NO_OP_RECEIPT });
    const result = plan.execute({
      entries: [
        {
          operationId: 'mutate.noop',
          input: {},
          expect: { allowFailureMessageIncludes: 'produced no change' },
        },
        { operationId: 'after', input: {} },
      ],
    });
    expect(result.receipts.map((r) => r.status)).toEqual(['allowed-failure', 'passed']);
    expect(result.failure).toBeUndefined();
  });

  it('classifies a returned failure receipt as expected-failure on failureCode match and captures the error', () => {
    const plan = planWith({ 'mutate.noop': NO_OP_RECEIPT });
    const result = plan.execute({
      entries: [
        {
          operationId: 'mutate.noop',
          input: {},
          captureAs: 'noop',
          expect: { success: false, failureCode: 'NO_OP' },
        },
      ],
      captureReturns: '*',
    });
    expect(result.receipts[0]!.status).toBe('expected-failure');
    // Expected-failure captures store { error } - never the raw receipt.
    expect(result.captures.noop).toEqual({ error: 'produced no change' });
  });

  it('treats an unexpected failure receipt as a hard failure with keep-prefix', () => {
    const calls: string[] = [];
    const plan = planWith({ 'mutate.noop': NO_OP_RECEIPT }, calls);
    const result = plan.execute({
      entries: [
        { operationId: 'first', input: {}, captureAs: 'first' },
        { operationId: 'mutate.noop', input: {} },
        { operationId: 'never', input: {} },
      ],
      captureReturns: '*',
    });
    expect(result.receipts.map((r) => r.status)).toEqual(['passed']);
    expect(result.failure).toEqual({
      entryIndex: 1,
      operationId: 'mutate.noop',
      message: 'produced no change',
    });
    expect(calls).toEqual(['first', 'mutate.noop']);
    // Prefix effects are kept: the first entry's capture survives.
    expect(Object.keys(result.captures)).toEqual(['first']);
  });

  it('classifies thrown coded errors via failureCode like stepwise', () => {
    const plan = planWith({});
    const entries: PlanExecuteEntry[] = [
      {
        operationId: 'throws.validation',
        input: {},
        expect: { success: false, failureCode: 'INVALID_TARGET', failureMessageIncludes: 'SelectionTarget' },
      },
    ];
    const result = plan.execute({ entries });
    expect(result.receipts[0]!.status).toBe('expected-failure');
  });

  it('never stores a failure receipt as a success capture', () => {
    const plan = planWith({ 'mutate.noop': NO_OP_RECEIPT });
    const result = plan.execute({
      entries: [
        {
          operationId: 'mutate.noop',
          input: {},
          captureAs: 'noop',
          expect: { allowFailureMessageIncludes: 'produced no change' },
        },
      ],
      captureReturns: '*',
    });
    // Allowed-failure does not capture (stepwise stores nothing for allowed).
    expect('noop' in result.captures).toBe(false);
  });
});
