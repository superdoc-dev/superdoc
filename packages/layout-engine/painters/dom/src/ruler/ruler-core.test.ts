import { describe, it, expect } from 'vite-plus/test';
import {
  generateRulerDefinition,
  generateRulerDefinitionFromPx,
  pxToInches,
  inchesToPx,
  calculateMarginFromHandle,
  clampHandlePosition,
  createHandleStates,
  type RulerConfig,
  type RulerConfigPx,
  type RulerDefinition,
} from './ruler-core.js';

describe('generateRulerDefinition', () => {
  it('generates correct ruler for standard US Letter page', () => {
    const config: RulerConfig = {
      pageSize: { width: 8.5, height: 11 },
      pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
    };

    const ruler = generateRulerDefinition(config);

    expect(ruler.widthPx).toBe(8.5 * 96); // 816px
    expect(ruler.heightPx).toBe(25); // default height
    expect(ruler.leftMarginPx).toBe(96); // 1 inch * 96 PPI
    expect(ruler.rightMarginPx).toBe(720); // 816 - 96
    expect(ruler.pageWidthInches).toBe(8.5);
    expect(ruler.ticks.length).toBeGreaterThan(0);
  });

  it('generates correct number of ticks for 8.5 inch width', () => {
    const config: RulerConfig = {
      pageSize: { width: 8.5, height: 11 },
      pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
    };

    const ruler = generateRulerDefinition(config);

    // For 8.5 inches: 8 full inches + 1 half inch
    // Per inch: 1 main + 3 eighth + 1 half + 3 eighth = 8 ticks
    // 8 full inches: 8 * 8 = 64 ticks
    // Last half inch: 1 main + 3 eighth + 1 half = 5 ticks
    // Total: 64 + 5 = 69 ticks
    expect(ruler.ticks.length).toBe(69);
  });

  it('generates correct tick positions with default PPI', () => {
    const config: RulerConfig = {
      pageSize: { width: 1, height: 11 },
      pageMargins: { left: 0, right: 0, top: 0, bottom: 0 },
    };

    const ruler = generateRulerDefinition(config);

    // First tick should be at x=0
    expect(ruler.ticks[0].x).toBe(0);
    expect(ruler.ticks[0].size).toBe('main');
    expect(ruler.ticks[0].label).toBe(0);

    // Ticks are spaced 12px apart (96/8)
    expect(ruler.ticks[1].x).toBe(12);
    expect(ruler.ticks[1].size).toBe('eighth');

    // Half tick at position 4 (index 4)
    expect(ruler.ticks[4].x).toBe(48);
    expect(ruler.ticks[4].size).toBe('half');
  });

  it('generates correct tick heights', () => {
    const config: RulerConfig = {
      pageSize: { width: 2, height: 11 },
      pageMargins: { left: 0, right: 0, top: 0, bottom: 0 },
    };

    const ruler = generateRulerDefinition(config);

    const mainTick = ruler.ticks.find((t) => t.size === 'main');
    const halfTick = ruler.ticks.find((t) => t.size === 'half');
    const eighthTick = ruler.ticks.find((t) => t.size === 'eighth');

    expect(mainTick?.height).toBe('20%');
    expect(halfTick?.height).toBe('40%');
    expect(eighthTick?.height).toBe('10%');
  });

  it('generates main ticks with correct labels', () => {
    const config: RulerConfig = {
      pageSize: { width: 3, height: 11 },
      pageMargins: { left: 0, right: 0, top: 0, bottom: 0 },
    };

    const ruler = generateRulerDefinition(config);

    const mainTicks = ruler.ticks.filter((t) => t.size === 'main');

    expect(mainTicks[0].label).toBe(0);
    expect(mainTicks[1].label).toBe(1);
    expect(mainTicks[2].label).toBe(2);
  });

  it('uses custom PPI when provided', () => {
    const config: RulerConfig = {
      pageSize: { width: 8.5, height: 11 },
      pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
      ppi: 72,
    };

    const ruler = generateRulerDefinition(config);

    expect(ruler.widthPx).toBe(8.5 * 72); // 612px
    expect(ruler.leftMarginPx).toBe(72); // 1 inch * 72 PPI
    expect(ruler.rightMarginPx).toBe(540); // 612 - 72
  });

  it('uses custom ruler height when provided', () => {
    const config: RulerConfig = {
      pageSize: { width: 8.5, height: 11 },
      pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
      heightPx: 30,
    };

    const ruler = generateRulerDefinition(config);

    expect(ruler.heightPx).toBe(30);
  });

  it('handles zero margins', () => {
    const config: RulerConfig = {
      pageSize: { width: 8.5, height: 11 },
      pageMargins: { left: 0, right: 0, top: 0, bottom: 0 },
    };

    const ruler = generateRulerDefinition(config);

    expect(ruler.leftMarginPx).toBe(0);
    expect(ruler.rightMarginPx).toBe(8.5 * 96); // Full width
  });

  it('handles asymmetric margins', () => {
    const config: RulerConfig = {
      pageSize: { width: 8.5, height: 11 },
      pageMargins: { left: 0.5, right: 1.5, top: 1, bottom: 1 },
    };

    const ruler = generateRulerDefinition(config);

    expect(ruler.leftMarginPx).toBe(48); // 0.5 * 96
    expect(ruler.rightMarginPx).toBe(672); // 816 - 144
  });

  it('handles A4 page size', () => {
    const config: RulerConfig = {
      pageSize: { width: 8.27, height: 11.69 },
      pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
    };

    const ruler = generateRulerDefinition(config);

    expect(ruler.widthPx).toBeCloseTo(8.27 * 96, 2);
    expect(ruler.pageWidthInches).toBe(8.27);
  });

  it('stops at half inch for fractional page widths', () => {
    const config: RulerConfig = {
      pageSize: { width: 8.5, height: 11 },
      pageMargins: { left: 0, right: 0, top: 0, bottom: 0 },
    };

    const ruler = generateRulerDefinition(config);

    // Last tick should be the half-inch tick at 8 inches
    const lastTick = ruler.ticks[ruler.ticks.length - 1];
    expect(lastTick.size).toBe('half');
    expect(lastTick.x).toBe(8 * 96 + 48); // 8 inches + half inch
  });

  describe('input validation', () => {
    it('throws error for non-positive PPI', () => {
      const config: RulerConfig = {
        pageSize: { width: 8.5, height: 11 },
        pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
        ppi: 0,
      };

      expect(() => generateRulerDefinition(config)).toThrow('Invalid PPI: 0');
    });

    it('throws error for negative PPI', () => {
      const config: RulerConfig = {
        pageSize: { width: 8.5, height: 11 },
        pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
        ppi: -96,
      };

      expect(() => generateRulerDefinition(config)).toThrow('Invalid PPI: -96');
    });

    it('throws error for NaN PPI', () => {
      const config: RulerConfig = {
        pageSize: { width: 8.5, height: 11 },
        pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
        ppi: NaN,
      };

      expect(() => generateRulerDefinition(config)).toThrow('Invalid PPI');
    });

    it('throws error for Infinity PPI', () => {
      const config: RulerConfig = {
        pageSize: { width: 8.5, height: 11 },
        pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
        ppi: Infinity,
      };

      expect(() => generateRulerDefinition(config)).toThrow('Invalid PPI');
    });

    it('throws error for non-positive page width', () => {
      const config: RulerConfig = {
        pageSize: { width: 0, height: 11 },
        pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
      };

      expect(() => generateRulerDefinition(config)).toThrow('Invalid page width: 0');
    });

    it('throws error for negative page width', () => {
      const config: RulerConfig = {
        pageSize: { width: -8.5, height: 11 },
        pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
      };

      expect(() => generateRulerDefinition(config)).toThrow('Invalid page width: -8.5');
    });

    it('throws error for non-positive page height', () => {
      const config: RulerConfig = {
        pageSize: { width: 8.5, height: 0 },
        pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
      };

      expect(() => generateRulerDefinition(config)).toThrow('Invalid page height: 0');
    });

    it('throws error for negative left margin', () => {
      const config: RulerConfig = {
        pageSize: { width: 8.5, height: 11 },
        pageMargins: { left: -1, right: 1, top: 1, bottom: 1 },
      };

      expect(() => generateRulerDefinition(config)).toThrow('Invalid left margin: -1');
    });

    it('throws error for negative right margin', () => {
      const config: RulerConfig = {
        pageSize: { width: 8.5, height: 11 },
        pageMargins: { left: 1, right: -1, top: 1, bottom: 1 },
      };

      expect(() => generateRulerDefinition(config)).toThrow('Invalid right margin: -1');
    });

    it('throws error when margins exceed page width', () => {
      const config: RulerConfig = {
        pageSize: { width: 8.5, height: 11 },
        pageMargins: { left: 5, right: 4, top: 1, bottom: 1 },
      };

      expect(() => generateRulerDefinition(config)).toThrow(
        'Invalid margins: left (5) + right (4) must be less than page width (8.5)',
      );
    });

    it('throws error when margins equal page width', () => {
      const config: RulerConfig = {
        pageSize: { width: 8.5, height: 11 },
        pageMargins: { left: 4.25, right: 4.25, top: 1, bottom: 1 },
      };

      expect(() => generateRulerDefinition(config)).toThrow('Invalid margins');
    });
  });
});

