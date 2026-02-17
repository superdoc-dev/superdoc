import { normalizeMutationOptions, type MutationOptions } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';

export interface FormatBoldInput {
  target: TextAddress;
}

export interface FormatAdapter {
  /** Apply or toggle bold formatting on the target text range. */
  bold(input: FormatBoldInput, options?: MutationOptions): TextMutationReceipt;
}

export type FormatApi = FormatAdapter;

export function executeFormatBold(
  adapter: FormatAdapter,
  input: FormatBoldInput,
  options?: MutationOptions,
): TextMutationReceipt {
  return adapter.bold(input, normalizeMutationOptions(options));
}
