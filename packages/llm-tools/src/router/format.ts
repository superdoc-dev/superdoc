import type { Executor } from '../types.js';
import { parseTarget, trackedOptions, resolveTextTarget } from './utils.js';

const INLINE_KEYS = ['bold', 'italic', 'underline', 'strikethrough', 'font', 'size', 'color', 'highlight'] as const;

function toRunProperties(params: Record<string, unknown>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (params.bold != null) props.bold = Boolean(params.bold);
  if (params.italic != null) props.italic = Boolean(params.italic);
  if (params.underline != null) props.underline = Boolean(params.underline);
  if (params.strikethrough != null) props.strikethrough = Boolean(params.strikethrough);
  if (params.font != null) props.fontFamily = params.font;
  if (params.size != null) props.fontSize = params.size;
  if (params.color != null) props.color = params.color;
  if (params.highlight != null) props.highlight = params.highlight;
  return props;
}

export async function routeFormat(params: Record<string, unknown>, execute: Executor) {
  const rawTarget = parseTarget(params);
  const target = await resolveTextTarget(rawTarget, execute);
  const options = trackedOptions(params);
  const results: unknown[] = [];

  // Inline formatting
  const hasInline = INLINE_KEYS.some((k) => params[k] != null);
  if (hasInline) {
    const patch = toRunProperties(params);
    results.push(await execute('format.apply', { target, inline: patch }, options));
  }

  // Paragraph alignment
  if (params.alignment != null) {
    results.push(await execute('format.paragraph.setAlignment', { target, alignment: params.alignment }, options));
  }

  // Paragraph spacing
  if (params.line_spacing != null || params.space_before != null || params.space_after != null) {
    const input: Record<string, unknown> = { target };
    if (params.line_spacing != null) input.line = params.line_spacing;
    if (params.space_before != null) input.before = params.space_before;
    if (params.space_after != null) input.after = params.space_after;
    results.push(await execute('format.paragraph.setSpacing', input, options));
  }

  // Paragraph indentation
  if (params.indent_left != null || params.indent_right != null) {
    const input: Record<string, unknown> = { target };
    if (params.indent_left != null) input.left = params.indent_left;
    if (params.indent_right != null) input.right = params.indent_right;
    results.push(await execute('format.paragraph.setIndentation', input, options));
  }

  // Named style
  if (params.style != null) {
    results.push(await execute('styles.paragraph.setStyle', { target, styleId: params.style }, options));
  }

  return results.length === 1 ? results[0] : results;
}
