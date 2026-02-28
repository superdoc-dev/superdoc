import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { CliIO } from '../lib/types';

const SKILL_PATHS = [
  { name: 'Claude Code', path: '.claude/skills/superdoc' },
  { name: 'Codex', path: '.agents/skills/superdoc' },
] as const;

export async function runUninstall(tokens: string[], io: CliIO): Promise<number> {
  if (!tokens.includes('--skills')) {
    io.stderr('Usage: superdoc uninstall --skills\n');
    return 1;
  }

  const cwd = process.cwd();
  let removed = 0;

  for (const target of SKILL_PATHS) {
    const fullPath = join(cwd, target.path);
    if (!existsSync(fullPath)) continue;

    rmSync(fullPath, { recursive: true });
    io.stdout(`Removed ${target.path}/\n`);
    removed += 1;
  }

  if (removed === 0) {
    io.stdout('No installed skills found.\n');
  }

  return 0;
}
