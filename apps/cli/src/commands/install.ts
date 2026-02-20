import { existsSync, cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CliIO } from '../lib/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AGENT_TARGETS = [
  { name: 'Claude Code', dir: '.claude' },
  { name: 'Codex', dir: '.agents' },
] as const;

function resolveSkillSource(): string {
  // In compiled dist: __dirname is dist/, skill/ is at dist/../skill/
  // In dev (bun run src/index.ts): __dirname is src/commands/, skill/ is at src/commands/../../skill/
  const fromDist = join(__dirname, '..', 'skill');
  if (existsSync(fromDist)) return fromDist;

  const fromSrc = join(__dirname, '..', '..', 'skill');
  if (existsSync(fromSrc)) return fromSrc;

  throw new Error('Could not locate bundled skill directory. Is the package installed correctly?');
}

export async function runInstall(tokens: string[], io: CliIO): Promise<number> {
  if (!tokens.includes('--skills')) {
    io.stderr('Usage: superdoc install --skills\n');
    return 1;
  }

  const cwd = process.cwd();
  const skillSource = resolveSkillSource();
  let installed = 0;

  for (const target of AGENT_TARGETS) {
    const agentDir = join(cwd, target.dir);
    if (!existsSync(agentDir)) continue;

    const dest = join(agentDir, 'skills', 'superdoc');
    mkdirSync(dest, { recursive: true });
    cpSync(skillSource, dest, { recursive: true });
    io.stdout(`Installed skill to ${target.dir}/skills/superdoc/\n`);
    installed += 1;
  }

  if (installed === 0) {
    io.stderr('No agent directories found. Create .claude/ (Claude Code) or .agents/ (Codex) first, then re-run.\n');
    return 1;
  }

  return 0;
}
