import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from '../index';

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

async function runCli(args: string[], cwd?: string, homeDir?: string): Promise<RunResult> {
  let stdout = '';
  let stderr = '';
  const originalCwd = process.cwd();
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  if (cwd) process.chdir(cwd);
  if (homeDir) {
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
  }

  try {
    const code = await run(args, {
      stdout(message: string) {
        stdout += message;
      },
      stderr(message: string) {
        stderr += message;
      },
      async readStdinBytes() {
        return new Uint8Array();
      },
    });

    return { code, stdout, stderr };
  } finally {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    process.chdir(originalCwd);
  }
}

describe('install and uninstall commands', () => {
  let testDir: string;

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createTestDir(): string {
    testDir = mkdtempSync(join(tmpdir(), 'superdoc-cli-install-test-'));
    return testDir;
  }

  function createTestHome(dir: string): string {
    const home = join(dir, 'home');
    mkdirSync(home, { recursive: true });
    return home;
  }

  test('install --skills copies skill into .claude/', async () => {
    const dir = createTestDir();
    const home = createTestHome(dir);
    mkdirSync(join(dir, '.claude'));

    const result = await runCli(['install', '--skills'], dir, home);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('.claude/skills/superdoc/');
    expect(existsSync(join(dir, '.claude', 'skills', 'superdoc', 'SKILL.md'))).toBe(true);
  });

  test('install --skills copies skill into .agents/', async () => {
    const dir = createTestDir();
    const home = createTestHome(dir);
    mkdirSync(join(dir, '.agents'));

    const result = await runCli(['install', '--skills'], dir, home);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('.agents/skills/superdoc/');
    expect(existsSync(join(dir, '.agents', 'skills', 'superdoc', 'SKILL.md'))).toBe(true);
  });

  test('install --skills copies into both when both exist', async () => {
    const dir = createTestDir();
    const home = createTestHome(dir);
    mkdirSync(join(dir, '.claude'));
    mkdirSync(join(dir, '.agents'));

    const result = await runCli(['install', '--skills'], dir, home);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('.claude/skills/superdoc/');
    expect(result.stdout).toContain('.agents/skills/superdoc/');
  });

  test('install --skills falls back to home agent directories', async () => {
    const dir = createTestDir();
    const home = createTestHome(dir);
    mkdirSync(join(home, '.claude'));

    const result = await runCli(['install', '--skills'], dir, home);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('~/.claude/skills/superdoc/');
    expect(existsSync(join(home, '.claude', 'skills', 'superdoc', 'SKILL.md'))).toBe(true);
  });

  test('install --skills warns when no agent directories exist', async () => {
    const dir = createTestDir();
    const home = createTestHome(dir);

    const result = await runCli(['install', '--skills'], dir, home);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No agent directories found');
  });

  test('install without --skills prints usage', async () => {
    const dir = createTestDir();
    const home = createTestHome(dir);

    const result = await runCli(['install'], dir, home);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Usage: superdoc install --skills');
  });

  test('install runtime failures return structured CLI errors', async () => {
    const dir = createTestDir();
    const home = createTestHome(dir);
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude', 'skills'), 'blocked');

    const result = await runCli(['install', '--skills'], dir, home);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('"ok":false');
    expect(result.stderr).toContain('"code":"COMMAND_FAILED"');
  });

  test('uninstall --skills removes installed skill directories', async () => {
    const dir = createTestDir();
    const home = createTestHome(dir);
    mkdirSync(join(dir, '.claude', 'skills', 'superdoc'), { recursive: true });
    mkdirSync(join(dir, '.agents', 'skills', 'superdoc'), { recursive: true });

    const result = await runCli(['uninstall', '--skills'], dir, home);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('.claude/skills/superdoc/');
    expect(result.stdout).toContain('.agents/skills/superdoc/');
    expect(existsSync(join(dir, '.claude', 'skills', 'superdoc'))).toBe(false);
    expect(existsSync(join(dir, '.agents', 'skills', 'superdoc'))).toBe(false);
  });

  test('uninstall --skills removes skills from home agent directories', async () => {
    const dir = createTestDir();
    const home = createTestHome(dir);
    mkdirSync(join(home, '.agents', 'skills', 'superdoc'), { recursive: true });

    const result = await runCli(['uninstall', '--skills'], dir, home);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('~/.agents/skills/superdoc/');
    expect(existsSync(join(home, '.agents', 'skills', 'superdoc'))).toBe(false);
  });

  test('uninstall --skills is no-op when nothing is installed', async () => {
    const dir = createTestDir();
    const home = createTestHome(dir);

    const result = await runCli(['uninstall', '--skills'], dir, home);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No installed skills found');
  });

  test('uninstall without --skills prints usage', async () => {
    const dir = createTestDir();
    const home = createTestHome(dir);

    const result = await runCli(['uninstall'], dir, home);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Usage: superdoc uninstall --skills');
  });

  test('install --help shows global CLI help', async () => {
    const result = await runCli(['install', '--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage: superdoc <command> [options]');
  });

  test('uninstall --help shows global CLI help', async () => {
    const result = await runCli(['uninstall', '--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage: superdoc <command> [options]');
  });
});
