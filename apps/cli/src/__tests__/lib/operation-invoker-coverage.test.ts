import { describe, expect, test } from 'bun:test';
import { CLI_OPERATION_METADATA, isDocBackedOperation, type CliOperationId } from '../../cli';
import { MANUAL_OPERATION_ALLOWLIST } from '../../lib/manual-command-allowlist';
import { dispatchIntrospectionOperation } from '../../lib/introspection-dispatch';

const MANUAL_ALLOWLIST = new Set<CliOperationId>(MANUAL_OPERATION_ALLOWLIST);

/** CLI-only introspection operations handled by dispatchIntrospectionOperation. */
const INTROSPECTION_OPS = new Set<CliOperationId>(['doc.describe', 'doc.describeCommand', 'doc.status']);

describe('operation invoker coverage', () => {
  test('covers every non-allowlisted operation id', () => {
    const operationIds = Object.keys(CLI_OPERATION_METADATA) as CliOperationId[];

    for (const operationId of operationIds) {
      if (MANUAL_ALLOWLIST.has(operationId)) continue;
      if (INTROSPECTION_OPS.has(operationId)) continue;

      // All remaining operations must be doc-backed and handled by the generic dispatch
      expect(isDocBackedOperation(operationId)).toBe(true);
    }
  });
});
