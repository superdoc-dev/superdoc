/**
 * Output formatting registry — maps OutputFormat tags to pretty-printers.
 *
 * Each formatter receives the raw invoke() result and returns a human-readable
 * string (or null to fall back to the default SUCCESS_VERB-based output).
 */

import type { CliExposedOperationId } from '../cli/operation-set.js';
import { OUTPUT_FORMAT, type OutputFormat } from '../cli/operation-hints.js';
import { formatFindPretty } from './find-query.js';
import { buildNodePretty } from './node-pretty.js';
import { PRETTY_ROW_LIMIT, moreLine, padCol, safeNumber, toSingleLine, truncate } from './pretty-helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

// ---------------------------------------------------------------------------
// Per-format formatters
// ---------------------------------------------------------------------------

type FormatContext = { revision: number };

function formatCommentList(result: unknown, ctx: FormatContext): string {
  const record = asRecord(result);
  const total = safeNumber(record?.total, 0);
  const rows = asArray(record?.matches).map((entry) => {
    const comment = asRecord(entry) ?? {};
    const status = hasNonEmptyString(comment.status) ? comment.status : 'unknown';
    const commentId = hasNonEmptyString(comment.commentId) ? comment.commentId : '<unknown>';
    const creatorName = hasNonEmptyString(comment.creatorName) ? comment.creatorName : '';
    const creatorEmail = hasNonEmptyString(comment.creatorEmail) ? comment.creatorEmail : '';
    const author = creatorName || creatorEmail || 'unknown';
    const text = hasNonEmptyString(comment.text) ? comment.text : '';
    return { status, commentId, author, text };
  });

  const lines: string[] = [`Revision ${ctx.revision}: ${total} comments`];
  if (rows.length === 0) return lines[0];

  lines.push('');
  const shownRows = rows.slice(0, PRETTY_ROW_LIMIT);
  const maxStatus = Math.max(1, ...shownRows.map((row) => `[${row.status}]`.length));
  const maxId = Math.max(8, ...shownRows.map((row) => row.commentId.length));

  for (const row of shownRows) {
    const status = padCol(`[${row.status}]`, maxStatus);
    const id = padCol(row.commentId, maxId);
    const author = padCol(row.author, 20);
    const text = truncate(toSingleLine(row.text), 50);
    lines.push(`${status}  ${id}  ${author}  "${text}"`);
  }

  const remaining = moreLine(shownRows.length, Math.max(total, rows.length));
  if (remaining) lines.push(remaining);
  return lines.join('\n');
}

function formatListResult(result: unknown, ctx: FormatContext): string {
  const record = asRecord(result);
  const total = safeNumber(record?.total, 0);
  const items = asArray(record?.items)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  const lines: string[] = [`Revision ${ctx.revision}: ${total} list items`];
  if (items.length === 0) return lines[0];

  lines.push('');
  const shown = items.slice(0, PRETTY_ROW_LIMIT);
  const maxMarkerLength = Math.max(
    1,
    ...shown.map((item) => {
      const marker = hasNonEmptyString(item.marker) ? item.marker : '';
      return toSingleLine(marker).length;
    }),
  );

  for (const item of shown) {
    const markerRaw = toSingleLine(hasNonEmptyString(item.marker) ? item.marker : '');
    const marker = (markerRaw.length > 0 ? markerRaw : '-').padEnd(maxMarkerLength);
    const level =
      typeof item.level === 'number' && Number.isFinite(item.level) ? Math.max(0, Math.floor(item.level)) : 0;
    const text = truncate(toSingleLine(hasNonEmptyString(item.text) ? item.text : ''), 60);
    const indent = '  '.repeat(level);
    lines.push(text.length > 0 ? `${indent}${marker}  ${text}` : `${indent}${marker}`);
  }

  const remaining = moreLine(shown.length, Math.max(total, items.length));
  if (remaining) lines.push(remaining);
  return lines.join('\n');
}