describe('generateRulerDefinitionFromPx', () => {
  it('generates correct ruler for pixel-based input', () => {
    const config: RulerConfigPx = {
      pageWidthPx: 816, // 8.5 inches * 96
      pageHeightPx: 1056, // 11 inches * 96
      leftMarginPx: 96, // 1 inch * 96
      rightMarginPx: 96, // 1 inch * 96
    };

    const ruler = generateRulerDefinitionFromPx(config);

    expect(ruler.widthPx).toBe(816);
    expect(ruler.heightPx).toBe(25); // default
    expect(ruler.leftMarginPx).toBe(96);
    expect(ruler.rightMarginPx).toBe(720); // 816 - 96
    expect(ruler.pageWidthInches).toBeCloseTo(8.5, 2);
    expect(ruler.ticks.length).toBe(69); // Same as 8.5 inch page
  });

  it('uses custom PPI for tick spacing', () => {
    const config: RulerConfigPx = {
      pageWidthPx: 612, // 8.5 inches * 72
      pageHeightPx: 792, // 11 inches * 72
      leftMarginPx: 72, // 1 inch * 72
      rightMarginPx: 72, // 1 inch * 72
      ppi: 72,
    };

    const ruler = generateRulerDefinitionFromPx(config);

    expect(ruler.widthPx).toBe(612);
    expect(ruler.pageWidthInches).toBeCloseTo(8.5, 2);
    // Ticks should still be based on inch divisions
    expect(ruler.ticks.length).toBe(69);
  });

  it('uses custom ruler height when provided', () => {
    const config: RulerConfigPx = {
      pageWidthPx: 816,
      pageHeightPx: 1056,
      leftMarginPx: 96,
      rightMarginPx: 96,
      heightPx: 40,
    };

    const ruler = generateRulerDefinitionFromPx(config);

    expect(ruler.heightPx).toBe(40);
  });

  it('handles zero margins in pixels', () => {
    const config: RulerConfigPx = {
      pageWidthPx: 816,
      pageHeightPx: 1056,
      leftMarginPx: 0,
      rightMarginPx: 0,
    };

    const ruler = generateRulerDefinitionFromPx(config);

    expect(ruler.leftMarginPx).toBe(0);
    expect(ruler.rightMarginPx).toBe(816);
  });

  it('correctly converts right margin (from edge to position)', () => {
    const config: RulerConfigPx = {
      pageWidthPx: 816,
      pageHeightPx: 1056,
      leftMarginPx: 96,
      rightMarginPx: 144, // 1.5 inches from right edge
    };

    const ruler = generateRulerDefinitionFromPx(config);

    // rightMarginPx in output is position from left, not from right
    expect(ruler.rightMarginPx).toBe(672); // 816 - 144
  });

  describe('input validation', () => {
    it('throws error for non-positive PPI', () => {
      const config: RulerConfigPx = {
        pageWidthPx: 816,
        pageHeightPx: 1056,
        leftMarginPx: 96,
        rightMarginPx: 96,
        ppi: 0,
      };

      expect(() => generateRulerDefinitionFromPx(config)).toThrow('Invalid PPI: 0');
    });

    it('throws error for non-positive page width', () => {
      const config: RulerConfigPx = {
        pageWidthPx: 0,
        pageHeightPx: 1056,
        leftMarginPx: 96,
        rightMarginPx: 96,
      };

      expect(() => generateRulerDefinitionFromPx(config)).toThrow('Invalid page width: 0px');
    });

    it('throws error for non-positive page height', () => {
      const config: RulerConfigPx = {
        pageWidthPx: 816,
        pageHeightPx: 0,
        leftMarginPx: 96,
        rightMarginPx: 96,
      };

      expect(() => generateRulerDefinitionFromPx(config)).toThrow('Invalid page height: 0px');
    });

    it('throws error for negative left margin', () => {
      const config: RulerConfigPx = {
        pageWidthPx: 816,
        pageHeightPx: 1056,
        leftMarginPx: -96,
        rightMarginPx: 96,
      };

      expect(() => generateRulerDefinitionFromPx(config)).toThrow('Invalid left margin: -96px');
    });

    it('throws error for negative right margin', () => {
      const config: RulerConfigPx = {
        pageWidthPx: 816,
        pageHeightPx: 1056,
        leftMarginPx: 96,
        rightMarginPx: -96,
      };

      expect(() => generateRulerDefinitionFromPx(config)).toThrow('Invalid right margin: -96px');
    });

    it('throws error when margins exceed page width', () => {
      const config: RulerConfigPx = {
        pageWidthPx: 816,
        pageHeightPx: 1056,
        leftMarginPx: 500,
        rightMarginPx: 400,
      };

      expect(() => generateRulerDefinitionFromPx(config)).toThrow(
        'Invalid margins: left (500px) + right (400px) must be less than page width (816px)',
      );
    });
  });
});

