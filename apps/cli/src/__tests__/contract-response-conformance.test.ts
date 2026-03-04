import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { CLI_OPERATION_COMMAND_KEYS, type CliOperationId } from '../cli';
import { validateOperationResponseData } from '../lib/operation-args';
import type { ErrorEnvelope, SuccessEnvelope } from './conformance/harness';
import { ConformanceHarness } from './conformance/harness';
import { OPERATION_SCENARIOS } from './conformance/scenarios';

describe('contract response conformance', () => {
  let harness: ConformanceHarness;

  beforeAll(async () => {
    harness = await ConformanceHarness.create();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  test('scenario registry covers every canonical operation id', () => {
    const expectedIds = new Set(Object.keys(CLI_OPERATION_COMMAND_KEYS) as CliOperationId[]);
    const actualIds = new Set(OPERATION_SCENARIOS.map((scenario) => scenario.operationId));

    expect(actualIds).toEqual(expectedIds);
  });

  for (const scenario of OPERATION_SCENARIOS) {
    const commandKey = CLI_OPERATION_COMMAND_KEYS[scenario.operationId];
    const runtimeTest = scenario.skipRuntimeConformance ? test.skip : test;

    runtimeTest(`success envelope conforms for ${scenario.operationId}`, async () => {
      const invocation = await scenario.success(harness);
      const { result, envelope } = await harness.runCli(invocation.args, invocation.stateDir, invocation.stdinBytes);

      if (result.code !== 0 || envelope.ok !== true) {
        const details = JSON.stringify(envelope, null, 2);
        throw new Error(
          [
            `Expected success envelope for ${scenario.operationId}.`,
            `Exit code: ${result.code}`,
            `Envelope: ${details}`,
            `STDOUT: ${result.stdout.trim() || '<empty>'}`,
            `STDERR: ${result.stderr.trim() || '<empty>'}`,
          ].join('\n'),
        );
      }

      expect(result.code).toBe(0);
      expect(envelope.ok).toBe(true);

      const success = envelope as SuccessEnvelope;
      validateOperationResponseData(scenario.operationId, success.data, commandKey);

      // Regression guard: history operations must serialize payload under `result`,
      // never under an "undefined" key from missing envelope metadata.
      if (scenario.operationId.startsWith('doc.history.')) {
        const data = success.data as Record<string, unknown>;
        expect(Object.prototype.hasOwnProperty.call(data, 'result')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(data, 'undefined')).toBe(false);
      }
    });

    runtimeTest(`failure envelope conforms for ${scenario.operationId}`, async () => {
      const invocation = await scenario.failure(harness);
      const { result, envelope } = await harness.runCli(invocation.args, invocation.stateDir, invocation.stdinBytes);

      expect(result.code).toBe(1);
      expect(envelope.ok).toBe(false);

      const error = envelope as ErrorEnvelope;
      expect(scenario.expectedFailureCodes).toContain(error.error.code);
      expect(typeof error.error.message).toBe('string');
    });
  }
});
