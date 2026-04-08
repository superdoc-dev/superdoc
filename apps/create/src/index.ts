#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, symlinkSync, unlinkSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { detectFramework, generateAgentsMd, FRAMEWORK_LABELS, FRAMEWORK_INSTALL } from './templates';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveSkillSource(): string | null {
  // In dist: __dirname is dist/, skill/ is at dist/../skill/
  const fromDist = join(__dirname, '..', 'skill');
  if (existsSync(fromDist)) return fromDist;

  // In dev: __dirname is src/, skill/ is at src/../skill/
  const fromSrc = join(__dirname, '..', 'skill');
  if (existsSync(fromSrc)) return fromSrc;

  return null;
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function select(question: string, options: string[]): Promise<number> {
  console.log(`\n${question}`);
  options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
  const answer = await prompt('Choose', '1');
  const idx = parseInt(answer, 10) - 1;
  return idx >= 0 && idx < options.length ? idx : 0;
}

async function main() {
  const cwd = process.cwd();
  const force = process.argv.includes('--force');
  const nonInteractive = process.argv.includes('--yes') || process.argv.includes('-y');

  console.log('\n  SuperDoc project setup\n');

  // 1. Detect framework
  const fw = detectFramework(cwd);
  console.log(`  Framework: ${FRAMEWORK_LABELS[fw]}`);

  // 2. Choose agent tool
  let setupMcp = false;
  let agentTool = 'claude-code';

  if (!nonInteractive) {
    const agentIdx = await select('Which agent tool do you use?', ['Claude Code', 'Cursor', 'Windsurf', 'None / Skip']);
    agentTool = ['claude-code', 'cursor', 'windsurf', 'none'][agentIdx];
    setupMcp = agentTool !== 'none';
  }

  console.log('');

  // 3. Write AGENTS.md
  const agentsPath = join(cwd, 'AGENTS.md');
  const claudePath = join(cwd, 'CLAUDE.md');

  if (existsSync(agentsPath) && !force) {
    console.log('  AGENTS.md already exists (use --force to overwrite)');
  } else {
    writeFileSync(agentsPath, generateAgentsMd(fw), 'utf-8');
    console.log('  Created AGENTS.md');
  }

  // 4. Create CLAUDE.md symlink
  if (existsSync(claudePath)) {
    if (force) {
      unlinkSync(claudePath);
      symlinkSync('AGENTS.md', claudePath);
      console.log('  Created CLAUDE.md → AGENTS.md (overwritten)');
    } else {
      console.log('  CLAUDE.md already exists (use --force to overwrite)');
    }
  } else {
    symlinkSync('AGENTS.md', claudePath);
    console.log('  Created CLAUDE.md → AGENTS.md');
  }

  // 5. Install skills
  const agentDirs = ['.claude', '.agents'];
  const skillSource = resolveSkillSource();

  for (const dir of agentDirs) {
    const agentDir = join(cwd, dir);
    if (!existsSync(agentDir)) continue;

    if (skillSource) {
      const skillDir = join(agentDir, 'skills', 'superdoc');
      mkdirSync(skillDir, { recursive: true });
      cpSync(skillSource, skillDir, { recursive: true });
      console.log(`  Installed skill to ${dir}/skills/superdoc/`);
    }
  }

  // 6. MCP setup instructions
  if (setupMcp) {
    console.log('');
    if (agentTool === 'claude-code') {
      console.log('  Run this to connect your agent to DOCX files:');
      console.log('');
      console.log('    claude mcp add superdoc -- npx @superdoc-dev/mcp');
    } else if (agentTool === 'cursor') {
      console.log('  Add to ~/.cursor/mcp.json:');
      console.log('');
      console.log('    { "mcpServers": { "superdoc": { "command": "npx", "args": ["@superdoc-dev/mcp"] } } }');
    } else if (agentTool === 'windsurf') {
      console.log('  Add to ~/.codeium/windsurf/mcp_config.json:');
      console.log('');
      console.log('    { "mcpServers": { "superdoc": { "command": "npx", "args": ["@superdoc-dev/mcp"] } } }');
    }
  }

  // 7. Next steps
  console.log('');
  console.log('  Next steps:');
  console.log(`    ${FRAMEWORK_INSTALL[fw]}`);
  console.log('    https://docs.superdoc.dev/getting-started/quickstart');
  console.log('');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
