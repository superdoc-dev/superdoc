import type { Line, Run, TextRun } from '@superdoc/contracts';
import { toCssFontFamily } from '@superdoc/font-utils';

export const setTextContentWithFormattingSpaceMarks = (
  element: HTMLElement,
  text: string,
  doc: Document,
  showFormattingMarks: boolean,
): void => {
  if (!showFormattingMarks || !text.includes(' ')) {
    element.textContent = text;
    return;
  }

  element.textContent = '';
  let chunkStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== ' ') continue;

    if (index > chunkStart) {
      element.appendChild(doc.createTextNode(text.slice(chunkStart, index)));
    }

    const space = doc.createElement('span');
    space.classList.add('superdoc-formatting-space-mark');
    space.textContent = ' ';
    element.appendChild(space);
    chunkStart = index + 1;
  }

  if (chunkStart < text.length) {
    element.appendChild(doc.createTextNode(text.slice(chunkStart)));
  }
};

const findLastTextRun = (runs: Run[]): { run: TextRun; index: number } | null => {
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (run && (run.kind === 'text' || run.kind === undefined) && 'text' in run) {
      return { run: run as TextRun, index };
    }
  }
  return null;
};

export const appendFormattingParagraphMark = (
  lineEl: HTMLElement,
  line: Line,
  runs: Run[],
  leftOffsetPx: number,
  availableWidth: number,
  hasExplicitPositioning: boolean,
  doc: Document,
  showFormattingMarks: boolean,
): void => {
  if (!showFormattingMarks) return;
  const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
  if (lastRun) {
    const lastRunIndex = runs.length - 1;
    if (line.toRun < lastRunIndex) return;
    if (
      line.toRun === lastRunIndex &&
      (lastRun.kind === 'text' || lastRun.kind === undefined) &&
      'text' in lastRun &&
      line.toChar < lastRun.text.length
    ) {
      return;
    }
  }

  const lastTextRun = findLastTextRun(runs);

  const mark = doc.createElement('span');
  mark.classList.add('superdoc-formatting-paragraph-mark');
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = '¶';

  const run = lastTextRun?.run;
  if (run) {
    if (run.fontFamily) {
      mark.style.fontFamily = toCssFontFamily(run.fontFamily) ?? run.fontFamily;
    }
    if (typeof run.fontSize === 'number') {
      mark.style.fontSize = `${run.fontSize}px`;
    }
    if (run.bold) {
      mark.style.fontWeight = 'bold';
    }
    if (run.italic) {
      mark.style.fontStyle = 'italic';
    }
    if (run.letterSpacing != null) {
      mark.style.letterSpacing = `${run.letterSpacing}px`;
    }
  }
  mark.style.lineHeight = `${line.lineHeight}px`;

  const lineWidth = line.naturalWidth ?? line.width ?? 0;
  const alignmentSlack = Math.max(0, availableWidth - lineWidth);
  const textAlign = lineEl.style.textAlign;
  const alignmentOffset =
    !hasExplicitPositioning && textAlign === 'center'
      ? alignmentSlack / 2
      : !hasExplicitPositioning && textAlign === 'right'
        ? alignmentSlack
        : 0;
  const isRtl = lineEl.dir === 'rtl' || lineEl.style.direction === 'rtl';
  const visualTextEndOffset = isRtl ? alignmentOffset : alignmentOffset + lineWidth;
  mark.style.left = `${Math.max(0, leftOffsetPx + visualTextEndOffset)}px`;
  lineEl.appendChild(mark);
};
