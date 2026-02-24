import { describe, expect, test } from 'bun:test';
import { isOperationId } from '@superdoc/document-api';
import {
  CLI_COMMAND_SPECS,
  CLI_DOC_OPERATIONS,
  CLI_ONLY_OPERATIONS,
  CLI_OPERATION_IDS,
  getResponseSchema,
  isDocBackedOperation,
  type CliOperationId,
} from '../index';
import { buildContractOperationDetail, buildContractOverview } from '../../lib/contract';
import { MANUAL_OPERATION_ALLOWLIST } from '../../lib/manual-command-allowlist';

const INTROSPECTION_OPS = new Set<CliOperationId>(['doc.describe', 'doc.describeCommand', 'doc.status']);

describe('cli parity', () => {
  test('canonical operation set matches CLI_DOC_OPERATIONS + CLI_ONLY_OPERATIONS', () => {
    const expected = new Set<CliOperationId>([
      ...CLI_DOC_OPERATIONS.map((id) => `doc.${id}` as CliOperationId),
      ...CLI_ONLY_OPERATIONS.map((id) => `doc.${id}` as CliOperationId),
    ]);

    expect(new Set(CLI_OPERATION_IDS)).toEqual(expected);
    expect(CLI_OPERATION_IDS).toHaveLength(expected.size);
  });

  test('every CLI doc-backed operation is a valid document-api operation id', () => {
    for (const operationId of CLI_DOC_OPERATIONS) {
      expect(isOperationId(operationId)).toBe(true);
    }
  });

  test('every non-manual canonical operation is handled by doc-backed generic dispatch', () => {
    const manualOps = new Set<CliOperationId>(MANUAL_OPERATION_ALLOWLIST);
    const canonicalSpecs = CLI_COMMAND_SPECS.filter((spec) => !spec.alias);

    for (const spec of canonicalSpecs) {
      const operationId = spec.operationId as CliOperationId;
      if (manualOps.has(operationId)) continue;
      if (INTROSPECTION_OPS.has(operationId)) continue;
      expect(isDocBackedOperation(operationId)).toBe(true);
    }
  });

  test('every canonical operation has a response schema', () => {
    for (const spec of CLI_COMMAND_SPECS) {
      if (spec.alias) continue;
      expect(getResponseSchema(spec.operationId)).not.toBeNull();
    }
  });

  test('alias specs resolve to canonical command specs', () => {
    const canonicalByKey = new Map(
      CLI_COMMAND_SPECS.filter((spec) => !spec.alias).map((spec) => [spec.key, spec] as const),
    );

    for (const aliasSpec of CLI_COMMAND_SPECS.filter((spec) => spec.alias)) {
      const canonical = canonicalByKey.get(aliasSpec.canonicalKey);
      expect(canonical).toBeDefined();
      expect(canonical?.operationId).toBe(aliasSpec.operationId);
    }
  });

  test('contract overview shape matches canonical CLI operation set', () => {
    const canonicalSpecs = CLI_COMMAND_SPECS.filter((spec) => !spec.alias);
    const overview = buildContractOverview();

    expect(overview.operations).toHaveLength(canonicalSpecs.length);
    expect(overview.operationCount).toBe(canonicalSpecs.length);
    expect(overview.contractVersion.length).toBeGreaterThan(0);
  });

  test('contract operation detail resolves by id, command key, and alias', () => {
    for (const spec of CLI_COMMAND_SPECS.filter((candidate) => !candidate.alias)) {
      const byId = buildContractOperationDetail(spec.operationId);
      expect(byId?.operation.id).toBe(spec.operationId);

      const byCommand = buildContractOperationDetail(spec.key);
      expect(byCommand?.operation.id).toBe(spec.operationId);
    }

    for (const aliasSpec of CLI_COMMAND_SPECS.filter((candidate) => candidate.alias)) {
      const byAlias = buildContractOperationDetail(aliasSpec.key);
      expect(byAlias?.operation.id).toBe(aliasSpec.operationId);
    }
  });
});