function formatTrackChangeList(result: unknown, ctx: FormatContext): string {
  const record = asRecord(result);
  const total = safeNumber(record?.total, 0);
  const changes = asArray(record?.changes);

  const rows =
    changes.length > 0
      ? changes.map((entry) => {
          const change = asRecord(entry) ?? {};
          const address = asRecord(change.address);
          const type = hasNonEmptyString(change.type) ? change.type : 'change';
          const id = hasNonEmptyString(change.id)
            ? change.id
            : hasNonEmptyString(address?.entityId)
              ? String(address?.entityId)
              : '<unknown>';
          const authorName = hasNonEmptyString(change.author) ? change.author : '';
          const authorEmail = hasNonEmptyString(change.authorEmail) ? change.authorEmail : '';
          const excerpt = hasNonEmptyString(change.excerpt) ? change.excerpt : '';
          return {
            type,
            id,
            author: authorName || authorEmail || 'unknown',
            excerpt,
          };
        })
      : asArray(record?.matches).map((entry) => {
          const match = asRecord(entry) ?? {};
          const id = hasNonEmptyString(match.entityId) ? match.entityId : '<unknown>';
          return {
            type: 'change',
            id,
            author: 'unknown',
            excerpt: '',
          };
        });

  const lines: string[] = [`Revision ${ctx.revision}: ${total} tracked changes`];
  if (rows.length === 0) return lines[0];

  lines.push('');
  const shownRows = rows.slice(0, PRETTY_ROW_LIMIT);
  const maxType = Math.max(1, ...shownRows.map((row) => `[${row.type}]`.length));
  const maxId = Math.max(8, ...shownRows.map((row) => row.id.length));

  for (const row of shownRows) {
    const type = padCol(`[${row.type}]`, maxType);
    const id = padCol(row.id, maxId);
    const author = padCol(row.author, 20);
    const excerpt = truncate(toSingleLine(row.excerpt), 50);
    lines.push(`${type}  ${id}  ${author}  "${excerpt}"`);
  }

  const remaining = moreLine(shownRows.length, Math.max(total, rows.length));
  if (remaining) lines.push(remaining);
  return lines.join('\n');
}

function formatDocumentInfo(result: unknown, ctx: FormatContext): string {
  const record = asRecord(result);
  if (!record) return `Revision ${ctx.revision}: retrieved info`;

  const counts = asRecord(record.counts) ?? {};
  const outline = asArray(record.outline)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  const words = safeNumber(counts.words, 0);
  const paragraphs = safeNumber(counts.paragraphs, 0);
  const headings = safeNumber(counts.headings, 0);
  const tables = safeNumber(counts.tables, 0);
  const images = safeNumber(counts.images, 0);
  const comments = safeNumber(counts.comments, 0);

  const lines: string[] = [
    `Revision ${ctx.revision}: ${words} words, ${paragraphs} paragraphs, ${headings} headings, ${tables} tables, ${images} images, ${comments} comments`,
  ];

  if (outline.length === 0) return lines[0];

  lines.push('');
  lines.push('Outline:');
  const shownOutline = outline.slice(0, PRETTY_ROW_LIMIT);
  for (const entry of shownOutline) {
    const level = Math.max(1, Math.floor(safeNumber(entry.level, 1)));
    const indent = '  '.repeat(level - 1);
    const text = truncate(toSingleLine(hasNonEmptyString(entry.text) ? entry.text : ''), 60) || '(untitled)';
    lines.push(`  ${indent}${text}`);
  }

  const remaining = moreLine(shownOutline.length, outline.length);
  if (remaining) lines.push(`  ${remaining}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

type Formatter = (result: unknown, ctx: FormatContext) => string | null;

const FORMAT_DISPATCH: Partial<Record<OutputFormat, Formatter>> = {
  queryResult: (result, ctx) => formatFindPretty(result as Parameters<typeof formatFindPretty>[0], ctx.revision),
  nodeInfo: (result, ctx) => buildNodePretty(ctx.revision, 'resolved node', result),
  commentList: (result, ctx) => formatCommentList(result, ctx),
  listResult: (result, ctx) => formatListResult(result, ctx),
  trackChangeList: (result, ctx) => formatTrackChangeList(result, ctx),
  documentInfo: (result, ctx) => formatDocumentInfo(result, ctx),
};

/**
 * Formats the invoke() result for pretty output.
 *
 * Returns a formatted string for operations with custom formatters, or null
 * to fall back to the default `Revision N: <verb>` output.
 */
export function formatOutput(operationId: CliExposedOperationId, result: unknown, ctx: FormatContext): string | null {
  const format = OUTPUT_FORMAT[operationId];
  const formatter = FORMAT_DISPATCH[format];
  if (!formatter) return null;
  return formatter(result, ctx);
}
