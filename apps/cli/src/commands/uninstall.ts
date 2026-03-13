import { existsSync, rmSync } from 'node:fs';
import type { CliIO } from '../lib/types';
import { resolveSkillTargets } from './skill-targets';

export async function runUninstall(tokens: string[], io: CliIO): Promise<number> {
  if (!tokens.includes('--skills')) {
    io.stderr('Usage: superdoc uninstall --skills\n');
    return 1;
  }

  const cwd = process.cwd();
  const targets = resolveSkillTargets(cwd);
  let removed = 0;

  for (const target of targets) {
    if (!existsSync(target.skillDir)) continue;

    rmSync(target.skillDir, { recursive: true });
    io.stdout(`Removed ${target.displaySkillDir}\n`);
    removed += 1;
  }

  if (removed === 0) {
    io.stdout('No installed skills found.\n');
  }

  return 0;
}
