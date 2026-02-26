import { describe, expect, test } from 'bun:test';
import { CLI_COMMAND_SPECS, CLI_HELP } from '../cli/commands';

describe('CLI help regression coverage', () => {
  test('includes blocks.delete in help output', () => {
    const blocksDeleteCommand = CLI_COMMAND_SPECS.find(
      (spec) => !spec.alias && spec.operationId === 'doc.blocks.delete',
    );

    expect(blocksDeleteCommand).toBeDefined();
    expect(CLI_HELP).toContain('blocks:');
    expect(CLI_HELP).toContain(blocksDeleteCommand!.key);
  });
});
