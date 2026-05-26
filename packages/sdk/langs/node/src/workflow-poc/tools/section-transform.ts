import type { BoundDocApi } from '../../generated/client.js';
import type { InvokeOptions } from '../../runtime/process.js';
import { runSuperdocStructureInsertWorkflow } from './structure-insert.js';

export type RunSuperdocSectionTransformInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

export async function runSuperdocSectionTransformWorkflow(
  input: RunSuperdocSectionTransformInput,
): Promise<Awaited<ReturnType<typeof runSuperdocStructureInsertWorkflow>>> {
  return runSuperdocStructureInsertWorkflow({
    documentHandle: input.documentHandle,
    args: {
      ...input.args,
      action: 'move_section',
    },
    invokeOptions: input.invokeOptions,
  });
}
