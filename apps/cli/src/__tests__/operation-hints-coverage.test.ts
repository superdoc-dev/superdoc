import { describe, expect, test } from 'bun:test';
import { CLI_DOC_OPERATIONS } from '../cli/operation-set';
import { OPERATION_FAMILY, OUTPUT_FORMAT, RESPONSE_ENVELOPE_KEY, SUCCESS_VERB } from '../cli/operation-hints';

// The four hint tables are typed as `Record<CliExposedOperationId, ...>`, but
// apps/cli does not run `tsc --noEmit` in CI, so the type-level exhaustiveness
// check is not enforced. This runtime test gives us the same protection under
// `pnpm test` — if a new doc-backed operation lands without a matching hint
// entry, mutation/read orchestrators would silently serialize its payload under
// the property name "undefined" (and the SDK exporter would coerce the missing
// hint into a null envelope key, leaking the wrap to SDK callers).
describe('operation hint coverage', () => {
  const hintTables = [
    { name: 'RESPONSE_ENVELOPE_KEY', table: RESPONSE_ENVELOPE_KEY as Record<string, unknown> },
    { name: 'OPERATION_FAMILY', table: OPERATION_FAMILY as Record<string, unknown> },
    { name: 'SUCCESS_VERB', table: SUCCESS_VERB as Record<string, unknown> },
    { name: 'OUTPUT_FORMAT', table: OUTPUT_FORMAT as Record<string, unknown> },
  ];

  for (const { name, table } of hintTables) {
    test(`${name} has an own entry for every CLI_DOC_OPERATIONS id`, () => {
      const missing = CLI_DOC_OPERATIONS.filter(
        (operationId) => !Object.prototype.hasOwnProperty.call(table, operationId),
      );
      expect(missing).toEqual([]);
    });
  }
});
