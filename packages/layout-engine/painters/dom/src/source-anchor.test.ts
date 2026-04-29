import { describe, expect, it } from 'vitest';
import { createDomPainter } from './index.js';
import type { FlowBlock, Layout, Measure, SourceAnchor } from '@superdoc/contracts';
import type { PaintSnapshot } from './renderer.js';

describe('DomPainter source anchors', () => {
  it('preserves optional source anchors on DOM fragments and paint snapshot lines/markers', () => {
    const sourceAnchor: SourceAnchor = {
      sourceNodeId: 'srcnode_para_1',
      occurrenceId: 'occ_para_1',
      rawFactIds: ['raw_p_1'],
      schemaQNames: [{ qName: 'w:p' }],
      sourceRef: {
        partUri: 'word/document.xml',
        xpathLikePath: '/w:document[1]/w:body[1]/w:p[1]',
      },
      anchorConfidence: 'high',
    };
    const block: FlowBlock = {
      kind: 'paragraph',
      id: 'anchored-paragraph',
      sourceAnchor,
      runs: [{ text: 'Anchored', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 9 }],
      attrs: {
        indent: { left: 36, hanging: 18, firstLine: 0 },
        numberingProperties: { numId: 1, ilvl: 0 },
        wordLayout: {
          tabsPx: [],
          marker: {
            markerText: '1.',
            justification: 'left',
            suffix: 'tab',
            run: {
              fontFamily: 'Arial',
              fontSize: 12,
            },
          },
        },
      },
    };
    const measure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 8,
          width: 70,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };
    const layout: Layout = {
      pageSize: { w: 200, h: 200 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: 'anchored-paragraph',
              fromLine: 0,
              toLine: 1,
              x: 10,
              y: 20,
              width: 120,
              markerWidth: 20,
              markerTextWidth: 10,
              pmStart: 1,
              pmEnd: 9,
              sourceAnchor,
            },
          ],
        },
      ],
    };
    let snapshot: PaintSnapshot | null = null;
    const mount = document.createElement('div');
    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      onPaintSnapshot: (nextSnapshot) => {
        snapshot = nextSnapshot;
      },
    });

    painter.paint(layout, mount);

    const fragment = mount.querySelector<HTMLElement>('[data-block-id="anchored-paragraph"]');
    expect(fragment?.dataset.sourceNodeId).toBe('srcnode_para_1');
    expect(snapshot?.pages[0]?.lines[0]?.sourceAnchor?.sourceNodeId).toBe('srcnode_para_1');
    expect(snapshot?.pages[0]?.lines[0]?.markers?.[0]?.sourceAnchor?.occurrenceId).toBe('occ_para_1');
  });
});
