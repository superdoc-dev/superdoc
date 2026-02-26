import { describe, it, expect } from 'vitest';
import { createCustomGeometrySvg, type CustomGeometrySvgInput } from './custom-geometry-svg.js';

/** Helper to build a minimal block input. */
function makeBlock(overrides: Partial<CustomGeometrySvgInput> = {}): CustomGeometrySvgInput {
  return {
    geometry: { width: 100, height: 50 },
    fillColor: '#ff0000',
    strokeColor: '#000000',
    strokeWidth: 2,
    customGeometry: {
      paths: [{ d: 'M 0 0 L 100 50', fill: 'solid', stroke: true }],
      width: 200,
      height: 100,
    },
    ...overrides,
  };
}

describe('createCustomGeometrySvg', () => {
  it('returns null when no customGeometry', () => {
    expect(createCustomGeometrySvg(makeBlock({ customGeometry: undefined }))).toBeNull();
  });

  it('returns null when paths array is empty', () => {
    expect(
      createCustomGeometrySvg(makeBlock({ customGeometry: { paths: [], width: 200, height: 100 } })),
    ).toBeNull();
  });

  it('generates SVG with correct dimensions and viewBox', () => {
    const svg = createCustomGeometrySvg(makeBlock())!;
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
    expect(svg).toContain('viewBox="0 0 200 100"');
    expect(svg).toContain('preserveAspectRatio="none"');
  });

  it('uses width/height overrides when provided', () => {
    const svg = createCustomGeometrySvg(makeBlock(), 300, 150)!;
    expect(svg).toContain('width="300"');
    expect(svg).toContain('height="150"');
    // viewBox should still use geometry coordinate space
    expect(svg).toContain('viewBox="0 0 200 100"');
  });

  it('resolves fillColor: null → none', () => {
    const svg = createCustomGeometrySvg(makeBlock({ fillColor: null }))!;
    expect(svg).toContain('fill="none"');
  });

  it('resolves fillColor: string → used directly', () => {
    const svg = createCustomGeometrySvg(makeBlock({ fillColor: '#00ff00' }))!;
    expect(svg).toContain('fill="#00ff00"');
  });

  it('resolves fillColor: non-string/non-null (gradient object) → none', () => {
    const svg = createCustomGeometrySvg(makeBlock({ fillColor: { type: 'gradient' } as unknown as string }))!;
    expect(svg).toContain('fill="none"');
  });

  it('resolves strokeColor: null → none', () => {
    const svg = createCustomGeometrySvg(makeBlock({ strokeColor: null }))!;
    expect(svg).toContain('stroke="none"');
  });

  it('resolves strokeColor: string → used directly', () => {
    const svg = createCustomGeometrySvg(makeBlock({ strokeColor: '#0000ff' }))!;
    expect(svg).toContain('stroke="#0000ff"');
  });

  it('defaults strokeWidth to 0 when undefined', () => {
    const svg = createCustomGeometrySvg(makeBlock({ strokeWidth: undefined }))!;
    expect(svg).toContain('stroke-width="0"');
  });

  it('applies per-path fill override: fill=none suppresses block fill', () => {
    const block = makeBlock({
      customGeometry: {
        paths: [{ d: 'M 0 0 L 10 10', fill: 'none', stroke: true }],
        width: 100,
        height: 100,
      },
    });
    const svg = createCustomGeometrySvg(block)!;
    expect(svg).toContain('fill="none"');
  });

  it('applies per-path stroke suppression: stroke=false → stroke none, width 0', () => {
    const block = makeBlock({
      customGeometry: {
        paths: [{ d: 'M 0 0 L 10 10', fill: 'solid', stroke: false }],
        width: 100,
        height: 100,
      },
    });
    const svg = createCustomGeometrySvg(block)!;
    expect(svg).toContain('stroke="none"');
    expect(svg).toContain('stroke-width="0"');
  });

  it('sanitizes SVG d attribute — strips unsafe characters', () => {
    const block = makeBlock({
      customGeometry: {
        paths: [{ d: 'M 0 0 L 10 10 <script>alert(1)</script>', fill: 'solid', stroke: true }],
        width: 100,
        height: 100,
      },
    });
    const svg = createCustomGeometrySvg(block)!;
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('alert');
    // Valid path commands should survive
    expect(svg).toContain('M 0 0 L 10 10');
  });

  it('generates multiple path elements for multiple paths', () => {
    const block = makeBlock({
      customGeometry: {
        paths: [
          { d: 'M 0 0 L 50 50', fill: 'solid', stroke: true },
          { d: 'M 50 50 L 100 100', fill: 'none', stroke: false },
        ],
        width: 100,
        height: 100,
      },
    });
    const svg = createCustomGeometrySvg(block)!;
    const pathCount = (svg.match(/<path /g) || []).length;
    expect(pathCount).toBe(2);
  });
});
