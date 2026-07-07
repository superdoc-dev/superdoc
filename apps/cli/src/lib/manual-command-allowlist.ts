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
  'insert tab',
  'insert line-break',
  'execute code',
  'session list',
  'session save',
  'session close',
  'session set-default',
  'session use',
  'preset list',
  'preset get-catalog',
  'preset get-tools',
  'preset get-system-prompt',
  'preset get-mcp-prompt',
  'preset dispatch',
] as const;

export type ManualCommandKey = (typeof MANUAL_COMMAND_ALLOWLIST)[number];

export const MANUAL_OPERATION_ALLOWLIST = [
  'doc.open',
  'doc.save',
  'doc.close',
  'doc.insertTab',
  'doc.insertLineBreak',
  'doc.executeCode',
  'doc.session.list',
  'doc.session.save',
  'doc.session.close',
  'doc.session.setDefault',
  'doc.preset.list',
  'doc.preset.getCatalog',
  'doc.preset.getTools',
  'doc.preset.getSystemPrompt',
  'doc.preset.getMcpPrompt',
  'doc.preset.dispatch',
] as const satisfies readonly CliOperationId[];
