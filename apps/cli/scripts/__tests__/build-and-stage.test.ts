import { describe, expect, test } from 'bun:test';
import { main, resolveBuildAndStageOptions } from '../build-and-stage.js';

type ScriptCall = {
  scriptPath: string;
  args: string[];
  label: string | undefined;
};

describe('resolveBuildAndStageOptions', () => {
  test('defaults to all-platform native build', () => {
    expect(resolveBuildAndStageOptions([])).toEqual({
      allPlatforms: true,
      nativeBuildArgs: ['--all'],
      skipCliBuild: false,
    });
  });

  test('supports single-platform mode', () => {
    expect(resolveBuildAndStageOptions(['--single-platform'])).toEqual({
      allPlatforms: false,
      nativeBuildArgs: [],
      skipCliBuild: false,
    });
  });

  test('rejects conflicting target selection flags', () => {
    expect(() => resolveBuildAndStageOptions(['--all', '--single-platform'])).toThrow(
      'Use either --all or --single-platform, not both.',
    );
  });

  test('rejects unknown flags', () => {
    expect(() => resolveBuildAndStageOptions(['--bogus'])).toThrow('Unknown flag(s): --bogus');
  });
});

describe('main', () => {
  test('runs sync, native build, and stage by default', () => {
    const calls: ScriptCall[] = [];

    main([], (scriptPath, args = [], label) => {
      calls.push({ scriptPath, args, label });
    });

    expect(calls).toEqual([
      {
        scriptPath: './apps/cli/scripts/sync-version.js',
        args: [],
        label: 'Sync CLI versions',
      },
      {
        scriptPath: './apps/cli/scripts/build-native-cli.js',
        args: ['--all'],
        label: 'Build native CLI artifacts (all)',
      },
      {
        scriptPath: './apps/cli/scripts/stage-artifacts.js',
        args: [],
        label: 'Stage CLI artifacts',
      },
    ]);
  });

  test('skips native build step when requested', () => {
    const calls: ScriptCall[] = [];

    main(['--skip-cli-build'], (scriptPath, args = [], label) => {
      calls.push({ scriptPath, args, label });
    });

    expect(calls).toEqual([
      {
        scriptPath: './apps/cli/scripts/sync-version.js',
        args: [],
        label: 'Sync CLI versions',
      },
      {
        scriptPath: './apps/cli/scripts/stage-artifacts.js',
        args: [],
        label: 'Stage CLI artifacts',
      },
    ]);
  });
});
