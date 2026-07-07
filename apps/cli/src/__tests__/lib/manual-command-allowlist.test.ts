import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { MANUAL_COMMAND_ALLOWLIST, MANUAL_OPERATION_ALLOWLIST } from '../../lib/manual-command-allowlist';
import { getLegacyRunner } from '../../lib/legacy-operation-dispatch';
import { CLI_OPERATION_METADATA, type CliOperationId } from '../../cli';

describe('manual command allowlist', () => {
  test('contains only lifecycle/session commands plus call', () => {
    expect([...MANUAL_COMMAND_ALLOWLIST]).toEqual([
      'call',
      'open',
      'save',
      'close',
      'insert tab',
      'insert line-break',
      // CLI/SDK-only session op: model-authored JS against the live editor.doc.
      'execute code',
      'session list',
      'session save',
      'session close',
      'session set-default',
      'session use',
      // LLM-tools preset proxies (cross-language surface for the Python SDK).
      'preset list',
      'preset get-catalog',
      'preset get-tools',
      'preset get-system-prompt',
      'preset get-mcp-prompt',
      'preset dispatch',
    ]);
  });

  test('operation allowlist contains only lifecycle/session operations', () => {
    expect([...MANUAL_OPERATION_ALLOWLIST]).toEqual([
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
    ]);
  });

  test('commands directory contains only allowlisted command handlers plus shared runners', () => {
    const commandDirUrl = new URL('../../commands/', import.meta.url);
    const actual = readdirSync(commandDirUrl)
      .filter((entry) => entry.endsWith('.ts'))
      .sort();

    expect(actual).toEqual([
      'call.ts',
      'close.ts',
      'execute-code.ts',
      'insert-inline-special.ts',
      'install.ts',
      'legacy-compat.ts',
      'open.ts',
      'preset.ts',
      'save.ts',
      'session-close.ts',
      'session-list.ts',
      'session-save.ts',
      'session-set-default.ts',
      'skill-targets.ts',
      'uninstall.ts',
    ]);
  });

  test('legacy runner map is restricted to manual operation allowlist', () => {
    const manualAllowlist = new Set<CliOperationId>(MANUAL_OPERATION_ALLOWLIST);
    const operationIds = Object.keys(CLI_OPERATION_METADATA) as CliOperationId[];

    for (const operationId of operationIds) {
      const runner = getLegacyRunner(operationId);
      if (manualAllowlist.has(operationId)) {
        expect(runner).toBeDefined();
      } else {
        expect(runner).toBeUndefined();
      }
    }
  });
});
