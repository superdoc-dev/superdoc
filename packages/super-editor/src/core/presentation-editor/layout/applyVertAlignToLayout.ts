import type { Node as ProseMirrorNode, Mark } from 'prosemirror-model';
import { decodeRPrFromMarks } from '../../super-converter/styles.js';
import { halfPointToPoints } from '../../super-converter/helpers.js';

const SUBSCRIPT_SUPERSCRIPT_SCALE = 0.583;

/**
 * Post-processes painted DOM to apply vertical alignment and font scaling
 * for subscript/superscript rendering.
 *
 * Scans all text spans with PM position markers, resolves the containing
 * run node, and applies CSS vertical-align and font-size based on the
 * run's vertAlign/position properties or text style marks.
 */
export function applyVertAlignToLayout(doc: ProseMirrorNode, painterHost: HTMLElement): void {
  try {
    const spans = painterHost.querySelectorAll('.superdoc-line span[data-pm-start]') as NodeListOf<HTMLElement>;
    spans.forEach((span) => {
      try {
        if (span.closest('.superdoc-page-header, .superdoc-page-footer')) return;

        const pmStart = Number(span.dataset.pmStart ?? 'NaN');
        if (!Number.isFinite(pmStart)) return;

        const pos = Math.max(0, Math.min(pmStart, doc.content.size));
        const $pos = doc.resolve(pos);

        let runNode: ProseMirrorNode | null = null;
        for (let depth = $pos.depth; depth >= 0; depth--) {
          const node = $pos.node(depth);
          if (node.type.name === 'run') {
            runNode = node;
            break;
          }
        }

        let vertAlign: string | null = runNode?.attrs?.runProperties?.vertAlign ?? null;
        let position: number | null = runNode?.attrs?.runProperties?.position ?? null;
        let fontSizeHalfPts: number | null = runNode?.attrs?.runProperties?.fontSize ?? null;

        if (!vertAlign && position == null && runNode) {
          runNode.forEach((child: ProseMirrorNode) => {
            if (!child.isText || !child.marks?.length) return;
            const rpr = decodeRPrFromMarks(child.marks as Mark[]) as {
              vertAlign?: string;
              position?: number;
              fontSize?: number;
            };
            if (rpr.vertAlign && !vertAlign) vertAlign = rpr.vertAlign;
            if (rpr.position != null && position == null) position = rpr.position;
            if (rpr.fontSize != null && fontSizeHalfPts == null) fontSizeHalfPts = rpr.fontSize;
          });
        }

        if (vertAlign == null && position == null) return;

        const styleEntries: string[] = [];
        if (position != null && Number.isFinite(position)) {
          const pts = halfPointToPoints(position);
          if (Number.isFinite(pts)) {
            styleEntries.push(`vertical-align: ${pts}pt`);
          }
        } else if (vertAlign === 'superscript' || vertAlign === 'subscript') {
          styleEntries.push(`vertical-align: ${vertAlign === 'superscript' ? 'super' : 'sub'}`);
          if (fontSizeHalfPts != null && Number.isFinite(fontSizeHalfPts)) {
            const scaledPts = halfPointToPoints(fontSizeHalfPts * SUBSCRIPT_SUPERSCRIPT_SCALE);
            if (Number.isFinite(scaledPts)) {
              styleEntries.push(`font-size: ${scaledPts}pt`);
            } else {
              styleEntries.push(`font-size: ${SUBSCRIPT_SUPERSCRIPT_SCALE * 100}%`);
            }
          } else {
            styleEntries.push(`font-size: ${SUBSCRIPT_SUPERSCRIPT_SCALE * 100}%`);
          }
        } else if (vertAlign === 'baseline') {
          styleEntries.push('vertical-align: baseline');
        }

        if (!styleEntries.length) return;
        const existing = span.getAttribute('style');
        const merged = existing ? `${existing}; ${styleEntries.join('; ')}` : styleEntries.join('; ');
        span.setAttribute('style', merged);
      } catch (error) {
        console.error('Failed to apply vertical alignment to span:', error);
      }
    });
  } catch (error) {
    console.error('Failed to apply vertical alignment to layout:', error);
  }
}
