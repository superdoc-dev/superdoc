/**
 * Link/Hyperlink Utilities Module
 *
 * Functions for building and migrating FlowRunLink objects from ProseMirror mark attributes.
 */

import { sanitizeHref } from '@superdoc/url-validation';
import type { FlowRunLinkMetadata } from '../types.js';

type FlowRunLink = FlowRunLinkMetadata;

/**
 * Valid HTML link target values as per HTML spec.
 */
export const VALID_LINK_TARGETS = new Set(['_blank', '_self', '_parent', '_top']);

/**
 * Convert unknown value to trimmed string, or undefined if empty/invalid.
 */
export const toTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Convert unknown value to optional boolean.
 * Supports string values like 'true', 'false', '1', '0', 'yes', 'no', 'on', 'off'.
 */
export const toOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  }
  return undefined;
};

/**
 * Migrates legacy v1 link format { href?, title? } to v2 schema.
 * If link already has version: 2, returns as-is.
 * Otherwise, creates v2 link with defaults for new fields.
 *
 * @param link - Link object to migrate
 * @returns Migrated v2 link
 */
export const migrateLegacyLink = (link: FlowRunLink): FlowRunLink => {
  // Already v2, return as-is
  if (link.version === 2) {
    return link;
  }

  // Migrate v1 to v2
  return {
    version: 2,
    href: link.href,
    title: link.title,
    // All other fields are optional and default to undefined
  };
};

/**
 * Build FlowRunLink from ProseMirror mark attributes.
 * Sanitizes href and normalizes all link properties according to v2 schema.
 *
 * @param attrs - Mark attributes containing link properties
 * @returns FlowRunLink object, or null if no valid link properties found
 */
export const buildFlowRunLink = (attrs: Record<string, unknown>): FlowRunLink | null => {
  const sanitizedHref = typeof attrs.href === 'string' && attrs.href.trim() ? sanitizeHref(attrs.href) : null;
  const anchor = toTrimmedString(attrs.anchor);
  const legacyName = toTrimmedString(attrs.name);
  const docLocation = toTrimmedString(attrs.docLocation);
  const rId = toTrimmedString(attrs.rId);

  if (!sanitizedHref && !anchor && !legacyName && !docLocation && !rId) {
    return null;
  }

  const link: FlowRunLink = { version: 2 };
  if (sanitizedHref) {
    link.href = sanitizedHref.href;
  }
  const title = toTrimmedString(attrs.title);
  if (title) {
    link.title = title;
  }
  const tooltip = toTrimmedString((attrs as Record<string, unknown>).tooltip);
  if (tooltip) {
    link.tooltip = tooltip;
  }
  const target = toTrimmedString(attrs.target);
  if (target && VALID_LINK_TARGETS.has(target)) {
    link.target = target as FlowRunLink['target'];
  }
  const rel = toTrimmedString(attrs.rel);
  if (rel) {
    link.rel = rel;
  }
  if (anchor) {
    link.anchor = anchor;
  }
  if (legacyName) {
    link.name = legacyName;
  }
  if (docLocation) {
    link.docLocation = docLocation;
  }
  if (rId) {
    link.rId = rId;
  }
  const history = toOptionalBoolean(attrs.history);
  if (history != null) {
    link.history = history;
  }
  return link;
};