describe('pxToInches', () => {
  it('converts pixels to inches with default PPI', () => {
    expect(pxToInches(96)).toBe(1);
    expect(pxToInches(192)).toBe(2);
    expect(pxToInches(48)).toBe(0.5);
  });

  it('converts pixels to inches with custom PPI', () => {
    expect(pxToInches(72, 72)).toBe(1);
    expect(pxToInches(144, 72)).toBe(2);
    expect(pxToInches(36, 72)).toBe(0.5);
  });

  it('handles zero pixels', () => {
    expect(pxToInches(0)).toBe(0);
  });

  it('handles fractional pixels', () => {
    expect(pxToInches(12)).toBeCloseTo(0.125, 3); // 1/8 inch
    expect(pxToInches(24)).toBeCloseTo(0.25, 3); // 1/4 inch
  });

  it('handles negative pixels', () => {
    expect(pxToInches(-96)).toBe(-1);
  });

  it('handles very large pixel values', () => {
    expect(pxToInches(9600)).toBe(100);
  });
});

describe('inchesToPx', () => {
  it('converts inches to pixels with default PPI', () => {
    expect(inchesToPx(1)).toBe(96);
    expect(inchesToPx(2)).toBe(192);
    expect(inchesToPx(0.5)).toBe(48);
  });

  it('converts inches to pixels with custom PPI', () => {
    expect(inchesToPx(1, 72)).toBe(72);
    expect(inchesToPx(2, 72)).toBe(144);
    expect(inchesToPx(0.5, 72)).toBe(36);
  });

  it('handles zero inches', () => {
    expect(inchesToPx(0)).toBe(0);
  });

  it('handles fractional inches', () => {
    expect(inchesToPx(0.125)).toBe(12); // 1/8 inch
    expect(inchesToPx(0.25)).toBe(24); // 1/4 inch
  });

  it('handles negative inches', () => {
    expect(inchesToPx(-1)).toBe(-96);
  });

  it('is inverse of pxToInches', () => {
    expect(inchesToPx(pxToInches(100))).toBeCloseTo(100, 10);
    expect(pxToInches(inchesToPx(5))).toBeCloseTo(5, 10);
  });
});

