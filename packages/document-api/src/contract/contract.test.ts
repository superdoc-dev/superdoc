import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG, OPERATION_DESCRIPTION_MAP, OPERATION_EXPECTED_RESULT_MAP } from './command-catalog.js';
import { OPERATION_DEFINITIONS, type ReferenceGroupKey } from './operation-definitions.js';
import { DOCUMENT_API_MEMBER_PATHS, OPERATION_MEMBER_PATH_MAP, memberPathForOperation } from './operation-map.js';
import { OPERATION_REFERENCE_DOC_PATH_MAP, REFERENCE_OPERATION_GROUPS } from './reference-doc-map.js';
import { buildInternalContractSchemas } from './schemas.js';
import { PUBLIC_MUTATION_STEP_OP_IDS, STEP_OP_CATALOG } from './step-op-catalog.js';
import { OPERATION_IDS, PRE_APPLY_THROW_CODES, isValidOperationIdFormat } from './types.js';
import { Z_ORDER_RELATIVE_HEIGHT_MAX, Z_ORDER_RELATIVE_HEIGHT_MIN } from '../images/z-order.js';

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

  it('declares insert input as a legacy-text or structural-content union', () => {
    const schemas = buildInternalContractSchemas();
    const insertInputSchema = schemas.operations.insert.input as {
      oneOf?: Array<{
        type?: string;
        properties?: Record<string, unknown>;
        required?: string[];
        additionalProperties?: boolean;
      }>;
    };

    expect(Array.isArray(insertInputSchema.oneOf)).toBe(true);
    expect(insertInputSchema.oneOf).toHaveLength(2);

    const [legacyVariant, structuralVariant] = insertInputSchema.oneOf!;

    expect(legacyVariant.type).toBe('object');
    expect(Object.keys(legacyVariant.properties!).sort()).toEqual(['target', 'type', 'value']);
    expect(legacyVariant.required).toEqual(['value']);
    expect(legacyVariant.additionalProperties).toBe(false);
    expect((legacyVariant.properties!.target as { $ref?: string }).$ref).toBe('#/$defs/TextAddress');

    expect(structuralVariant.type).toBe('object');
    expect(Object.keys(structuralVariant.properties!).sort()).toEqual([
      'content',
      'nestingPolicy',
      'placement',
      'target',
    ]);
    expect(structuralVariant.required).toEqual(['content']);
    expect(structuralVariant.additionalProperties).toBe(false);
    expect((structuralVariant.properties!.target as { $ref?: string }).$ref).toBe('#/$defs/BlockNodeAddress');
    expect((structuralVariant.properties!.placement as { enum?: string[] }).enum).toEqual([
      'before',
      'after',
      'insideStart',
      'insideEnd',
    ]);
    expect(
      (
        structuralVariant.properties!.nestingPolicy as {
          properties?: { tables?: { enum?: string[] } };
        }
      ).properties?.tables?.enum,
    ).toEqual(['forbid', 'allow']);
  });

  it('accepts both object and array SDFragment in structural insert content schema', () => {
    const schemas = buildInternalContractSchemas();
    const insertInput = schemas.operations.insert.input as { oneOf?: Array<{ properties?: Record<string, unknown> }> };
    const structuralVariant = insertInput.oneOf![1];
    const contentSchema = structuralVariant.properties!.content as { oneOf?: Array<{ type?: string }> };

    expect(Array.isArray(contentSchema.oneOf)).toBe(true);
    expect(contentSchema.oneOf).toHaveLength(2);
    expect(contentSchema.oneOf![0].type).toBe('object');
    expect(contentSchema.oneOf![1].type).toBe('array');
  });

  it('accepts both object and array SDFragment in structural replace content schema', () => {
    const schemas = buildInternalContractSchemas();
    const replaceInput = schemas.operations.replace.input as {
      oneOf?: Array<{ oneOf?: Array<{ properties?: Record<string, unknown> }> }>;
    };
    // The structural branch is the second oneOf element
    const structuralBranch = replaceInput.oneOf![1] as { oneOf?: Array<{ properties?: Record<string, unknown> }> };

    for (const variant of structuralBranch.oneOf!) {
      const contentSchema = variant.properties!.content as { oneOf?: Array<{ type?: string }> };
      expect(Array.isArray(contentSchema.oneOf)).toBe(true);
      expect(contentSchema.oneOf).toHaveLength(2);
      expect(contentSchema.oneOf![0].type).toBe('object');
      expect(contentSchema.oneOf![1].type).toBe('array');
    }
  });

  it('declares UNSUPPORTED_ENVIRONMENT for insert metadata and generated failure schema', () => {
    const schemas = buildInternalContractSchemas();
    const insertFailureSchema = schemas.operations.insert.failure as {
      properties?: {
        failure?: {
          properties?: {
            code?: {
              enum?: string[];
            };
          };
        };
      };
    };

    expect(COMMAND_CATALOG.insert.possibleFailureCodes).toContain('UNSUPPORTED_ENVIRONMENT');
    expect(insertFailureSchema.properties?.failure?.properties?.code?.enum).toContain('UNSUPPORTED_ENVIRONMENT');
  });

  it('includes global.history in capabilities.get output schema', () => {
    const schemas = buildInternalContractSchemas();
    const capabilitiesOutput = schemas.operations['capabilities.get'].output as {
      properties?: {
        global?: {
          properties?: Record<string, unknown>;
          required?: string[];
        };
      };
    };

    expect(capabilitiesOutput.properties?.global?.properties).toHaveProperty('history');
    expect(capabilitiesOutput.properties?.global?.required).toContain('history');
  });

  it('declares images.setZOrder.relativeHeight as unsigned 32-bit integer', () => {
    const schemas = buildInternalContractSchemas();
    const inputSchema = schemas.operations['images.setZOrder'].input as {
      properties?: {
        zOrder?: {
          properties?: {
            relativeHeight?: {
              type?: string;
              minimum?: number;
              maximum?: number;
            };
          };
        };
      };
    };

    const relativeHeightSchema = inputSchema.properties?.zOrder?.properties?.relativeHeight;
    expect(relativeHeightSchema?.type).toBe('integer');
    expect(relativeHeightSchema?.minimum).toBe(Z_ORDER_RELATIVE_HEIGHT_MIN);
    expect(relativeHeightSchema?.maximum).toBe(Z_ORDER_RELATIVE_HEIGHT_MAX);
  });

  it('derives OPERATION_IDS from OPERATION_DEFINITIONS keys', () => {
    const definitionKeys = Object.keys(OPERATION_DEFINITIONS).sort();
    const operationIds = [...OPERATION_IDS].sort();
    expect(definitionKeys).toEqual(operationIds);
  });

  it('ensures every definition entry has a valid referenceGroup', () => {
    const validGroups: readonly ReferenceGroupKey[] = [
      'core',
      'blocks',
      'capabilities',
      'create',
      'sections',
      'format',
      'format.paragraph',
      'styles',
      'styles.paragraph',
      'lists',
      'comments',
      'trackChanges',
      'query',
      'mutations',
      'tables',
      'history',
      'toc',
      'images',
      'hyperlinks',
      'headerFooters',
      'contentControls',
      'bookmarks',
      'footnotes',
      'crossRefs',
      'index',
      'captions',
      'fields',
      'citations',
      'authorities',
      'ranges',
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

  it('projects descriptions that match OPERATION_DEFINITIONS', () => {
    for (const id of OPERATION_IDS) {
      expect(OPERATION_DESCRIPTION_MAP[id]).toBe(OPERATION_DEFINITIONS[id].description);
    }
  });

  it('projects expected results that match OPERATION_DEFINITIONS', () => {
    for (const id of OPERATION_IDS) {
      expect(OPERATION_EXPECTED_RESULT_MAP[id]).toBe(OPERATION_DEFINITIONS[id].expectedResult);
    }
  });

  it('ensures every operation has a non-empty expectedResult', () => {
    for (const id of OPERATION_IDS) {
      const expectedResult = OPERATION_DEFINITIONS[id].expectedResult;
      expect(expectedResult, `${id} has empty expectedResult`).toBeTruthy();
      expect(typeof expectedResult).toBe('string');
      expect(expectedResult.length, `${id} expectedResult is too short`).toBeGreaterThan(10);
    }
  });

  it('keeps public mutation step ops explicit and reference-valid', () => {
    expect(PUBLIC_MUTATION_STEP_OP_IDS.length).toBeGreaterThan(0);
    expect(new Set(PUBLIC_MUTATION_STEP_OP_IDS).size).toBe(PUBLIC_MUTATION_STEP_OP_IDS.length);
    expect(PUBLIC_MUTATION_STEP_OP_IDS).not.toContain('domain.command');
    expect(PUBLIC_MUTATION_STEP_OP_IDS).toContain('assert');

    const validOperationIds = new Set<string>(OPERATION_IDS);
    for (const stepOp of STEP_OP_CATALOG) {
      if (!stepOp.referenceOperationId) continue;
      expect(
        validOperationIds.has(stepOp.referenceOperationId),
        `${stepOp.opId} references unknown operation ${stepOp.referenceOperationId}`,
      ).toBe(true);
    }
  });

  it('marks exactly the out-of-band mutation operations as historyUnsafe', () => {
    const historyUnsafeOps = OPERATION_IDS.filter((id) => COMMAND_CATALOG[id].historyUnsafe === true).sort();

    // styles.apply + all sections.set* / sections.clear* mutations
    expect(historyUnsafeOps).toContain('styles.apply');
    for (const id of historyUnsafeOps) {
      expect(
        id.startsWith('sections.') ||
          id.startsWith('headerFooters.') ||
          id === 'styles.apply' ||
          id === 'tables.setDefaultStyle' ||
          id === 'tables.clearDefaultStyle',
        `unexpected historyUnsafe: ${id}`,
      ).toBe(true);
    }

    // All section mutations (set*/clear*) should be marked
    const sectionMutations = OPERATION_IDS.filter((id) => id.startsWith('sections.') && COMMAND_CATALOG[id].mutates);
    for (const id of sectionMutations) {
      expect(COMMAND_CATALOG[id].historyUnsafe, `${id} should be historyUnsafe`).toBe(true);
    }

    // Non-mutating and non-out-of-band operations should NOT be historyUnsafe
    for (const id of OPERATION_IDS) {
      if (!COMMAND_CATALOG[id].mutates || historyUnsafeOps.includes(id)) continue;
      expect(COMMAND_CATALOG[id].historyUnsafe, `${id} should not be historyUnsafe`).toBeFalsy();
    }
  });
});
