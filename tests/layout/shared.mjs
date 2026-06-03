/**
 * Shared utilities for layout snapshot scripts.
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ANSI_CODES = {
  reset: 0,
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  gray: 90,
};

export function normalizeVersionLabel(version) {
  const trimmed = String(version ?? '').trim();
  if (!trimmed) return 'v.unknown';
  return trimmed.startsWith('v.') ? trimmed : `v.${trimmed}`;
}

export function pathToPosix(value) {
  return String(value ?? '')
    .split(path.sep)
    .join('/');
}

export function toRelativePathIfInsideRoot(value, rootPath) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (typeof rootPath !== 'string' || rootPath.length === 0) return null;

  const resolvedValue = path.resolve(value);
  const resolvedRootPath = path.resolve(rootPath);
  const relativePath = path.relative(resolvedRootPath, resolvedValue);

  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  return pathToPosix(relativePath);
}

export function toDisplayPath(value, { repoRoot } = {}) {
  if (typeof value !== 'string' || value.length === 0) return '';

  if (value.startsWith('file:')) {
    return toDisplayPath(fileURLToPath(value), { repoRoot });
  }

  const relativePath = typeof repoRoot === 'string' ? toRelativePathIfInsideRoot(value, repoRoot) : null;
  if (relativePath) {
    return relativePath;
  }

  return pathToPosix(path.resolve(value));
}

export function shouldUseTerminalColors(stream = process.stdout) {
  if (typeof process.env.NO_COLOR === 'string') {
    return false;
  }

  const forcedColor = process.env.FORCE_COLOR;
  if (typeof forcedColor === 'string') {
    return forcedColor !== '0';
  }

  return Boolean(stream?.isTTY);
}

function applyAnsi(text, codes, enabled) {
  if (!enabled || codes.length === 0) return text;
  return `\u001B[${codes.join(';')}m${text}\u001B[${ANSI_CODES.reset}m`;
}

export function createTerminalPalette({ stream = process.stdout } = {}) {
  const enabled = shouldUseTerminalColors(stream);
  const style = (text, ...codes) => applyAnsi(String(text), codes, enabled);

  return {
    enabled,
    label(text) {
      return style(text, ANSI_CODES.bold, ANSI_CODES.cyan);
    },
    dim(text) {
      return style(text, ANSI_CODES.dim);
    },
    path(text) {
      return style(text, ANSI_CODES.dim, ANSI_CODES.cyan);
    },
    version(text) {
      return style(text, ANSI_CODES.bold, ANSI_CODES.magenta);
    },
    success(text) {
      return style(text, ANSI_CODES.bold, ANSI_CODES.green);
    },
    warning(text) {
      return style(text, ANSI_CODES.bold, ANSI_CODES.yellow);
    },
    error(text) {
      return style(text, ANSI_CODES.bold, ANSI_CODES.red);
    },
    info(text) {
      return style(text, ANSI_CODES.bold, ANSI_CODES.blue);
    },
    subtle(text) {
      return style(text, ANSI_CODES.gray);
    },
  };
}

export function formatTerminalLabelLine(label, value, { palette, width = 10 } = {}) {
  const resolvedPalette = palette ?? createTerminalPalette();
  return `${resolvedPalette.label(String(label).padEnd(width))}${value}`;
}

export function colorizeTerminalStatus(status, { palette } = {}) {
  const resolvedPalette = palette ?? createTerminalPalette();

  switch (String(status ?? '').toLowerCase()) {
    case 'clean':
    case 'success':
    case 'ok':
      return resolvedPalette.success(status);
    case 'changed':
    case 'warning':
    case 'warn':
      return resolvedPalette.warning(status);
    case 'failed':
    case 'error':
    case 'fail':
      return resolvedPalette.error(status);
    case 'running':
      return resolvedPalette.info(status);
    default:
      return String(status ?? '');
  }
}
