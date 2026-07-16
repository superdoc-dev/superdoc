import { describe, expect, it } from 'bun:test';
import { COMMAND_CATALOG, OPERATION_DESCRIPTION_MAP, OPERATION_EXPECTED_RESULT_MAP } from './command-catalog.js';
import { OPERATION_DEFINITIONS, type ReferenceGroupKey } from './operation-definitions.js';
import { DOCUMENT_API_MEMBER_PATHS, OPERATION_MEMBER_PATH_MAP, memberPathForOperation } from './operation-map.js';
import { OPERATION_REFERENCE_DOC_PATH_MAP, REFERENCE_OPERATION_GROUPS } from './reference-doc-map.js';
import { buildInternalContractSchemas } from './schemas.js';
import { PUBLIC_MUTATION_STEP_OP_IDS, STEP_OP_CATALOG } from './step-op-catalog.js';
import { OPERATION_IDS, PRE_APPLY_THROW_CODES, isValidOperationIdFormat } from './types.js';
import { Z_ORDER_RELATIVE_HEIGHT_MAX, Z_ORDER_RELATIVE_HEIGHT_MIN } from '../images/z-order.js';
import type { TemplatesApplyFailureCode } from '../templates/index.js';
import type { ReceiptFailureCode } from '../types/index.js';

const TRACK_CHANGES_DECIDE_RECEIPT_FAILURE_CODES = [
  'NO_OP',
  'INVALID_INPUT',
  'INVALID_TARGET',
  'TARGET_NOT_FOUND',
  'CAPABILITY_UNAVAILABLE',
  'PERMISSION_DENIED',
  'PRECONDITION_FAILED',
  'COMMENT_CASCADE_PARTIAL',
] as const satisfies readonly ReceiptFailureCode[];

// Every TemplatesApplyFailureCode that the adapter can surface in a returned
// { success: false, failure } receipt. The satisfies guard below fails to
// compile if the contract's failure-code union and this list ever diverge.
const TEMPLATES_APPLY_RECEIPT_FAILURE_CODES = [
  'UNSUPPORTED_SOURCE',
  'INVALID_PACKAGE',
  'CAPABILITY_UNAVAILABLE',
  'UNSUPPORTED_TEMPLATE_CONTENT',
] as const satisfies readonly TemplatesApplyFailureCode[];

// Exhaustiveness: assigning the union to the array's element type (and vice
// versa) guarantees the list above covers every TemplatesApplyFailureCode value.
type _TemplatesFailureCoverageForward =
  TemplatesApplyFailureCode extends (typeof TEMPLATES_APPLY_RECEIPT_FAILURE_CODES)[number] ? true : never;
const _templatesFailureCoverage: _TemplatesFailureCoverageForward = true;
void _templatesFailureCoverage;

