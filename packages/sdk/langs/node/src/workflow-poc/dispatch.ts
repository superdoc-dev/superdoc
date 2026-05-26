import type { BoundDocApi } from '../generated/client.js';
import { SuperDocCliError } from '../runtime/errors.js';
import type { InvokeOptions } from '../runtime/process.js';
import { getWorkflowPocToolRegistryEntry } from './registry.js';
import type { WorkflowPocToolName } from './types.js';

export async function dispatchWorkflowPocTool(
  documentHandle: BoundDocApi,
  toolName: WorkflowPocToolName,
  args: Record<string, unknown> = {},
  invokeOptions?: InvokeOptions,
): Promise<unknown> {
  const registryEntry = getWorkflowPocToolRegistryEntry(toolName);
  const result = await registryEntry.run({ documentHandle, args, invokeOptions });

  if (result.receipt.status === 'not_implemented') {
    throw new SuperDocCliError(
      `Toolset profile "workflow-poc" is not implemented for ${toolName} (${result.receipt.phase}).`,
      {
        code: 'TOOLSET_PROFILE_NOT_IMPLEMENTED',
        details: {
          profile: 'workflow-poc',
          surface: 'dispatchSuperDocTool',
          toolName,
          phase: result.receipt.phase,
          receipt: result.receipt,
        },
      },
    );
  }

  if (result.receipt.status === 'failed') {
    throw new SuperDocCliError(`Workflow-poc tool dispatch failed for ${toolName}: ${result.receipt.message}`, {
      code: 'TOOL_DISPATCH_FAILED',
      details: {
        profile: 'workflow-poc',
        surface: 'dispatchSuperDocTool',
        toolName,
        phase: result.receipt.phase,
        receipt: result.receipt,
      },
    });
  }

  return result.output;
}
