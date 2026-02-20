import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';

export interface ReplaceInput {
  target: TextAddress;
  text: string;
}

export function executeReplace(
  adapter: WriteAdapter,
  input: ReplaceInput,
  options?: MutationOptions,
): TextMutationReceipt {
  return executeWrite(
    adapter,
    {
      kind: 'replace',
      target: input.target,
      text: input.text,
    },
    options,
  );
}