describe('calculateMarginFromHandle', () => {
  it('calculates left margin from handle position', () => {
    const handleX = 96; // 1 inch
    const margin = calculateMarginFromHandle(handleX, 'left', 816);

    expect(margin).toBe(1);
  });

  it('calculates right margin from handle position', () => {
    const pageWidthPx = 816; // 8.5 inches
    const handleX = 720; // 7.5 inches from left = 1 inch from right
    const margin = calculateMarginFromHandle(handleX, 'right', pageWidthPx);

    expect(margin).toBe(1);
  });

  it('uses custom PPI for left margin', () => {
    const handleX = 72; // 1 inch at 72 PPI
    const margin = calculateMarginFromHandle(handleX, 'left', 612, 72);

    expect(margin).toBe(1);
  });

  it('uses custom PPI for right margin', () => {
    const pageWidthPx = 612; // 8.5 inches at 72 PPI
    const handleX = 540; // 7.5 inches from left = 1 inch from right
    const margin = calculateMarginFromHandle(handleX, 'right', pageWidthPx, 72);

    expect(margin).toBe(1);
  });

  it('handles zero position for left margin', () => {
    const margin = calculateMarginFromHandle(0, 'left', 816);
    expect(margin).toBe(0);
  });

  it('handles full width position for right margin', () => {
    const pageWidthPx = 816;
    const margin = calculateMarginFromHandle(pageWidthPx, 'right', pageWidthPx);
    expect(margin).toBe(0);
  });

  it('handles fractional positions', () => {
    const handleX = 48; // 0.5 inches
    const margin = calculateMarginFromHandle(handleX, 'left', 816);
    expect(margin).toBe(0.5);
  });
});

