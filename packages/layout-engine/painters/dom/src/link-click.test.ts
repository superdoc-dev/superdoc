import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createDomPainter } from './index.js';
import type { FlowBlock, Measure, Layout } from '@superdoc/contracts';

/**
 * Tests for link rendering in DomPainter.
 *
 * Note: Click event handling has been moved to EditorInputManager via event delegation.
 * These tests verify that links are rendered with correct attributes for delegation to work.
 */
describe('DomPainter - Link Rendering', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentElement) {
      container.parentElement.removeChild(container);
    }
  });

  it('should render link with correct attributes', () => {
    const linkBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'link-block',
      runs: [
        {
          text: 'Click here',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 0,
          pmEnd: 10,
          link: {
            href: 'https://example.com',
            target: '_blank',
          },
        },
      ],
    };

    const measure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 10,
          width: 80,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const layout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: 'link-block',
              fromLine: 0,
              toLine: 1,
              x: 24,
              y: 24,
              width: 260,
              pmStart: 0,
              pmEnd: 10,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({ blocks: [linkBlock], measures: [measure] });
    painter.paint(layout, container);

    const linkElement = container.querySelector('a.superdoc-link') as HTMLAnchorElement;
    expect(linkElement).toBeTruthy();
    expect(linkElement.href).toBe('https://example.com/');
    expect(linkElement.target).toBe('_blank');
    expect(linkElement.textContent).toBe('Click here');
    // Verify accessibility attributes for event delegation
    expect(linkElement.getAttribute('role')).toBe('link');
    expect(linkElement.getAttribute('tabindex')).toBe('0');
  });

  it('should render link with all optional attributes', () => {
    const linkBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'link-block',
      runs: [
        {
          text: 'Test link',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 0,
          pmEnd: 9,
          link: {
            href: 'https://example.org',
            target: '_blank',
            rel: 'noopener noreferrer',
            tooltip: 'Example tooltip',
            version: 2,
          },
        },
      ],
    };

    const measure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 9,
          width: 70,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const layout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: 'link-block',
              fromLine: 0,
              toLine: 1,
              x: 24,
              y: 24,
              width: 260,
              pmStart: 0,
              pmEnd: 9,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({ blocks: [linkBlock], measures: [measure] });
    painter.paint(layout, container);

    const linkElement = container.querySelector('a.superdoc-link') as HTMLAnchorElement;
    expect(linkElement).toBeTruthy();
    expect(linkElement.href).toBe('https://example.org/');
    expect(linkElement.target).toBe('_blank');
    expect(linkElement.rel).toBe('noopener noreferrer');
    expect(linkElement.title).toBe('Example tooltip');
  });

  it('should render link without optional attributes', () => {
    const linkBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'link-block',
      runs: [
        {
          text: 'Simple link',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 0,
          pmEnd: 11,
          link: {
            href: 'https://simple.com',
          },
        },
      ],
    };

    const measure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 11,
          width: 85,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const layout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: 'link-block',
              fromLine: 0,
              toLine: 1,
              x: 24,
              y: 24,
              width: 260,
              pmStart: 0,
              pmEnd: 11,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({ blocks: [linkBlock], measures: [measure] });
    painter.paint(layout, container);

    const linkElement = container.querySelector('a.superdoc-link') as HTMLAnchorElement;
    expect(linkElement).toBeTruthy();
    expect(linkElement.href).toBe('https://simple.com/');
    // External links automatically get target and rel for security
    expect(linkElement.target).toBe('_blank');
    expect(linkElement.rel).toBe('noopener noreferrer');
  });

  it('should render multiple links in the same paragraph', () => {
    const linkBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'multi-link-block',
      runs: [
        {
          text: 'First ',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 0,
          pmEnd: 6,
          link: {
            href: 'https://first.com',
          },
        },
        {
          text: 'and ',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 6,
          pmEnd: 10,
        },
        {
          text: 'Second',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 10,
          pmEnd: 16,
          link: {
            href: 'https://second.com',
          },
        },
      ],
    };

    const measure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 2,
          toChar: 6,
          width: 120,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const layout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: 'multi-link-block',
              fromLine: 0,
              toLine: 1,
              x: 24,
              y: 24,
              width: 260,
              pmStart: 0,
              pmEnd: 16,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({ blocks: [linkBlock], measures: [measure] });
    painter.paint(layout, container);

    const linkElements = container.querySelectorAll('a.superdoc-link');
    expect(linkElements.length).toBe(2);

    const firstLink = linkElements[0] as HTMLAnchorElement;
    const secondLink = linkElements[1] as HTMLAnchorElement;

    expect(firstLink.href).toBe('https://first.com/');
    expect(secondLink.href).toBe('https://second.com/');
  });

  it('should render non-link text runs as spans', () => {
    const mixedBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'mixed-block',
      runs: [
        {
          text: 'Regular text ',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 0,
          pmEnd: 13,
        },
        {
          text: 'with link',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 13,
          pmEnd: 22,
          link: {
            href: 'https://link.com',
          },
        },
      ],
    };

    const measure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 1,
          toChar: 9,
          width: 150,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const layout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: 'mixed-block',
              fromLine: 0,
              toLine: 1,
              x: 24,
              y: 24,
              width: 260,
              pmStart: 0,
              pmEnd: 22,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({ blocks: [mixedBlock], measures: [measure] });
    painter.paint(layout, container);

    // Should have one link and spans for regular text
    const linkElements = container.querySelectorAll('a.superdoc-link');
    expect(linkElements.length).toBe(1);

    const linkElement = linkElements[0] as HTMLAnchorElement;
    expect(linkElement.textContent).toBe('with link');
  });
});
