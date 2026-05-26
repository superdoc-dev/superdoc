import type { BoundDocApi } from '../../generated/client.js';
import type { InvokeOptions } from '../../runtime/process.js';
import { runSuperdocDoWorkflow } from './do.js';

export type RunSuperdocFormatTransformInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

export async function runSuperdocFormatTransformWorkflow(
  input: RunSuperdocFormatTransformInput,
): Promise<Awaited<ReturnType<typeof runSuperdocDoWorkflow>>> {
  return runSuperdocDoWorkflow({
    documentHandle: input.documentHandle,
    args: input.args,
    invokeOptions: input.invokeOptions,
  });
}