describe('clampHandlePosition', () => {
  const pageWidthPx = 816; // 8.5 inches

  describe('left handle', () => {
    it('clamps to minimum of 0', () => {
      const clamped = clampHandlePosition(-50, 'left', 600, pageWidthPx);
      expect(clamped).toBe(0);
    });

    it('clamps to maximum based on right handle and min content width', () => {
      const rightHandleX = 600;
      const minContentWidthPx = 200;
      const clamped = clampHandlePosition(500, 'left', rightHandleX, pageWidthPx, minContentWidthPx);

      // Max for left handle = rightHandleX - minContentWidthPx = 600 - 200 = 400
      expect(clamped).toBe(400);
    });

    it('allows valid position within bounds', () => {
      const rightHandleX = 600;
      const minContentWidthPx = 200;
      const clamped = clampHandlePosition(300, 'left', rightHandleX, pageWidthPx, minContentWidthPx);

      expect(clamped).toBe(300);
    });

    it('enforces minimum content width', () => {
      const rightHandleX = 300;
      const minContentWidthPx = 200;
      const clamped = clampHandlePosition(200, 'left', rightHandleX, pageWidthPx, minContentWidthPx);

      // Max for left handle = 300 - 200 = 100
      expect(clamped).toBe(100);
    });
  });

  describe('right handle', () => {
    it('clamps to minimum based on left handle and min content width', () => {
      const leftHandleX = 200;
      const minContentWidthPx = 200;
      const clamped = clampHandlePosition(300, 'right', leftHandleX, pageWidthPx, minContentWidthPx);

      // Min for right handle = leftHandleX + minContentWidthPx = 200 + 200 = 400
      expect(clamped).toBe(400);
    });

    it('clamps to maximum of page width', () => {
      const leftHandleX = 200;
      const clamped = clampHandlePosition(1000, 'right', leftHandleX, pageWidthPx);

      expect(clamped).toBe(pageWidthPx);
    });

    it('allows valid position within bounds', () => {
      const leftHandleX = 200;
      const minContentWidthPx = 200;
      const clamped = clampHandlePosition(600, 'right', leftHandleX, pageWidthPx, minContentWidthPx);

      expect(clamped).toBe(600);
    });

    it('enforces minimum content width', () => {
      const leftHandleX = 500;
      const minContentWidthPx = 200;
      const clamped = clampHandlePosition(650, 'right', leftHandleX, pageWidthPx, minContentWidthPx);

      // Min for right handle = 500 + 200 = 700
      expect(clamped).toBe(700);
    });
  });

  describe('custom minimum content width', () => {
    it('respects custom minimum content width of 100px', () => {
      const leftHandleX = 300;
      const rightHandleX = 450;
      const minContentWidthPx = 100;

      const clampedLeft = clampHandlePosition(400, 'left', rightHandleX, pageWidthPx, minContentWidthPx);
      expect(clampedLeft).toBe(350); // 450 - 100

      const clampedRight = clampHandlePosition(350, 'right', leftHandleX, pageWidthPx, minContentWidthPx);
      expect(clampedRight).toBe(400); // 300 + 100
    });

    it('respects default minimum content width of 200px', () => {
      const leftHandleX = 300;
      const rightHandleX = 600;

      const clampedLeft = clampHandlePosition(500, 'left', rightHandleX, pageWidthPx);
      expect(clampedLeft).toBe(400); // 600 - 200

      const clampedRight = clampHandlePosition(400, 'right', leftHandleX, pageWidthPx);
      expect(clampedRight).toBe(500); // 300 + 200
    });
  });

  describe('input validation', () => {
    it('throws error for non-finite handleX', () => {
      expect(() => clampHandlePosition(NaN, 'left', 600, pageWidthPx)).toThrow('Invalid handleX: NaN');
      expect(() => clampHandlePosition(Infinity, 'left', 600, pageWidthPx)).toThrow('Invalid handleX: Infinity');
    });

    it('throws error for non-finite otherHandleX', () => {
      expect(() => clampHandlePosition(300, 'left', NaN, pageWidthPx)).toThrow('Invalid otherHandleX: NaN');
      expect(() => clampHandlePosition(300, 'left', Infinity, pageWidthPx)).toThrow('Invalid otherHandleX: Infinity');
    });

    it('throws error for non-finite pageWidthPx', () => {
      expect(() => clampHandlePosition(300, 'left', 600, NaN)).toThrow('Invalid pageWidthPx: NaN');
      expect(() => clampHandlePosition(300, 'left', 600, Infinity)).toThrow('Invalid pageWidthPx: Infinity');
    });

    it('throws error for non-finite minContentWidthPx', () => {
      expect(() => clampHandlePosition(300, 'left', 600, pageWidthPx, NaN)).toThrow('Invalid minContentWidthPx: NaN');
      expect(() => clampHandlePosition(300, 'left', 600, pageWidthPx, Infinity)).toThrow(
        'Invalid minContentWidthPx: Infinity',
      );
    });
  });
});

