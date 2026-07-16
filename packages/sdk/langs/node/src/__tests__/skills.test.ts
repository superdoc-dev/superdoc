import { describe, expect, test } from 'bun:test';
import { getSkill, installSkill, type InstallSkillOptions } from '../skills.ts';
import { SuperDocCliError } from '../runtime/errors.js';

function expectInvalidSkillName(run: () => unknown, name: unknown): void {
  try {
    run();
    throw new Error('Expected invalid skill name to throw.');
  } catch (error) {
    expect(error).toBeInstanceOf(SuperDocCliError);
    const cliError = error as SuperDocCliError;
    expect(cliError.code).toBe('INVALID_ARGUMENT');
    expect(cliError.details).toEqual({ name });
  }
}

function expectInvalidInstallOptions(options: unknown): void {
  try {
    installSkill('missing', options as InstallSkillOptions);
    throw new Error('Expected invalid install options to throw.');
  } catch (error) {
    expect(error).toBeInstanceOf(SuperDocCliError);
    const cliError = error as SuperDocCliError;
    expect(cliError.code).toBe('INVALID_ARGUMENT');
    expect(cliError.details).toEqual({ options });
  }
}

describe('SDK skills', () => {
  test('getSkill rejects non-string names with a structured SDK error', () => {
    for (const name of [null, undefined, 42, {}, []]) {
      expectInvalidSkillName(() => getSkill(name as string), name);
    }
  });

  test('installSkill rejects non-string names before resolving an install path', () => {
    for (const name of [null, undefined, 42, {}, []]) {
      expectInvalidSkillName(() => installSkill(name as string), name);
    }
  });

  test('installSkill rejects non-object options with a structured SDK error', () => {
    for (const options of [null, 42, 'invalid', true, []]) {
      expectInvalidInstallOptions(options);
    }
  });
});
