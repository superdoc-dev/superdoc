import type { TextAddress, TextMutationReceipt } from '../types/index.js';

export type ChangeMode = 'direct' | 'tracked';

export interface MutationOptions {
  /**
   * Controls whether mutation applies directly or as a tracked change.
   * Defaults to `direct`.
   */
  changeMode?: ChangeMode;
  /**
   * When true, adapters validate and resolve the operation but must not mutate state.
   * Defaults to `false`.
   */
  dryRun?: boolean;
}

export type WriteKind = 'insert' | 'replace' | 'delete';

export type InsertWriteRequest = {
  kind: 'insert';
  /**
   * Optional insertion target.
   * When omitted, adapters may resolve a deterministic default insertion point.
   */
  target?: TextAddress;
  text: string;
};

export type ReplaceWriteRequest = {
  kind: 'replace';
  target: TextAddress;
  text: string;
};

export type DeleteWriteRequest = {
  kind: 'delete';
  target: TextAddress;
  text?: '';
};

export type WriteRequest = InsertWriteRequest | ReplaceWriteRequest | DeleteWriteRequest;

export interface WriteAdapter {
  write(request: WriteRequest, options?: MutationOptions): TextMutationReceipt;
}

export function normalizeMutationOptions(options?: MutationOptions): MutationOptions {
  return {
    changeMode: options?.changeMode ?? 'direct',
    dryRun: options?.dryRun ?? false,
  };
}

export function executeWrite(
  adapter: WriteAdapter,
  request: WriteRequest,
  options?: MutationOptions,
): TextMutationReceipt {
  return adapter.write(request, normalizeMutationOptions(options));
}
