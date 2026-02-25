import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SuperDocCliError } from './runtime/errors.js';

// Resolve skills directory relative to package root (works from both src/ and dist/)
const skillsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');
const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SUPPORTED_SKILL_RUNTIMES = ['claude'] as const;
const SUPPORTED_INSTALL_SCOPES = ['project', 'user'] as const;

type SkillRuntime = (typeof SUPPORTED_SKILL_RUNTIMES)[number];
type SkillInstallScope = (typeof SUPPORTED_INSTALL_SCOPES)[number];

export interface InstallSkillOptions {
  runtime?: SkillRuntime;
  scope?: SkillInstallScope;
  targetDir?: string;
  cwd?: string;
  homeDir?: string;
  overwrite?: boolean;
}

export interface InstalledSkillResult {
  name: string;
  runtime: SkillRuntime;
  scope: SkillInstallScope | 'custom';
  path: string;
  written: boolean;
  overwritten: boolean;
}

function resolveSkillFilePath(skillName: string): string {
  const filePath = path.resolve(skillsDir, `${skillName}.md`);
  const root = `${skillsDir}${path.sep}`;
  if (!filePath.startsWith(root)) {
    throw new SuperDocCliError('Skill name resolved outside SDK skill directory.', {
      code: 'INVALID_ARGUMENT',
      details: { skillName },
    });
  }
  return filePath;
}

function normalizeSkillName(name: string): string {
  const normalized = name.trim();
  if (!normalized || !SKILL_NAME_RE.test(normalized)) {
    throw new SuperDocCliError('Skill name is required.', {
      code: 'INVALID_ARGUMENT',
      details: { name },
    });
  }
  return normalized;
}

export function listSkills(): string[] {
  try {
    return readdirSync(skillsDir)
      .filter((entry) => path.extname(entry) === '.md')
      .map((entry) => path.basename(entry, '.md'))
      .sort();
  } catch (error) {
    throw new SuperDocCliError('Unable to enumerate SDK skills.', {
      code: 'SKILL_IO_ERROR',
      details: {
        skillsDir,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

export function getSkill(name: string): string {
  const normalized = normalizeSkillName(name);
  const filePath = resolveSkillFilePath(normalized);
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === 'ENOENT') {
      let available: string[] = [];
      try {
        available = listSkills();
      } catch {
        // Keep available empty
      }
      throw new SuperDocCliError('Requested SDK skill was not found.', {
        code: 'SKILL_NOT_FOUND',
        details: { name: normalized, available },
      });
    }

    throw new SuperDocCliError('Unable to read SDK skill file.', {
      code: 'SKILL_IO_ERROR',
      details: {
        name: normalized,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

export function installSkill(name: string, options: InstallSkillOptions = {}): InstalledSkillResult {
  const normalizedName = normalizeSkillName(name);
  const runtime = options.runtime ?? 'claude';
  if (!(SUPPORTED_SKILL_RUNTIMES as readonly string[]).includes(runtime)) {
    throw new SuperDocCliError('Unsupported skill runtime.', {
      code: 'INVALID_ARGUMENT',
      details: { runtime, supportedRuntimes: [...SUPPORTED_SKILL_RUNTIMES] },
    });
  }

  const scope = options.scope ?? 'project';
  if (!(SUPPORTED_INSTALL_SCOPES as readonly string[]).includes(scope)) {
    throw new SuperDocCliError('Unsupported skill install scope.', {
      code: 'INVALID_ARGUMENT',
      details: { scope, supportedScopes: [...SUPPORTED_INSTALL_SCOPES] },
    });
  }

  const skillsRoot =
    options.targetDir !== undefined
      ? path.resolve(options.targetDir)
      : scope === 'user'
        ? path.resolve(options.homeDir ?? os.homedir(), '.claude', 'skills')
        : path.resolve(options.cwd ?? process.cwd(), '.claude', 'skills');

  const skillFile = path.join(skillsRoot, normalizedName, 'SKILL.md');
  const overwrite = options.overwrite ?? true;
  const alreadyExists = existsSync(skillFile);

  if (!overwrite && alreadyExists) {
    return {
      name: normalizedName,
      runtime,
      scope: options.targetDir !== undefined ? 'custom' : scope,
      path: skillFile,
      written: false,
      overwritten: false,
    };
  }

  try {
    const content = getSkill(name);
    mkdirSync(path.dirname(skillFile), { recursive: true });
    writeFileSync(skillFile, content, 'utf8');
  } catch (error) {
    if (error instanceof SuperDocCliError) throw error;

    throw new SuperDocCliError('Unable to install SDK skill.', {
      code: 'SKILL_IO_ERROR',
      details: {
        name: normalizedName,
        runtime,
        scope: options.targetDir !== undefined ? 'custom' : scope,
        path: skillFile,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  return {
    name: normalizedName,
    runtime,
    scope: options.targetDir !== undefined ? 'custom' : scope,
    path: skillFile,
    written: true,
    overwritten: alreadyExists,
  };
}
