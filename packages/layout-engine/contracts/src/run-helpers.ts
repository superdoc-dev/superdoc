/**
 * Pure transformations on inline-run shapes.
 *
 * These helpers operate on `Run[]` shapes defined in this contracts package.
 * They have no upstream dependencies (no pm-adapter, no layout-bridge, no
 * style-engine), so any stage can consume them without creating a reverse
 * dependency back into a downstream package.
 */

import type { FlowBlock, Line, ParagraphIndent, Run, TabRun, TabStop, TextRun } from './index.js';

/**
 * Expands text runs that contain inline newlines into multiple runs.
 *
 * @param {Run[]} runs - The runs to expand
 * @returns {Run[]} The expanded runs
 */
export function expandRunsForInlineNewlines(runs: Run[]): Run[] {
  const result: Run[] = [];
  for (const run of runs) {
    const textRun = run as TextRun;
    if ('text' in run && typeof textRun.text === 'string' && textRun.text.includes('\n')) {
      const segments = textRun.text.split('\n');
      let cursor = textRun.pmStart ?? 0;
      segments.forEach((segment, idx) => {
        if (segment.length > 0) {
          result.push({ ...textRun, text: segment, pmStart: cursor, pmEnd: cursor + segment.length });
          cursor += segment.length;
        }
        if (idx !== segments.length - 1) {
          result.push({
            kind: 'break',
            breakType: 'line',
            pmStart: cursor,
            pmEnd: cursor + 1,
            sdt: textRun.sdt,
            trackedChange: textRun.trackedChange,
          });
          cursor += 1;
        }
      });
    } else {
      result.push(run);
    }
  }
  return result;
}

/**
 * SD-3266: expands TEXT runs that contain literal U+0009 into a sequence of
 * `[text, tab(fromLiteralTab=true), text, ...]` runs. ECMA-376 represents tab
 * stops with `<w:tab/>`; literal `\t` inside `<w:t>` / `<w:delText>` is
 * non-canonical, but Word documents in the wild — notably Orbital Copilot's
 * `<w:del>[\t]</w:del>` placeholders — emit it anyway. The CSS `white-space:
 * pre` containers we paint would otherwise expand the literal tab to the next
 * CSS tab stop, blowing the line apart at render time.
 *
 * Critically, this helper must be applied IDENTICALLY by the measurer and the
 * painter. The measurer's `Line.fromRun/toRun` indices refer to the array this
 * helper produces; if the painter doesn't expand the same way it ends up
 * indexing an unexpanded run array and silently drops content (SD-3266 root
 * cause).
 *
 * The PM doc is not modified — this transformation is local to the layout
 * pipeline. On export, the original text run with literal `\t` flows through
 * the converter unchanged, preserving round-trip fidelity.
 *
 * @param runs - Runs to expand
 * @param tabStops - Paragraph tab stops to attach to created TabRuns
 * @param indent - Paragraph indent to attach to created TabRuns
 * @returns Expanded run array
 */