describe('createHandleStates', () => {
  it('creates initial handle states from ruler definition', () => {
    const definition: RulerDefinition = {
      widthPx: 816,
      heightPx: 25,
      ticks: [],
      leftMarginPx: 96,
      rightMarginPx: 720,
      pageWidthInches: 8.5,
    };

    const handles = createHandleStates(definition);

    expect(handles.left).toEqual({
      side: 'left',
      x: 96,
      isDragging: false,
      initialX: 96,
    });

    expect(handles.right).toEqual({
      side: 'right',
      x: 720,
      isDragging: false,
      initialX: 720,
    });
  });

  it('creates handles with zero margins', () => {
    const definition: RulerDefinition = {
      widthPx: 816,
      heightPx: 25,
      ticks: [],
      leftMarginPx: 0,
      rightMarginPx: 816,
      pageWidthInches: 8.5,
    };

    const handles = createHandleStates(definition);

    expect(handles.left.x).toBe(0);
    expect(handles.right.x).toBe(816);
  });

  it('sets isDragging to false by default', () => {
    const definition: RulerDefinition = {
      widthPx: 816,
      heightPx: 25,
      ticks: [],
      leftMarginPx: 96,
      rightMarginPx: 720,
      pageWidthInches: 8.5,
    };

    const handles = createHandleStates(definition);

    expect(handles.left.isDragging).toBe(false);
    expect(handles.right.isDragging).toBe(false);
  });

  it('initializes initialX with current x position', () => {
    const definition: RulerDefinition = {
      widthPx: 816,
      heightPx: 25,
      ticks: [],
      leftMarginPx: 144,
      rightMarginPx: 672,
      pageWidthInches: 8.5,
    };

    const handles = createHandleStates(definition);

    expect(handles.left.initialX).toBe(144);
    expect(handles.right.initialX).toBe(672);
  });
});

