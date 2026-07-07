import { describe, expect, test } from 'bun:test';
import { ensureDocumentApiBuild, ensureNodeSdkBuild, ensureSuperdocBuild } from '../ensure-superdoc-build.js';

type CommandCall = {
  command: string;
  args: string[];
  label: string | undefined;
};

describe('ensureDocumentApiBuild', () => {
  test('cleans and rebuilds document-api from the workspace root', () => {
    const calls: CommandCall[] = [];

    ensureDocumentApiBuild((command, args, label) => {
      calls.push({ command, args, label });
    });

    expect(calls).toEqual([
      {
        command: 'pnpm',
        args: ['exec', 'tsc', '-b', '--clean', 'packages/document-api'],
        label: 'Clean document-api dist for CLI runtime',
      },
      {
        command: 'pnpm',
        args: ['exec', 'tsc', '-b', 'packages/document-api'],
        label: 'Build document-api dist for CLI runtime',
      },
    ]);
  });
});

describe('ensureNodeSdkBuild', () => {
  test('generates SDK artifacts and rebuilds the Node SDK package', () => {
    const calls: CommandCall[] = [];

    ensureNodeSdkBuild((command, args, label) => {
      calls.push({ command, args, label });
    });

    expect(calls).toEqual([
      {
        command: 'pnpm',
        args: ['--prefix', expect.stringContaining('/packages/sdk'), 'run', 'generate'],
        label: 'Generate SDK artifacts for CLI runtime',
      },
      {
        command: 'pnpm',
        args: ['--prefix', expect.stringContaining('/packages/sdk/langs/node'), 'run', 'build'],
        label: 'Build Node SDK for CLI runtime',
      },
    ]);
  });
});

describe('ensureSuperdocBuild', () => {
  test('builds SDK first, then the fast packaged superdoc build by default', () => {
    const calls: CommandCall[] = [];

    ensureSuperdocBuild({}, (command, args, label) => {
      calls.push({ command, args, label });
    });

    expect(calls).toEqual([
      {
        command: 'pnpm',
        args: ['--prefix', expect.stringContaining('/packages/sdk'), 'run', 'generate'],
        label: 'Generate SDK artifacts for CLI runtime',
      },
      {
        command: 'pnpm',
        args: ['--prefix', expect.stringContaining('/packages/sdk/langs/node'), 'run', 'build'],
        label: 'Build Node SDK for CLI runtime',
      },
      {
        command: 'pnpm',
        args: ['--prefix', expect.stringContaining('/packages/superdoc'), 'run', 'build:dev'],
        label: 'Build packaged SuperDoc runtime',
      },
    ]);
  });

  test('uses the full typed superdoc build when includeTypes is true', () => {
    const calls: CommandCall[] = [];

    ensureSuperdocBuild({ includeTypes: true }, (command, args, label) => {
      calls.push({ command, args, label });
    });

    expect(calls.at(-1)).toEqual({
      command: 'pnpm',
      args: ['--prefix', expect.stringContaining('/packages/superdoc'), 'run', 'build:es'],
      label: 'Build packaged SuperDoc runtime and types',
    });
  });
});
