/**
 * Tests for Paragraph Attributes Computation Module.
 *
 * This suite focuses on the exported helpers:
 * - deepClone
 * - normalizeFramePr
 * - normalizeDropCap
 * - computeParagraphAttrs
 * - computeRunAttrs
 */

import { describe, it, expect } from 'vitest';
import { deepClone, normalizeFramePr, normalizeDropCap, computeParagraphAttrs, computeRunAttrs } from './paragraph.js';
import { twipsToPx } from '../utilities.js';

type PMNode = {
  type?: { name?: string };
  attrs?: Record<string, unknown>;
  content?: Array<{
    type?: string;
    attrs?: Record<string, unknown>;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

describe('deepClone', () => {
  it('creates a deep copy of nested objects and arrays', () => {
    const source = {
      spacing: { before: 120, after: 240 },
      tabs: [{ val: 'start', pos: 720 }],
    };

    const result = deepClone(source);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result.spacing).not.toBe(source.spacing);
    expect(result.tabs).not.toBe(source.tabs);
  });
});

describe('normalizeFramePr', () => {
  it('normalizes frame properties and converts positions to pixels', () => {
    const framePr = {
      wrap: 'around',
      x: 720,
      y: 1440,
      xAlign: 'right',
      yAlign: 'center',
      hAnchor: 'page',
      vAnchor: 'margin',
    };

    const result = normalizeFramePr(framePr);

    expect(result).toEqual({
      wrap: 'around',
      x: twipsToPx(720),
      y: twipsToPx(1440),
      xAlign: 'right',
      yAlign: 'center',
      hAnchor: 'page',
      vAnchor: 'margin',
    });
  });
});

describe('normalizeDropCap', () => {
  it('extracts drop cap run info from paragraph content', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      content: [
        {
          type: 'run',
          attrs: { runProperties: { fontSize: 24, bold: true } },
          content: [{ type: 'text', text: 'A' }],
        },
      ],
    };

    const framePr = { dropCap: 'drop', lines: 2 };
    const result = normalizeDropCap(framePr, paragraph as never);

    expect(result?.mode).toBe('drop');
    expect(result?.lines).toBe(2);
    expect(result?.run?.text).toBe('A');
    expect(result?.run?.bold).toBe(true);
    expect(typeof result?.run?.fontSize).toBe('number');
  });
});

describe('computeParagraphAttrs', () => {
  it('normalizes spacing, indent, alignment, and tabs from paragraphProperties', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          justification: 'center',
          spacing: { before: 240, after: 120, line: 210, lineRule: 'exact' },
          indent: { left: 720, hanging: 360 },
          tabStops: [{ val: 'left', pos: 48 }],
        },
      },
    };

    const { paragraphAttrs } = computeParagraphAttrs(paragraph as never);

    expect(paragraphAttrs.alignment).toBe('center');
    expect(paragraphAttrs.spacing?.before).toBe(twipsToPx(240));
    expect(paragraphAttrs.spacing?.after).toBe(twipsToPx(120));
    expect(paragraphAttrs.spacing?.line).toBe(twipsToPx(210));
    expect(paragraphAttrs.spacing?.lineRule).toBe('exact');
    expect(paragraphAttrs.spacing?.lineUnit).toBe('px');
    expect(paragraphAttrs.indent?.left).toBe(twipsToPx(720));
    expect(paragraphAttrs.indent?.hanging).toBe(twipsToPx(360));
    expect(paragraphAttrs.tabs?.[0]).toEqual({ val: 'start', pos: 720 });
  });

  it('exposes resolved paragraph properties when no converter context is provided', () => {
    const paragraph: PMNode = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: { styleId: 'Heading1' },
      },
    };

    const { resolvedParagraphProperties } = computeParagraphAttrs(paragraph as never);
    expect(resolvedParagraphProperties.styleId).toBe('Heading1');
  });
});

describe('computeRunAttrs', () => {
  it('normalizes font family, font size, and color', () => {
    const runProps = {
      fontFamily: { ascii: 'Arial' },
      fontSize: 24,
      color: { val: 'ff0000' },
    };

    const result = computeRunAttrs(runProps as never);

    expect(result.fontFamily).toContain('Arial');
    expect(result.fontSize).toBeGreaterThan(0);
    expect(result.color).toBe('#FF0000');
  });

  it('includes the vanish property', () => {
    const runProps = {
      vanish: true,
    };

    const result = computeRunAttrs(runProps as never);

    expect(result.vanish).toBe(true);
  });
});
