/**
 * Version string utilities for visual testing scripts.
 * Handles version normalization for both npm versions and local file paths.
 */

import path from 'node:path';

const TAR_GZ_SUFFIX = '.tar.gz';
const TGZ_SUFFIX = '.tgz';

/**
 * Check if a version string appears to be a file path rather than an npm version.
 *
 * @param value - Version string to check
 * @returns True if the value looks like a file path (starts with file:, ~, ., or contains path separators)
 */
export function isPathLikeVersion(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('file:')) return true;
  if (trimmed.startsWith('~') || trimmed.startsWith('.')) return true;
  if (path.isAbsolute(trimmed)) return true;
  return trimmed.includes('/') || trimmed.includes('\\');
}

/**
 * Extract a version label from a file path.
 * Strips the file: prefix, trailing slashes, and tarball extensions.
 *
 * @param value - File path to extract label from
 * @returns The base name of the path without tarball extensions, or 'local-superdoc' if empty
 */
export function versionLabelFromPath(value: string): string {
  let raw = value.trim();
  if (raw.startsWith('file:')) {
    raw = raw.slice('file:'.length);
  }
  raw = raw.replace(/[\\/]+$/, '');
  let base = path.basename(raw);
  const lower = base.toLowerCase();
  if (lower.endsWith(TAR_GZ_SUFFIX)) {
    base = base.slice(0, -TAR_GZ_SUFFIX.length);
  } else if (lower.endsWith(TGZ_SUFFIX)) {
    base = base.slice(0, -TGZ_SUFFIX.length);
  }
  return base || 'local-superdoc';
}

/**
 * Normalize a version string to a display label.
 * - Path-like versions: extracts base name from path
 * - npm versions: ensures 'v.' prefix (e.g., '1.4.0' → 'v.1.4.0')
 *
 * @param version - Version string to normalize
 * @returns Normalized version label suitable for folder names
 */
export function normalizeVersionLabel(version: string): string {
  const trimmed = version.trim();
  if (isPathLikeVersion(trimmed)) {
    return versionLabelFromPath(trimmed);
  }
  return trimmed.startsWith('v.') ? trimmed : `v.${trimmed}`;
}

/**
 * Normalize a version string to a package specifier.
 * - Path-like versions: returned as-is
 * - npm versions: strips 'v.' prefix if present (e.g., 'v.1.4.0' → '1.4.0')
 *
 * @param version - Version string to normalize
 * @returns Version specifier suitable for npm install
 */
export function normalizeVersionSpecifier(version: string): string {
  const trimmed = version.trim();
  if (isPathLikeVersion(trimmed)) {
    return trimmed;
  }
  return trimmed.startsWith('v.') ? trimmed.slice(2) : trimmed;
}

/**
 * Parse a version input string into both label and specifier forms.
 *
 * @param version - Version string to parse
 * @returns Object with `label` (display name) and `spec` (package specifier)
 */
export function parseVersionInput(version: string): { label: string; spec: string } {
  return {
    label: normalizeVersionLabel(version),
    spec: normalizeVersionSpecifier(version),
  };
}