describe('measurement unit (cm)', () => {
  it('defaults to inch ticks when no unit is given (unchanged behaviour)', () => {
    const inchDefault = generateRulerDefinitionFromPx({
      pageWidthPx: 8.5 * 96,
      pageHeightPx: 11 * 96,
      leftMarginPx: 96,
      rightMarginPx: 96,
    });
    const inchExplicit = generateRulerDefinitionFromPx({
      pageWidthPx: 8.5 * 96,
      pageHeightPx: 11 * 96,
      leftMarginPx: 96,
      rightMarginPx: 96,
      unit: 'in',
    });
    // 8 full inches (8 ticks each) + last half inch (5 ticks) = 69, as in inch mode.
    expect(inchDefault.ticks.length).toBe(69);
    expect(inchDefault.ticks).toEqual(inchExplicit.ticks);
  });

  it('labels main ticks in whole centimetres, spaced ppi/2.54 apart', () => {
    const ruler = generateRulerDefinitionFromPx({
      pageWidthPx: 8.5 * 96, // 816px ≈ 21.59 cm
      pageHeightPx: 11 * 96,
      leftMarginPx: 96,
      rightMarginPx: 96,
      unit: 'cm',
    });
    const cmPx = 96 / 2.54;
    const mainTicks = ruler.ticks.filter((t) => t.size === 'main');
    // 816px / (96/2.54) ≈ 21.59 → main ticks at 0..21 cm = 22 labels.
    expect(mainTicks.length).toBe(22);
    expect(mainTicks[0]).toMatchObject({ label: 0, x: 0 });
    expect(mainTicks[1].label).toBe(1);
    expect(mainTicks[1].x).toBeCloseTo(cmPx, 6);
    expect(mainTicks[2].x).toBeCloseTo(2 * cmPx, 6);
    // Half-cm ticks fall between the whole-cm mains.
    const halfTicks = ruler.ticks.filter((t) => t.size === 'half');
    expect(halfTicks[0].x).toBeCloseTo(cmPx / 2, 6);
    // cm mode never emits the inch-only eighth ticks.
    expect(ruler.ticks.some((t) => t.size === 'eighth')).toBe(false);
  });

  it('spaces inch ticks by ppi/8 for a non-96 ppi', () => {
    // At ppi=144 the eighth-inch spacing is 144/8 = 18px, so main ticks land
    // on multiples of 144 and eighth ticks on multiples of 18.
    const ppi = 144;
    const eighthPx = ppi / 8; // 18
    const ruler = generateRulerDefinition({
      pageSize: { width: 3, height: 11 },
      pageMargins: { left: 0, right: 0, top: 0, bottom: 0 },
      ppi,
      unit: 'in',
    });

    // First tick at the origin.
    expect(ruler.ticks[0]).toMatchObject({ size: 'main', label: 0, x: 0 });
    // Eighth tick immediately after the first main tick sits at one eighth.
    expect(ruler.ticks[1]).toMatchObject({ size: 'eighth', x: eighthPx });

    // Main ticks fall on whole-inch multiples of ppi (0, 144, 288...).
    const mainTicks = ruler.ticks.filter((t) => t.size === 'main');
    expect(mainTicks.map((t) => t.x)).toEqual([0, ppi, 2 * ppi]);
    expect(mainTicks.map((t) => t.label)).toEqual([0, 1, 2]);

    // Half ticks fall exactly midway between the whole-inch mains.
    const halfTicks = ruler.ticks.filter((t) => t.size === 'half');
    expect(halfTicks.map((t) => t.x)).toEqual([ppi / 2, ppi + ppi / 2, 2 * ppi + ppi / 2]);
  });

  it('keeps inch tick positions byte-identical to the historical 12px spacing at ppi=96', () => {
    // Guards that the ppi-aware inch spacing reproduces the old fixed 12px
    // spacing (96/8) exactly when no custom ppi is supplied.
    const config: RulerConfig = {
      pageSize: { width: 2, height: 11 },
      pageMargins: { left: 0, right: 0, top: 0, bottom: 0 },
    };
    const explicit96 = generateRulerDefinition({ ...config, ppi: 96 });
    const defaultPpi = generateRulerDefinition(config);

    expect(defaultPpi.ticks).toEqual(explicit96.ticks);
    // Spot-check the first few positions against the literal 12px grid.
    expect(defaultPpi.ticks.slice(0, 5).map((t) => t.x)).toEqual([0, 12, 24, 36, 48]);
  });
});
