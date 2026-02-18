import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG } from './command-catalog.js';
import { OPERATION_DEFINITIONS, type ReferenceGroupKey } from './operation-definitions.js';
import { DOCUMENT_API_MEMBER_PATHS, OPERATION_MEMBER_PATH_MAP, memberPathForOperation } from './operation-map.js';
import { OPERATION_REFERENCE_DOC_PATH_MAP, REFERENCE_OPERATION_GROUPS } from './reference-doc-map.js';
import { buildInternalContractSchemas } from './schemas.js';
import { OPERATION_IDS, PRE_APPLY_THROW_CODES, isValidOperationIdFormat } from './types.js';

describe('document-api contract catalog', () => {
  it('keeps operation ids explicit and format-valid', () => {
    expect([...new Set(OPERATION_IDS)]).toHaveLength(OPERATION_IDS.length);
    for (const operationId of OPERATION_IDS) {
      expect(isValidOperationIdFormat(operationId)).toBe(true);
    }
  });

  it('keeps catalog key coverage in lockstep with operation ids', () => {
    const catalogKeys = Object.keys(COMMAND_CATALOG).sort();
    const operationIds = [...OPERATION_IDS].sort();
    expect(catalogKeys).toEqual(operationIds);
  });

  it('derives member paths from operation ids with no duplicates', () => {
    expect(new Set(DOCUMENT_API_MEMBER_PATHS).size).toBe(DOCUMENT_API_MEMBER_PATHS.length);
    for (const operationId of OPERATION_IDS) {
      expect(typeof memberPathForOperation(operationId)).toBe('string');
    }
  });

  it('keeps reference-doc mappings explicit and coverage-complete', () => {
    const operationIds = [...OPERATION_IDS].sort();
    const docPathKeys = Object.keys(OPERATION_REFERENCE_DOC_PATH_MAP).sort();
    expect(docPathKeys).toEqual(operationIds);

    const grouped = REFERENCE_OPERATION_GROUPS.flatMap((group) => group.operations);
    expect(grouped).toHaveLength(operationIds.length);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(operationIds);
  });

  it('enforces typed throw and post-apply policy metadata for mutation operations', () => {
    const validPreApplyThrowCodes = new Set(PRE_APPLY_THROW_CODES);

    for (const operationId of OPERATION_IDS) {
      const metadata = COMMAND_CATALOG[operationId];
      for (const throwCode of metadata.throws.preApply) {
        expect(validPreApplyThrowCodes.has(throwCode)).toBe(true);
      }

      if (!metadata.mutates) continue;
      expect(metadata.throws.postApplyForbidden).toBe(true);
    }
  });

  it('includes CAPABILITY_UNAVAILABLE in throws.preApply for all mutation operations', () => {
    for (const operationId of OPERATION_IDS) {
      const metadata = COMMAND_CATALOG[operationId];
      if (!metadata.mutates) continue;
      expect(
        metadata.throws.preApply,
        `${operationId} should include CAPABILITY_UNAVAILABLE in throws.preApply`,
      ).toContain('CAPABILITY_UNAVAILABLE');
    }
  });

  it('keeps input schemas closed for object-shaped payloads', () => {
    const schemas = buildInternalContractSchemas();

    for (const operationId of OPERATION_IDS) {
      const inputSchema = schemas.operations[operationId].input as { type?: string; additionalProperties?: unknown };
      if (inputSchema.type !== 'object') continue;
      expect(inputSchema.additionalProperties).toBe(false);
    }
  });

  it('derives OPERATION_IDS from OPERATION_DEFINITIONS keys', () => {
    const definitionKeys = Object.keys(OPERATION_DEFINITIONS).sort();
    const operationIds = [...OPERATION_IDS].sort();
    expect(definitionKeys).toEqual(operationIds);
  });

  it('ensures every definition entry has a valid referenceGroup', () => {
    const validGroups: readonly ReferenceGroupKey[] = [
      'core',
      'capabilities',
      'create',
      'format',
      'lists',
      'comments',
      'trackChanges',
    ];
    for (const id of OPERATION_IDS) {
      expect(validGroups, `${id} has invalid referenceGroup`).toContain(OPERATION_DEFINITIONS[id].referenceGroup);
    }
  });

  it('projects COMMAND_CATALOG metadata from the same objects in OPERATION_DEFINITIONS', () => {
    for (const id of OPERATION_IDS) {
      expect(COMMAND_CATALOG[id]).toBe(OPERATION_DEFINITIONS[id].metadata);
    }
  });

  it('projects member paths that match OPERATION_DEFINITIONS', () => {
    for (const id of OPERATION_IDS) {
      expect(OPERATION_MEMBER_PATH_MAP[id]).toBe(OPERATION_DEFINITIONS[id].memberPath);
    }
  });

  it('projects reference doc paths that match OPERATION_DEFINITIONS', () => {
    for (const id of OPERATION_IDS) {
      expect(OPERATION_REFERENCE_DOC_PATH_MAP[id]).toBe(OPERATION_DEFINITIONS[id].referenceDocPath);
    }
  });
});
