/**
 * Plan-engine wrapper for create.table.
 *
 * Delegates to executeCompiledPlan via a create.table step executor,
 * eliminating the Layer A direct-call bypass.
 */

import { v4 as uuidv4 } from 'uuid';
import type { CreateTableInput, CreateTableResult, MutationOptions, MutationStep } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { CompiledPlan } from './compiler.js';
import { executeCompiledPlan } from './executor.js';
import { checkRevision, getRevision } from './revision-tracker.js';
import { STUB_WHERE } from './plan-wrappers.js';
import { createTableAdapter } from '../tables-adapter.js';

export function createTableWrapper(
  editor: Editor,
  input: CreateTableInput,
  options?: MutationOptions,
): CreateTableResult {
  if (options?.dryRun) {
    checkRevision(editor, options?.expectedRevision);
    return createTableAdapter(editor, input, options);
  }

  let adapterResult: CreateTableResult | undefined;
  const step = {
    id: uuidv4(),
    op: 'create.table',
    where: STUB_WHERE,
    args: {},
    _handler: () => {
      adapterResult = createTableAdapter(editor, input, options);
      return {
        success: adapterResult.success,
        nodeId: adapterResult.success ? adapterResult.table.nodeId : undefined,
      };
    },
  } as unknown as MutationStep;

  const compiled: CompiledPlan = {
    mutationSteps: [{ step, targets: [] }],
    assertSteps: [],
    compiledRevision: getRevision(editor),
  };

  executeCompiledPlan(editor, compiled, {
    expectedRevision: options?.expectedRevision,
    changeMode: options?.changeMode,
  });

  return adapterResult!;
}
