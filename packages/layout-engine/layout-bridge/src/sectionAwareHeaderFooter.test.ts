import { describe, expect, it } from 'bun:test';
import type { FlowBlock, SectionMetadata } from '@superdoc/contracts';
import type { HeaderFooterConstraints } from '@superdoc/layout-engine';

import { buildSectionAwareHeaderFooterMeasurementGroups } from './sectionAwareHeaderFooter.js';

describe('buildSectionAwareHeaderFooterMeasurementGroups', () => {
  it('keeps header/footer measurement width clamped to the section content width', () => {
    const blocksByRId = new Map<string, FlowBlock[]>([
      [
        'rIdFooter',
        [
          {
            kind: 'table',
            id: 'footer-table',
            rows: [],
            attrs: {
              tableWidth: {
                type: 'px',
                value: 689.667,
              },
            },
          } as unknown as FlowBlock,
        ],
      ],
    ]);

    const sectionMetadata: SectionMetadata[] = [
      {
        sectionIndex: 0,
        footerRefs: { default: 'rIdFooter' },
        pageSize: { w: 816, h: 1056 },
        margins: { top: 96, right: 86.4, bottom: 96, left: 86.4, header: 48, footer: 48 },
      },
    ];

    const fallbackConstraints: HeaderFooterConstraints = {
      width: 643.2,
      height: 864,
      pageWidth: 816,
      pageHeight: 1056,
      margins: { top: 96, right: 86.4, bottom: 96, left: 86.4, header: 48, footer: 48 },
      overflowBaseHeight: 864,
    };

    const groups = buildSectionAwareHeaderFooterMeasurementGroups(
      'footer',
      blocksByRId,
      sectionMetadata,
      fallbackConstraints,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.effectiveWidth).toBeCloseTo(643.2, 6);
    expect(groups[0]?.sectionConstraints.width).toBeCloseTo(643.2, 6);
  });
});