function expectArrayToIncludeValues(
  actual: readonly string[] | undefined,
  expected: readonly string[],
  label: string,
): void {
  expect(Array.isArray(actual), `${label} should be an array`).toBe(true);
  const missing = expected.filter((code) => !actual!.includes(code));
  expect(missing, `${label} missing expected codes`).toEqual([]);
}

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

  it('declares insert input as a text or structural-content union', () => {
    const schemas = buildInternalContractSchemas();
    const insertInputSchema = schemas.operations.insert.input as {
      oneOf?: Array<{
        oneOf?: Array<{
          type?: string;
          properties?: Record<string, unknown>;
          required?: string[];
          additionalProperties?: boolean;
        }>;
        type?: string;
        properties?: Record<string, unknown>;
        required?: string[];
        additionalProperties?: boolean;
      }>;
    };

    expect(Array.isArray(insertInputSchema.oneOf)).toBe(true);
    expect(insertInputSchema.oneOf).toHaveLength(2);

    const [textVariant, structuralVariant] = insertInputSchema.oneOf!;

    expect(Array.isArray(textVariant.oneOf)).toBe(true);
    expect(textVariant.oneOf).toHaveLength(3);

    const [textTargetVariant, textRefVariant, textUntargetedVariant] = textVariant.oneOf!;

    expect(textTargetVariant.type).toBe('object');
    expect(Object.keys(textTargetVariant.properties!).sort()).toEqual(['in', 'target', 'type', 'value']);
    expect(textTargetVariant.required).toEqual(['target', 'value']);
    expect(textTargetVariant.additionalProperties).toBe(false);
    expect((textTargetVariant.properties!.target as { $ref?: string }).$ref).toBe('#/$defs/SelectionTarget');

    expect(textRefVariant.type).toBe('object');
    expect(Object.keys(textRefVariant.properties!).sort()).toEqual(['in', 'ref', 'type', 'value']);
    expect(textRefVariant.required).toEqual(['ref', 'value']);
    expect(textRefVariant.additionalProperties).toBe(false);
    expect((textRefVariant.properties!.ref as { type?: string }).type).toBe('string');

    expect(textUntargetedVariant.type).toBe('object');
    expect(Object.keys(textUntargetedVariant.properties!).sort()).toEqual(['in', 'type', 'value']);
    expect(textUntargetedVariant.required).toEqual(['value']);
    expect(textUntargetedVariant.additionalProperties).toBe(false);

    expect(structuralVariant.type).toBe('object');
    expect(Object.keys(structuralVariant.properties!).sort()).toEqual([
      'content',
      'in',
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

  it('allows story-scoped text targets for bookmark inserts', () => {
    const schemas = buildInternalContractSchemas();
    const bookmarkInsertInput = schemas.operations['bookmarks.insert'].input as {
      properties?: {
        at?: { $ref?: string };
      };
    };
    const textTarget = schemas.$defs?.TextTarget as {
      properties?: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };

    expect(bookmarkInsertInput.properties?.at?.$ref).toBe('#/$defs/TextTarget');
    expect(textTarget.properties).toHaveProperty('story');
    expect((textTarget.properties?.story as { $ref?: string }).$ref).toBe('#/$defs/StoryLocator');
    expect(textTarget.required).toEqual(['kind', 'segments']);
    expect(textTarget.additionalProperties).toBe(false);
  });

  it('publishes cached field insert inputs in the contract schema', () => {
    const schemas = buildInternalContractSchemas();
    const fieldsInsertInput = schemas.operations['fields.insert'].input as {
      properties?: {
        mode?: { const?: string };
        at?: { $ref?: string };
        instruction?: { type?: string };
        cachedResultText?: { type?: string };
        updatePolicy?: { enum?: string[] };
      };
      required?: string[];
      additionalProperties?: boolean;
    };

    expect(fieldsInsertInput.properties?.mode?.const).toBe('raw');
    expect(fieldsInsertInput.properties?.at?.$ref).toBe('#/$defs/TextTarget');
    expect(fieldsInsertInput.properties?.instruction?.type).toBe('string');
    expect(fieldsInsertInput.properties?.cachedResultText?.type).toBe('string');
    expect(fieldsInsertInput.properties?.updatePolicy?.enum).toEqual(['rebuild', 'preserveCached']);
    expect(fieldsInsertInput.required).toEqual(['mode', 'at', 'instruction']);
    expect(fieldsInsertInput.additionalProperties).toBe(false);
  });

  it('publishes CommentTrackedChangeLink in shared defs for comments get/list outputs', () => {
    const schemas = buildInternalContractSchemas();
    const sharedLink = schemas.$defs?.CommentTrackedChangeLink as {
      properties?: { trackedChangeType?: { enum?: string[] } };
    };
    const commentsGetOutput = schemas.operations['comments.get'].output as {
      properties?: { trackedChangeLink?: { oneOf?: Array<{ $ref?: string; type?: string }> } };
    };
    const commentsListOutput = schemas.operations['comments.list'].output as {
      properties?: {
        items?: {
          items?: {
            properties?: {
              trackedChangeLink?: { oneOf?: Array<{ $ref?: string; type?: string }> };
            };
          };
        };
      };
    };
    const getVariants = commentsGetOutput.properties?.trackedChangeLink?.oneOf ?? [];
    const listVariants = commentsListOutput.properties?.items?.items?.properties?.trackedChangeLink?.oneOf ?? [];

    expect(sharedLink.properties?.trackedChangeType?.enum).toEqual([
      'insertion',
      'deletion',
      'replacement',
      'formatting',
      'move',
      'structural',
      'insert',
      'delete',
      'format',
    ]);
    expect(getVariants.some((variant) => variant.$ref === '#/$defs/CommentTrackedChangeLink')).toBe(true);
    expect(listVariants.some((variant) => variant.$ref === '#/$defs/CommentTrackedChangeLink')).toBe(true);
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

  it('accepts both legacy content and structured body for footnotes.insert', () => {
    const schemas = buildInternalContractSchemas();
    const insertInput = schemas.operations['footnotes.insert'].input as {
      oneOf?: Array<{ properties?: Record<string, unknown>; required?: string[] }>;
    };

    expect(Array.isArray(insertInput.oneOf)).toBe(true);
    expect(insertInput.oneOf).toHaveLength(2);

    const [contentVariant, bodyVariant] = insertInput.oneOf!;
    expect(Object.keys(contentVariant.properties ?? {}).sort()).toEqual(['at', 'content', 'type']);
    expect(contentVariant.required).toEqual(['type', 'content']);

    expect(Object.keys(bodyVariant.properties ?? {}).sort()).toEqual(['at', 'body', 'type']);
    expect(bodyVariant.required).toEqual(['type', 'body']);

    const bodySchema = bodyVariant.properties!.body as { oneOf?: Array<{ type?: string }> };
    expect(Array.isArray(bodySchema.oneOf)).toBe(true);
    expect(bodySchema.oneOf).toHaveLength(2);
    expect(bodySchema.oneOf![0].type).toBe('object');
    expect(bodySchema.oneOf![1].type).toBe('array');
  });

  it('accepts structured body patches for footnotes.update', () => {
    const schemas = buildInternalContractSchemas();
    const updateInput = schemas.operations['footnotes.update'].input as {
      properties?: { patch?: { oneOf?: Array<{ properties?: Record<string, unknown>; required?: string[] }> } };
    };
    const patchVariants = updateInput.properties?.patch?.oneOf ?? [];

    expect(patchVariants).toHaveLength(3);

    const bodyVariant = patchVariants.find((variant) =>
      Object.prototype.hasOwnProperty.call(variant.properties ?? {}, 'body'),
    );
    expect(bodyVariant).toBeDefined();
    expect(bodyVariant?.required).toEqual(['body']);

    const bodySchema = bodyVariant?.properties?.body as { oneOf?: Array<{ type?: string }> };
    expect(Array.isArray(bodySchema.oneOf)).toBe(true);
    expect(bodySchema.oneOf).toHaveLength(2);
    expect(bodySchema.oneOf![0].type).toBe('object');
    expect(bodySchema.oneOf![1].type).toBe('array');
  });

  it('allows null trackedChangeLink on comment read models', () => {
    const schemas = buildInternalContractSchemas();
    const commentInfoSchema = schemas.operations['comments.get'].output as {
      properties?: {
        trackedChangeLink?: { oneOf?: Array<Record<string, unknown>> };
      };
    };
    const commentsListSchema = schemas.operations['comments.list'].output as {
      properties?: {
        items?: {
          items?: {
            properties?: {
              trackedChangeLink?: { oneOf?: Array<Record<string, unknown>> };
            };
          };
        };
      };
    };

    const getVariants = commentInfoSchema.properties?.trackedChangeLink?.oneOf ?? [];
    const listVariants = commentsListSchema.properties?.items?.items?.properties?.trackedChangeLink?.oneOf ?? [];

    expect(getVariants.some((variant) => variant.type === 'null')).toBe(true);
    expect(listVariants.some((variant) => variant.type === 'null')).toBe(true);
  });

  it('publishes replacement in comment tracked-change enums for get/list and link defs', () => {
    const schemas = buildInternalContractSchemas();
    const commentInfoSchema = schemas.operations['comments.get'].output as {
      properties?: {
        trackedChangeType?: {
          enum?: string[];
        };
      };
    };
    const commentsListSchema = schemas.operations['comments.list'].output as {
      properties?: {
        items?: {
          items?: {
            properties?: {
              trackedChangeType?: {
                enum?: string[];
              };
            };
          };
        };
      };
    };
    const defs = schemas.$defs as Record<
      string,
      {
        properties?: Record<
          string,
          {
            enum?: string[];
          }
        >;
      }
    >;

    expect(commentInfoSchema.properties?.trackedChangeType?.enum).toEqual(
      expect.arrayContaining(['insert', 'delete', 'replacement', 'format']),
    );
    expect(commentsListSchema.properties?.items?.items?.properties?.trackedChangeType?.enum).toEqual(
      expect.arrayContaining(['insert', 'delete', 'replacement', 'format']),
    );
    expect(defs.CommentTrackedChangeLink?.properties?.trackedChangeType?.enum).toEqual(
      expect.arrayContaining(['insert', 'delete', 'replacement', 'format']),
    );
  });

  it('requires id on comments.create success receipts', () => {
    const schemas = buildInternalContractSchemas();
    const createOutputSchema = schemas.operations['comments.create'].output as {
      oneOf?: Array<{
        $ref?: string;
      }>;
    };
    const defs = schemas.$defs as Record<
      string,
      {
        properties?: Record<string, unknown>;
        required?: string[];
      }
    >;

    const successSchema = createOutputSchema.oneOf?.[0];
    expect(successSchema?.$ref).toBe('#/$defs/CommentsCreateSuccess');
    expect(defs.CommentsCreateSuccess?.properties).toHaveProperty('id');
    expect(defs.CommentsCreateSuccess?.required).toEqual(expect.arrayContaining(['success', 'id']));
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

  it('declares every trackChanges.decide receipt failure code in command metadata', () => {
    expectArrayToIncludeValues(
      COMMAND_CATALOG['trackChanges.decide'].possibleFailureCodes,
      TRACK_CHANGES_DECIDE_RECEIPT_FAILURE_CODES,
      'trackChanges.decide possibleFailureCodes',
    );
  });

  it('declares every templates.apply receipt failure code in command metadata', () => {
    expectArrayToIncludeValues(
      COMMAND_CATALOG['templates.apply'].possibleFailureCodes,
      TEMPLATES_APPLY_RECEIPT_FAILURE_CODES,
      'templates.apply possibleFailureCodes',
    );
    // The contract must not over-declare codes the adapter cannot produce.
    const declared = [...(COMMAND_CATALOG['templates.apply'].possibleFailureCodes ?? [])].sort();
    expect(declared).toEqual([...TEMPLATES_APPLY_RECEIPT_FAILURE_CODES].sort());
  });

  it('publishes the full setFlowOptions paragraph flow booleans in the contract input schema', () => {
    const schemas = buildInternalContractSchemas();
    const setFlowOptionsInput = schemas.operations['format.paragraph.setFlowOptions'].input as {
      properties?: Record<string, { type?: string }>;
      anyOf?: Array<{ required?: string[] }>;
    };

    expect(setFlowOptionsInput.properties?.contextualSpacing?.type).toBe('boolean');
    expect(setFlowOptionsInput.properties?.pageBreakBefore?.type).toBe('boolean');
    expect(setFlowOptionsInput.properties?.suppressAutoHyphens?.type).toBe('boolean');
    expect(setFlowOptionsInput.properties?.autoSpaceDE?.type).toBe('boolean');
    expect(setFlowOptionsInput.properties?.autoSpaceDN?.type).toBe('boolean');
    expect(setFlowOptionsInput.properties?.adjustRightInd?.type).toBe('boolean');
    expect(setFlowOptionsInput.properties?.snapToGrid?.type).toBe('boolean');

    const requiredSets = new Set(
      (setFlowOptionsInput.anyOf ?? []).map((variant) => variant.required?.join('|') ?? '').filter(Boolean),
    );
    expect(requiredSets).toEqual(
      new Set([
        'target|contextualSpacing',
        'target|pageBreakBefore',
        'target|suppressAutoHyphens',
        'target|autoSpaceDE',
        'target|autoSpaceDN',
        'target|adjustRightInd',
        'target|snapToGrid',
      ]),
    );
  });

  it('includes every templates.apply receipt failure code in the generated failure schema', () => {
    const schemas = buildInternalContractSchemas();
    const templatesFailureSchema = schemas.operations['templates.apply'].failure as {
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
    const enumCodes = templatesFailureSchema.properties?.failure?.properties?.code?.enum;
    expectArrayToIncludeValues(enumCodes, TEMPLATES_APPLY_RECEIPT_FAILURE_CODES, 'templates.apply failure schema enum');
  });

  it('includes every trackChanges.decide receipt failure code in the generated failure schema', () => {
    const schemas = buildInternalContractSchemas();
    const decideFailureSchema = schemas.operations['trackChanges.decide'].failure as {
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

    expectArrayToIncludeValues(
      decideFailureSchema.properties?.failure?.properties?.code?.enum,
      TRACK_CHANGES_DECIDE_RECEIPT_FAILURE_CODES,
      'trackChanges.decide failure schema code enum',
    );
  });

  it('includes every trackChanges.decide receipt failure code in the generated output schema', () => {
    const schemas = buildInternalContractSchemas();
    const decideOutputSchema = schemas.operations['trackChanges.decide'].output as {
      oneOf?: Array<{
        properties?: {
          failure?: {
            properties?: {
              code?: {
                enum?: string[];
              };
            };
          };
        };
      }>;
    };

    expectArrayToIncludeValues(
      decideOutputSchema.oneOf?.[1]?.properties?.failure?.properties?.code?.enum,
      TRACK_CHANGES_DECIDE_RECEIPT_FAILURE_CODES,
      'trackChanges.decide output schema failure code enum',
    );
  });

  it('publishes replacement as a first-class tracked-change type in list/get/extract schemas', () => {
    const schemas = buildInternalContractSchemas();
    const trackChangesListInput = schemas.operations['trackChanges.list'].input as {
      properties?: {
        type?: {
          enum?: string[];
        };
      };
    };
    const trackChangesGetOutput = schemas.operations['trackChanges.get'].output as {
      properties?: {
        type?: {
          enum?: string[];
        };
        grouping?: {
          enum?: string[];
        };
      };
    };
    const extractOutput = schemas.operations.extract.output as {
      properties?: {
        trackedChanges?: {
          items?: {
            properties?: {
              type?: {
                enum?: string[];
              };
            };
          };
        };
      };
    };

    expect(trackChangesListInput.properties?.type?.enum).toEqual(
      expect.arrayContaining(['insert', 'delete', 'replacement', 'format']),
    );
    expect(trackChangesGetOutput.properties?.type?.enum).toEqual(
      expect.arrayContaining(['insert', 'delete', 'replacement', 'format']),
    );
    expect(trackChangesGetOutput.properties?.grouping?.enum).toEqual(
      expect.arrayContaining(['standalone', 'replacement-pair', 'unknown']),
    );
    expect(trackChangesGetOutput.properties?.grouping?.enum).not.toContain('aggregate');
    expect(extractOutput.properties?.trackedChanges?.items?.properties?.type?.enum).toEqual(
      expect.arrayContaining(['insert', 'delete', 'replacement', 'format']),
    );
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

  it('narrows table operation address schemas to table-specific refs', () => {
    const schemas = buildInternalContractSchemas();

    const tablesGetInput = schemas.operations['tables.get'].input as {
      properties?: { target?: { $ref?: string } };
    };
    const tablesGetOutput = schemas.operations['tables.get'].output as {
      properties?: { address?: { $ref?: string } };
    };
    const unmergeInput = schemas.operations['tables.unmergeCells'].input as {
      oneOf?: Array<Record<string, unknown>>;
    };
    const setBorderInput = schemas.operations['tables.setBorder'].input as {
      properties?: { target?: { $ref?: string } };
    };
    const insertRowSuccess = schemas.operations['tables.insertRow'].success as {
      properties?: { table?: { $ref?: string } };
    };

    expect(tablesGetInput.properties?.target?.$ref).toBe('#/$defs/TableAddress');
    expect(tablesGetOutput.properties?.address?.$ref).toBe('#/$defs/TableAddress');

    // unmergeCells input is a oneOf: [cellLocator, tableScopedCellLocator (target), tableScopedCellLocator (nodeId)]
    expect(unmergeInput.oneOf).toHaveLength(3);
    const [cellBranch, tableTargetBranch, tableNodeIdBranch] = unmergeInput.oneOf as Array<{
      properties?: { target?: { $ref?: string }; nodeId?: unknown; rowIndex?: unknown; columnIndex?: unknown };
      required?: string[];
    }>;
    // First branch: direct cell locator (target.$ref → TableCellAddress)
    expect(cellBranch.properties?.target?.$ref).toBe('#/$defs/TableCellAddress');
    // Second branch: table-scoped with target (target.$ref → TableAddress + coordinates)
    expect(tableTargetBranch.properties?.target?.$ref).toBe('#/$defs/TableAddress');
    expect(tableTargetBranch.required).toContain('rowIndex');
    expect(tableTargetBranch.required).toContain('columnIndex');
    // Third branch: table-scoped with nodeId + coordinates
    expect(tableNodeIdBranch.properties?.nodeId).toBeDefined();
    expect(tableNodeIdBranch.required).toContain('nodeId');
    expect(tableNodeIdBranch.required).toContain('rowIndex');
    expect(tableNodeIdBranch.required).toContain('columnIndex');

    expect(setBorderInput.properties?.target?.$ref).toBe('#/$defs/TableOrCellAddress');
    expect(insertRowSuccess.properties?.table?.$ref).toBe('#/$defs/TableAddress');
  });

  it('preserves row-locator constraints in row operation schemas', () => {
    const schemas = buildInternalContractSchemas();
    const insertRowInput = schemas.operations['tables.insertRow'].input as {
      oneOf?: Array<{
        properties?: {
          target?: { $ref?: string };
          nodeId?: { type?: string };
          rowIndex?: { type?: string; minimum?: number };
          position?: { enum?: string[] };
        };
        required?: string[];
      }>;
    };
    const deleteRowInput = schemas.operations['tables.deleteRow'].input as {
      oneOf?: Array<{
        properties?: {
          target?: { $ref?: string };
          nodeId?: { type?: string };
          rowIndex?: { type?: string; minimum?: number };
        };
        required?: string[];
      }>;
    };

    // 1–3: scoped variants. 4: SD-2540 append-at-end shorthand
    // (table-level target with no rowIndex/position).
    expect(insertRowInput.oneOf).toHaveLength(4);
    expect(insertRowInput.oneOf?.[0]?.properties?.target?.$ref).toBe('#/$defs/TableRowAddress');
    expect(insertRowInput.oneOf?.[0]?.required).toEqual(['target', 'position']);
    expect(insertRowInput.oneOf?.[1]?.properties?.target?.$ref).toBe('#/$defs/TableAddress');
    expect(insertRowInput.oneOf?.[1]?.required).toEqual(['target', 'rowIndex', 'position']);
    expect(insertRowInput.oneOf?.[2]?.properties?.rowIndex).toEqual({ type: 'integer', minimum: 0 });
    expect(insertRowInput.oneOf?.[2]?.required).toEqual(['nodeId', 'rowIndex', 'position']);
    // Append-at-end variant: target OR nodeId, no rowIndex, no position.
    // Uses an inner oneOf for target/nodeId and a `not` clause to forbid
    // rowIndex/position; no top-level `required` array.
    const appendVariant = insertRowInput.oneOf?.[3] as {
      properties?: { target?: { $ref?: string }; nodeId?: { type?: string } };
      oneOf?: Array<{ required?: string[] }>;
      not?: { anyOf?: Array<{ required?: string[] }> };
    };
    expect(appendVariant?.properties?.target?.$ref).toBe('#/$defs/TableAddress');
    expect(appendVariant?.properties?.nodeId?.type).toBe('string');
    expect(appendVariant?.oneOf).toEqual([{ required: ['target'] }, { required: ['nodeId'] }]);
    expect(appendVariant?.not?.anyOf).toEqual([{ required: ['rowIndex'] }, { required: ['position'] }]);

    expect(deleteRowInput.oneOf).toHaveLength(3);
    expect(deleteRowInput.oneOf?.[0]?.properties?.target?.$ref).toBe('#/$defs/TableRowAddress');
    expect(deleteRowInput.oneOf?.[0]?.required).toEqual(['target']);
    expect(deleteRowInput.oneOf?.[1]?.properties?.target?.$ref).toBe('#/$defs/TableAddress');
    expect(deleteRowInput.oneOf?.[1]?.required).toEqual(['target', 'rowIndex']);
    expect(deleteRowInput.oneOf?.[2]?.properties?.nodeId?.type).toBe('string');
    expect(deleteRowInput.oneOf?.[2]?.properties?.rowIndex).toEqual({ type: 'integer', minimum: 0 });
    expect(deleteRowInput.oneOf?.[2]?.required).toEqual(['nodeId', 'rowIndex']);
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
      'templates',
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
      'selection',
      'diff',
      'protection',
      'permissionRanges',
      'customXml',
      'metadata',
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
          id === 'templates.apply' ||
          id === 'tables.setDefaultStyle' ||
          id === 'tables.clearDefaultStyle' ||
          id === 'diff.apply',
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

  it('marks exactly templates.apply as the async (returnsPromise) operation', () => {
    // SD-3247: templates.apply is the only async Document API operation. This
    // guards the narrow returnsPromise metadata flag from drifting — any new
    // async operation must update this list intentionally.
    const asyncOps = OPERATION_IDS.filter((id) => COMMAND_CATALOG[id].returnsPromise === true).sort();
    expect(asyncOps).toEqual(['templates.apply']);

    // returnsPromise is a strict boolean signal: it is either true or absent.
    for (const id of OPERATION_IDS) {
      const value = COMMAND_CATALOG[id].returnsPromise;
      expect(value === true || value === undefined, `${id} returnsPromise must be true or undefined`).toBe(true);
    }
  });
});
