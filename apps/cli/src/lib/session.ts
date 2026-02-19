import { randomBytes } from 'node:crypto';
import { basename, extname } from 'node:path';
import { CliError } from './errors';

const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_SESSION_ID_LENGTH = 64;
const GENERATED_SUFFIX_LENGTH = 6;

function normalizeSessionBase(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');

  return normalized || 'session';
}

function deriveBaseFromDoc(docArg: string): string {
  if (docArg === '-') return 'stdin';

  const fileName = basename(docArg);
  const extension = extname(fileName);
  const stem = extension.length > 0 ? fileName.slice(0, -extension.length) : fileName;
  return normalizeSessionBase(stem || fileName || 'session');
}

export function validateSessionId(value: string, source = '--session'): string {
  if (!SESSION_ID_PATTERN.test(value)) {
    throw new CliError(
      'SESSION_ID_INVALID',
      `${source} must be 1-64 characters using only letters, numbers, dot, underscore, or dash.`,
      {
        value,
      },
    );
  }

  return value;
}

export function generateSessionId(docArg: string): string {
  const base = deriveBaseFromDoc(docArg);
  const suffix = randomBytes(4).toString('hex').slice(0, GENERATED_SUFFIX_LENGTH);

  const maxBaseLength = MAX_SESSION_ID_LENGTH - suffix.length - 1;
  const trimmedBase = base.slice(0, maxBaseLength).replace(/[._-]+$/g, '') || 'session';
  return `${trimmedBase}-${suffix}`;
}
