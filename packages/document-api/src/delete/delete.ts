import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';

export interface DeleteInput {
  target: TextAddress;
}

export function executeDelete(
  adapter: WriteAdapter,
  input: DeleteInput,
  options?: MutationOptions,
): TextMutationReceipt {
  return executeWrite(
    adapter,
    {
      kind: 'delete',
      target: input.target,
      text: '',
    },
    options,
  );
}
