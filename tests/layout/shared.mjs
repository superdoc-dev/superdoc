/**
 * Shared utilities for layout snapshot scripts.
 */

export function normalizeVersionLabel(version) {
  const trimmed = String(version ?? '').trim();
  if (!trimmed) return 'v.unknown';
  return trimmed.startsWith('v.') ? trimmed : `v.${trimmed}`;
}
