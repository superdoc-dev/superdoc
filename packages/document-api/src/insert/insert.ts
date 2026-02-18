import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';

export interface InsertInput {
  target?: TextAddress;
  text: string;
}

export function executeInsert(
  adapter: WriteAdapter,
  input: InsertInput,
  options?: MutationOptions,
): TextMutationReceipt {
  const request = input.target
    ? {
        kind: 'insert' as const,
        target: input.target,
        text: input.text,
      }
    : {
        kind: 'insert' as const,
        text: input.text,
      };

  return executeWrite(adapter, request, options);
}
