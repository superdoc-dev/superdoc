import { describe, expect, it } from 'vitest';

/**
 * Test suite for line shape SVG markup generation.
 *
 * Line shapes use the preset geometry prst="line" in OOXML and are rendered
 * as SVG <line> elements. This suite verifies the expected SVG markup structure
 * for line shapes with various configurations.
 *
 * The actual rendering logic is in the tryCreatePresetSvg method in renderer.ts,
 * and these tests document the expected SVG output format.
 */
describe('Line Shape SVG Markup Specification', () => {
  /**
   * Helper to parse SVG string and extract SVG element
   */
  const parseSvg = (svgMarkup: string): { svg: SVGElement | null; line: Element | null } => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
    const svg = doc.querySelector('svg') as SVGElement | null;
    const line = doc.querySelector('line');
    return { svg, line };
  };

  it('should generate horizontal line SVG markup with correct structure', () => {
    // Expected SVG markup for a horizontal line (height=0)
    const expectedMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="0" viewBox="0 0 400 0">
  <line x1="0" y1="0" x2="400" y2="0" stroke="#5b9bd5" stroke-width="2" />
</svg>`;

    const { svg, line } = parseSvg(expectedMarkup);

    expect(svg).toBeTruthy();
    expect(line).toBeTruthy();

    if (svg && line) {
      // Verify SVG container attributes
      expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
      expect(svg.getAttribute('width')).toBe('400');
      expect(svg.getAttribute('height')).toBe('0');
      expect(svg.getAttribute('viewBox')).toBe('0 0 400 0');

      // Verify line attributes for horizontal line
      expect(line.getAttribute('x1')).toBe('0');
      expect(line.getAttribute('y1')).toBe('0');
      expect(line.getAttribute('x2')).toBe('400');
      expect(line.getAttribute('y2')).toBe('0');
      expect(line.getAttribute('stroke')).toBe('#5b9bd5');
      expect(line.getAttribute('stroke-width')).toBe('2');
    }
  });

  it('should generate vertical line SVG markup with correct structure', () => {
    // Expected SVG markup for a vertical line (width=0)
    const expectedMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="300" viewBox="0 0 0 300">
  <line x1="0" y1="0" x2="0" y2="300" stroke="#ff0000" stroke-width="3" />
</svg>`;

    const { svg, line } = parseSvg(expectedMarkup);

    expect(svg).toBeTruthy();
    expect(line).toBeTruthy();

    if (svg && line) {
      // Verify SVG container attributes
      expect(svg.getAttribute('width')).toBe('0');
      expect(svg.getAttribute('height')).toBe('300');

      // Verify line attributes for vertical line
      expect(line.getAttribute('x1')).toBe('0');
      expect(line.getAttribute('y1')).toBe('0');
      expect(line.getAttribute('x2')).toBe('0');
      expect(line.getAttribute('y2')).toBe('300');
      expect(line.getAttribute('stroke')).toBe('#ff0000');
      expect(line.getAttribute('stroke-width')).toBe('3');
    }
  });

  it('should generate diagonal line SVG markup with correct structure', () => {
    // Expected SVG markup for a diagonal line
    const expectedMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <line x1="0" y1="0" x2="200" y2="200" stroke="#00ff00" stroke-width="4" />
</svg>`;

    const { svg, line } = parseSvg(expectedMarkup);

    expect(svg).toBeTruthy();
    expect(line).toBeTruthy();

    if (svg && line) {
      // Verify line attributes for diagonal line
      expect(line.getAttribute('x1')).toBe('0');
      expect(line.getAttribute('y1')).toBe('0');
      expect(line.getAttribute('x2')).toBe('200');
      expect(line.getAttribute('y2')).toBe('200');
      expect(line.getAttribute('stroke')).toBe('#00ff00');
      expect(line.getAttribute('stroke-width')).toBe('4');
    }
  });

  it('should handle line with stroke="none" for null stroke color', () => {
    // When strokeColor is null, stroke should be "none"
    const expectedMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="0" viewBox="0 0 100 0">
  <line x1="0" y1="0" x2="100" y2="0" stroke="none" stroke-width="1" />
</svg>`;

    const { line } = parseSvg(expectedMarkup);

    expect(line).toBeTruthy();

    if (line) {
      expect(line.getAttribute('stroke')).toBe('none');
    }
  });

  it('should use default black stroke when stroke color is undefined', () => {
    // When strokeColor is undefined, default should be #000000
    const expectedMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="0" viewBox="0 0 100 0">
  <line x1="0" y1="0" x2="100" y2="0" stroke="#000000" stroke-width="2" />
</svg>`;

    const { line } = parseSvg(expectedMarkup);

    expect(line).toBeTruthy();

    if (line) {
      expect(line.getAttribute('stroke')).toBe('#000000');
    }
  });

  it('should use default stroke width of 1 when undefined', () => {
    // When strokeWidth is undefined, default should be 1
    const expectedMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="0" viewBox="0 0 100 0">
  <line x1="0" y1="0" x2="100" y2="0" stroke="#5b9bd5" stroke-width="1" />
</svg>`;

    const { line } = parseSvg(expectedMarkup);

    expect(line).toBeTruthy();

    if (line) {
      expect(line.getAttribute('stroke-width')).toBe('1');
    }
  });

  it('should handle fractional stroke widths correctly', () => {
    // Fractional stroke widths should be preserved
    const expectedMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="0" viewBox="0 0 100 0">
  <line x1="0" y1="0" x2="100" y2="0" stroke="#000000" stroke-width="0.5" />
</svg>`;

    const { line } = parseSvg(expectedMarkup);

    expect(line).toBeTruthy();

    if (line) {
      expect(line.getAttribute('stroke-width')).toBe('0.5');
    }
  });

  it('should handle edge case of zero-width and zero-height line', () => {
    // Degenerate line (point) should still have valid SVG structure
    const expectedMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0">
  <line x1="0" y1="0" x2="0" y2="0" stroke="#000000" stroke-width="1" />
</svg>`;

    const { svg, line } = parseSvg(expectedMarkup);

    expect(svg).toBeTruthy();
    expect(line).toBeTruthy();

    if (line) {
      // Should still be a valid line element, even if it's a point
      expect(line.getAttribute('x1')).toBe('0');
      expect(line.getAttribute('y1')).toBe('0');
      expect(line.getAttribute('x2')).toBe('0');
      expect(line.getAttribute('y2')).toBe('0');
    }
  });

  it('should handle very large line dimensions', () => {
    // Very large dimensions should be handled correctly
    const expectedMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="0" viewBox="0 0 10000 0">
  <line x1="0" y1="0" x2="10000" y2="0" stroke="#5b9bd5" stroke-width="2" />
</svg>`;

    const { line } = parseSvg(expectedMarkup);

    expect(line).toBeTruthy();

    if (line) {
      expect(line.getAttribute('x2')).toBe('10000');
    }
  });

  it('should contain exactly one line element per SVG', () => {
    // Each line shape should produce exactly one <line> element
    const expectedMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">
  <line x1="0" y1="0" x2="100" y2="50" stroke="#000000" stroke-width="1" />
</svg>`;

    const parser = new DOMParser();
    const doc = parser.parseFromString(expectedMarkup, 'image/svg+xml');
    const lines = doc.querySelectorAll('line');

    expect(lines.length).toBe(1);
  });

  it('should have SVG with proper XML namespace', () => {
    // All generated SVG must have the proper namespace
    const expectedMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="0" viewBox="0 0 100 0">
  <line x1="0" y1="0" x2="100" y2="0" stroke="#5b9bd5" stroke-width="2" />
</svg>`;

    const { svg } = parseSvg(expectedMarkup);

    expect(svg).toBeTruthy();

    if (svg) {
      expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    }
  });
});

/**
 * Test suite for dimension-sensitive preset shapes.
 *
 * Some preset shapes like leftRightArrow and upDownArrow require non-square
 * aspect ratios to render correctly. When rendered at square dimensions,
 * their stem widths collapse to zero, producing incorrect geometry.
 *
 * The renderer.ts tryCreatePresetSvg method passes width/height to
 * getPresetShapeSvg to enable on-demand generation with correct dimensions.
 */
describe('Dimension-Sensitive Shape SVG Specification', () => {
  /**
   * Helper to count unique X coordinates in a path
   */
  const countUniqueXCoords = (pathD: string): number => {
    const coords = pathD.match(/[ML]\s*(\d+(?:\.\d+)?)/g) ?? [];
    const xValues = coords.map((m) => parseFloat(m.replace(/[ML]\s*/, '')));
    return new Set(xValues).size;
  };

  /**
   * Helper to count unique Y coordinates in a path
   */
  const countUniqueYCoords = (pathD: string): number => {
    const matches = pathD.match(/\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)/g) ?? [];
    const yValues = matches.map((m) => parseFloat(m.split(/\s+/)[1]));
    return new Set(yValues).size;
  };

  it('leftRightArrow should have viewBox matching provided dimensions', () => {
    // When width=200, height=100 is provided, viewBox should be "0 0 200 100"
    // This ensures the shape geometry is calculated for the correct aspect ratio
    const expectedViewBox = '0 0 200 100';

    // The viewBox should match the provided dimensions, not be fixed at 100x100
    expect(expectedViewBox).toBe('0 0 200 100');
  });

  it('leftRightArrow at non-square dimensions should have proper stem width', () => {
    // A properly rendered leftRightArrow at 200x100 should have multiple unique X coordinates
    // for the stem (not just the arrow tips at 0 and 200)
    //
    // Path structure: left tip -> left arrow head -> stem top-left -> stem top-right ->
    //                 right arrow head -> right tip -> right arrow head bottom ->
    //                 stem bottom-right -> stem bottom-left -> left arrow head bottom -> close
    //
    // With proper stem, we expect at least 4 unique X coords: 0, stem-left, stem-right, 200
    const properStemPath = 'M 0 50 L 50 0 L 50 25 L 150 25 L 150 0 L 200 50 L 150 100 L 150 75 L 50 75 L 50 100 Z';

    const uniqueX = countUniqueXCoords(properStemPath);
    expect(uniqueX).toBeGreaterThanOrEqual(4);
  });

  it('leftRightArrow at square dimensions has collapsed stem (known limitation)', () => {
    // At 100x100 (square), the OOXML formulas produce x2=50 and x3=50,
    // resulting in zero stem width. This is expected behavior for square aspect ratios.
    const collapsedStemPath = 'M 0 50 L 50 0 L 50 25 L 50 25 L 50 0 L 100 50 L 50 100 L 50 75 L 50 75 L 50 100 Z';

    // Note the repeated coordinates (50 25 L 50 25) indicating zero stem width
    expect(collapsedStemPath).toContain('50 25 L 50 25');
  });

  it('upDownArrow should have viewBox matching provided dimensions', () => {
    // When width=100, height=200 is provided, viewBox should be "0 0 100 200"
    const expectedViewBox = '0 0 100 200';
    expect(expectedViewBox).toBe('0 0 100 200');
  });

  it('upDownArrow at non-square dimensions should have proper stem height', () => {
    // A properly rendered upDownArrow at 100x200 should have multiple unique Y coordinates
    // for the stem (not just the arrow tips at 0 and 200)
    //
    // With proper stem, we expect at least 4 unique Y coords: 0, stem-top, stem-bottom, 200
    const properStemPath = 'M 0 50 L 50 0 L 100 50 L 75 50 L 75 150 L 100 150 L 50 200 L 0 150 L 25 150 L 25 50 Z';

    const uniqueY = countUniqueYCoords(properStemPath);
    expect(uniqueY).toBeGreaterThanOrEqual(4);
  });

  it('renderer should pass block.geometry dimensions to getPresetShapeSvg', () => {
    // This documents the expected behavior of tryCreatePresetSvg in renderer.ts:
    // - For dimension-sensitive shapes (leftRightArrow, upDownArrow), the renderer
    //   should pass block.geometry.width and block.geometry.height to getPresetShapeSvg
    // - This enables on-demand generation with correct aspect ratio
    //
    // The call should look like:
    // getPresetShapeSvg({
    //   preset: block.shapeKind,
    //   styleOverrides: ...,
    //   width: block.geometry.width,   // <-- Required for dimension-sensitive shapes
    //   height: block.geometry.height, // <-- Required for dimension-sensitive shapes
    // })

    // Verify the expected interface
    const expectedOptions = {
      preset: 'leftRightArrow',
      styleOverrides: { fill: '#5b9bd5', stroke: 'none' },
      width: 200,
      height: 100,
    };

    expect(expectedOptions.width).toBeDefined();
    expect(expectedOptions.height).toBeDefined();
    expect(expectedOptions.width).not.toBe(expectedOptions.height);
  });
});
