import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const AGENT_DIRS = ['.claude', '.agents'] as const;

type SkillTargetRoot = {
  baseDir: string;
  displayPrefix: string;
};

export type SkillTarget = {
  skillDir: string;
  displaySkillDir: string;
};

function realPathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function resolveTargetRoots(cwd: string): SkillTargetRoot[] {
  const roots: SkillTargetRoot[] = [{ baseDir: cwd, displayPrefix: '' }];
  const homeDir = process.env.HOME || process.env.USERPROFILE || homedir();
  if (homeDir && homeDir !== cwd) {
    roots.push({ baseDir: homeDir, displayPrefix: '~/' });
  }
  return roots;
}

export function resolveSkillTargets(cwd: string): SkillTarget[] {
  const targets: SkillTarget[] = [];
  const seen = new Set<string>();

  for (const root of resolveTargetRoots(cwd)) {
    for (const agentDirName of AGENT_DIRS) {
      const agentDir = join(root.baseDir, agentDirName);
      if (!existsSync(agentDir)) continue;

      const dedupeKey = realPathOrSelf(agentDir);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const displaySkillDir = `${root.displayPrefix}${agentDirName}/skills/superdoc/`;
      targets.push({
        skillDir: join(agentDir, 'skills', 'superdoc'),
        displaySkillDir,
      });
    }
  }

  return targets;
}