export function expandRunsForInlineTabs(runs: Run[], tabStops?: TabStop[], indent?: ParagraphIndent): Run[] {
  const hasLiteralTab = runs.some(
    (r) =>
      (r.kind === undefined || r.kind === 'text') &&
      typeof (r as TextRun).text === 'string' &&
      (r as TextRun).text.includes('\t'),
  );
  if (!hasLiteralTab) return runs;

  const result: Run[] = [];
  for (const run of runs) {
    const isTextLike = run.kind === undefined || run.kind === 'text';
    if (!isTextLike || typeof (run as TextRun).text !== 'string' || !(run as TextRun).text.includes('\t')) {
      result.push(run);
      continue;
    }
    const textRun = run as TextRun;
    const text = textRun.text;
    let buffer = '';
    let cursor = textRun.pmStart ?? 0;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '\t') {
        if (buffer.length > 0) {
          result.push({
            ...textRun,
            text: buffer,
            pmStart: cursor - buffer.length,
            pmEnd: cursor,
          });
          buffer = '';
        }
        // SD-3266: Compact ("fromLiteralTab") rendering applies only when the
        // originating run carries a tracked-change mark. TOC-style runs that
        // use literal "\t" as a real tab stop (e.g. "Chapter 1\t42") still
        // expect tab-stop advance + leader behavior; only revision-marked
        // placeholders like `<w:del>[\t]</w:del>` should collapse to a glyph.
        const isInRevision = textRun.trackedChange != null;
        // SD-3266: carry typography (fontFamily, fontSize, bold/italic, color,
        // underline, strike, ...) from the source text run onto the synthesized
        // tab so that:
        //   - the measurer's canvas-based glyph-width measurement uses the right
        //     font (otherwise it falls back to 0/defaults and the arrow is sized
        //     to nothing),
        //   - the painter's tab span inherits visible typography (the layout
        //     line container uses font-size: 0 for whitespace control, so each
        //     child must declare its own font).
        // We pick the typography subset explicitly to avoid clobbering TabRun's
        // own `kind`/`text`/`pmStart`/`pmEnd`/`tabStops`/`indent` fields.
        const {
          fontFamily,
          fontSize,
          bold,
          italic,
          color,
          underline,
          strike,
          highlight,
          letterSpacing,
          vertAlign,
          baselineShift,
        } = textRun as Partial<TextRun>;
        const tabRun: TabRun = {
          kind: 'tab',
          text: '\t',
          pmStart: cursor,
          pmEnd: cursor + 1,
          tabStops,
          indent,
          leader: null,
          sdt: textRun.sdt,
          ...(fontFamily != null ? { fontFamily } : {}),
          ...(fontSize != null ? { fontSize } : {}),
          ...(bold != null ? { bold } : {}),
          ...(italic != null ? { italic } : {}),
          ...(color != null ? { color } : {}),
          ...(underline != null ? { underline } : {}),
          ...(strike != null ? { strike } : {}),
          ...(highlight != null ? { highlight } : {}),
          ...(letterSpacing != null ? { letterSpacing } : {}),
          ...(vertAlign != null ? { vertAlign } : {}),
          ...(baselineShift != null ? { baselineShift } : {}),
          ...(isInRevision
            ? {
                fromLiteralTab: true,
                // Propagate tracked-change metadata so the painter can paint
                // the strikethrough/underline across the synthesized glyph.
                trackedChange: textRun.trackedChange,
              }
            : {}),
        };
        result.push(tabRun);
        cursor += 1;
        continue;
      }
      buffer += ch;
      cursor += 1;
    }
    if (buffer.length > 0) {
      result.push({
        ...textRun,
        text: buffer,
        pmStart: cursor - buffer.length,
        pmEnd: cursor,
      });
    }
  }
  return result;
}

/**
 * Extracts the subset of runs that appear in a specific line.
 * Handles partial runs that span multiple lines.
 *
 * @param block - The paragraph block containing the runs
 * @param line - The line to extract runs for
 * @returns Array of runs present in the line
 */
export function sliceRunsForLine(block: FlowBlock, line: Line): Run[] {
  const result: Run[] = [];
  if (block.kind !== 'paragraph') return result;

  for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex += 1) {
    const run = block.runs[runIndex];
    if (!run) continue;

    if (run.kind === 'tab') {
      result.push(run);
      continue;
    }

    // Images, line breaks, breaks, field annotations, and math runs are atomic
    // units. They occupy a single character of the run sequence and are passed
    // through to the result without slicing.
    if (
      'src' in run ||
      run.kind === 'lineBreak' ||
      run.kind === 'break' ||
      run.kind === 'fieldAnnotation' ||
      run.kind === 'math'
    ) {
      result.push(run);
      continue;
    }

    const text = run.text ?? '';
    const isFirstRun = runIndex === line.fromRun;
    const isLastRun = runIndex === line.toRun;

    if (isFirstRun || isLastRun) {
      const start = isFirstRun ? line.fromChar : 0;
      const end = isLastRun ? line.toChar : text.length;
      const slice = text.slice(start, end);
      if (!slice) continue;
      const pmStart =
        run.pmStart != null ? run.pmStart + start : run.pmEnd != null ? run.pmEnd - (text.length - start) : undefined;
      const pmEnd =
        run.pmStart != null ? run.pmStart + end : run.pmEnd != null ? run.pmEnd - (text.length - end) : undefined;
      result.push({
        ...run,
        text: slice,
        pmStart,
        pmEnd,
      });
    } else {
      result.push(run);
    }
  }

  return result;
}
