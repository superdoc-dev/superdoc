import type { CliOperationId } from '../cli';

/**
 * These commands are intentionally manual.
 * They are lifecycle/session orchestration entry points, not main Document API operation wrappers.
 * Keep this list explicit and bounded.
 */
export const MANUAL_COMMAND_ALLOWLIST = [
  'call',
  'open',
  'save',
  'close',
  'session list',
  'session save',
  'session close',
  'session set-default',
  'session use',
] as const;

export type ManualCommandKey = (typeof MANUAL_COMMAND_ALLOWLIST)[number];

export const MANUAL_OPERATION_ALLOWLIST = [
  'doc.open',
  'doc.save',
  'doc.close',
  'doc.session.list',
  'doc.session.save',
  'doc.session.close',
  'doc.session.setDefault',
] as const satisfies readonly CliOperationId[];
