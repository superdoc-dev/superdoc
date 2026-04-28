import { describe, expect, it } from 'vitest';
import { hydrateTableStyleAttrs } from './table-styles.js';
import type { PMNode } from '../types.js';
import type { ConverterContext } from '../converter-context.js';
import type { StylesDocumentProperties } from '@superdoc/style-engine/ooxml';

const emptyStyles: StylesDocumentProperties = { docDefaults: {}, latentStyles: {}, styles: {} };
const PX_PER_PT = 96 / 72;

const buildContext = (styles?: StylesDocumentProperties): ConverterContext =>
  ({
    translatedLinkedStyles: styles ?? emptyStyles,
    translatedNumbering: { abstracts: {}, definitions: {} },
  }) as ConverterContext;

describe('hydrateTableStyleAttrs', () => {
  it('hydrates from tableProperties even without converter context', () => {
    const table = {
      attrs: {
        tableProperties: {
          cellMargins: {
            marginLeft: { value: 108, type: 'dxa' },
            top: { value: 12, type: 'px' },
          },
          tableCellSpacing: { value: 24, type: 'dxa' },
          tableIndent: { value: 1440, type: 'dxa' },
          tableLayout: 'fixed',
          tableWidth: { value: 1440, type: 'dxa' },
        },
      },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, undefined);
    expect(result?.cellPadding?.left).toBeCloseTo((108 / 1440) * 96);
    expect(result?.cellPadding?.top).toBe(12);
    expect(result?.tableCellSpacing).toEqual({ value: 24, type: 'dxa' });
    expect(result?.tableIndent).toEqual({ width: 96, type: 'dxa' });
    expect(result?.tableLayout).toBe('fixed');
    expect(result?.tableWidth).toEqual({ width: 96, type: 'px' });
  });

  it('merges style-resolved properties when context available', () => {
    const styles: StylesDocumentProperties = {
      ...emptyStyles,
      styles: {
        TableGrid: {
          type: 'table',
          tableProperties: {
            borders: { top: { val: 'single', size: 8 } } as Record<string, unknown>,
            cellMargins: { marginLeft: { value: 72, type: 'dxa' } },
            justification: 'center',
            tableCellSpacing: { value: 24, type: 'dxa' },
            tableIndent: { value: 720, type: 'dxa' },
            tableLayout: 'autofit',
          },
        },
      },
    };

    const table = {
      attrs: {
        tableStyleId: 'TableGrid',
        tableProperties: {
          tableWidth: { value: 500, type: 'px' },
        },
      },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, buildContext(styles));
    expect(result?.borders?.top?.style).toBe('single');
    expect(result?.borders?.top?.width).toBeCloseTo((8 / 8) * PX_PER_PT);
    expect(result?.justification).toBe('center');
    expect(result?.cellPadding?.left).toBeCloseTo((72 / 1440) * 96);
    expect(result?.tableCellSpacing).toEqual({ value: 24, type: 'dxa' });
    expect(result?.tableIndent).toEqual({ width: 48, type: 'dxa' });
    expect(result?.tableLayout).toBe('autofit');
    expect(result?.tableWidth).toEqual({ width: 500, type: 'px' });
  });

  it('inline properties take precedence over style-resolved properties', () => {
    const styles: StylesDocumentProperties = {
      ...emptyStyles,
      styles: {
        TableGrid: {
          type: 'table',
          tableProperties: {
            borders: { top: { val: 'single', size: 4 } } as Record<string, unknown>,
            justification: 'center',
            tableCellSpacing: { value: 24, type: 'dxa' },
            tableIndent: { value: 720, type: 'dxa' },
            tableLayout: 'autofit',
          },
        },
      },
    };

    const table = {
      attrs: {
        tableStyleId: 'TableGrid',
        tableProperties: {
          borders: { top: { val: 'single', size: 12 } },
          justification: 'left',
          tableCellSpacing: { value: 12, type: 'dxa' },
          tableIndent: { value: 1440, type: 'dxa' },
          tableLayout: 'fixed',
        },
      },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, buildContext(styles));
    // Inline borders win over style
    expect(result?.borders?.top?.style).toBe('single');
    expect(result?.borders?.top?.width).toBeCloseTo((12 / 8) * PX_PER_PT);
    // Inline justification wins over style
    expect(result?.justification).toBe('left');
    expect(result?.tableCellSpacing).toEqual({ value: 12, type: 'dxa' });
    expect(result?.tableIndent).toEqual({ width: 96, type: 'dxa' });
    expect(result?.tableLayout).toBe('fixed');
  });

  it("preserves the OOXML 'auto' tableLayout literal during hydration", () => {
    const styles: StylesDocumentProperties = {
      ...emptyStyles,
      styles: {
        TableGrid: {
          type: 'table',
          tableProperties: {
            tableLayout: 'auto',
          },
        },
      },
    };

    const table = {
      attrs: {
        tableStyleId: 'TableGrid',
      },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, buildContext(styles));
    expect(result?.tableLayout).toBe('auto');
  });

  it('per-side merge: partial inline borders preserve style borders on other sides', () => {
    const styles: StylesDocumentProperties = {
      ...emptyStyles,
      styles: {
        TableGrid: {
          type: 'table',
          tableProperties: {
            borders: {
              top: { val: 'single', size: 4 },
              bottom: { val: 'single', size: 4 },
              left: { val: 'single', size: 4 },
              right: { val: 'single', size: 4 },
            } as Record<string, unknown>,
          },
        },
      },
    };

    const table = {
      attrs: {
        tableStyleId: 'TableGrid',
        tableProperties: {
          borders: { top: { val: 'double', size: 8 } },
        },
      },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, buildContext(styles));
    // Inline top wins
    expect(result?.borders?.top?.style).toBe('double');
    expect(result?.borders?.top?.width).toBeCloseTo((8 / 8) * PX_PER_PT);
    // Style fills other sides
    expect(result?.borders?.bottom?.style).toBe('single');
    expect(result?.borders?.bottom?.width).toBeCloseTo((4 / 8) * PX_PER_PT);
    expect(result?.borders?.left?.style).toBe('single');
    expect(result?.borders?.left?.width).toBeCloseTo((4 / 8) * PX_PER_PT);
    expect(result?.borders?.right?.style).toBe('single');
    expect(result?.borders?.right?.width).toBeCloseTo((4 / 8) * PX_PER_PT);
  });

  it('per-side merge: partial inline cellPadding preserves style padding on other sides', () => {
    const styles: StylesDocumentProperties = {
      ...emptyStyles,
      styles: {
        TableGrid: {
          type: 'table',
          tableProperties: {
            cellMargins: {
              marginTop: { value: 72, type: 'dxa' },
              marginBottom: { value: 72, type: 'dxa' },
              marginLeft: { value: 108, type: 'dxa' },
              marginRight: { value: 108, type: 'dxa' },
            },
          },
        },
      },
    };

    const table = {
      attrs: {
        tableStyleId: 'TableGrid',
        tableProperties: {
          cellMargins: {
            marginLeft: { value: 50, type: 'px' },
          },
        },
      },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, buildContext(styles));
    // Inline left wins
    expect(result?.cellPadding?.left).toBe(50);
    // Style fills other sides
    expect(result?.cellPadding?.top).toBeCloseTo((72 / 1440) * 96);
    expect(result?.cellPadding?.bottom).toBeCloseTo((72 / 1440) * 96);
    expect(result?.cellPadding?.right).toBeCloseTo((108 / 1440) * 96);
  });

  it('returns null when no properties found', () => {
    const table = { attrs: {} } as unknown as PMNode;
    const result = hydrateTableStyleAttrs(table, undefined);
    expect(result).toBeNull();
  });

  it('resolves style via effectiveStyleId parameter', () => {
    const styles: StylesDocumentProperties = {
      ...emptyStyles,
      styles: {
        MyCustomStyle: {
          type: 'table',
          tableProperties: {
            justification: 'right',
          },
        },
      },
    };

    const table = {
      attrs: { tableStyleId: 'NonexistentStyle' },
    } as unknown as PMNode;

    // Pass effectiveStyleId directly — overrides the node's tableStyleId
    const result = hydrateTableStyleAttrs(table, buildContext(styles), 'MyCustomStyle');
    expect(result?.justification).toBe('right');
  });

  it('follows basedOn chain for table properties', () => {
    const styles: StylesDocumentProperties = {
      ...emptyStyles,
      styles: {
        TableNormal: {
          type: 'table',
          tableProperties: {
            cellMargins: { marginLeft: { value: 108, type: 'dxa' } },
            justification: 'left',
          },
        },
        TableGrid: {
          type: 'table',
          basedOn: 'TableNormal',
          tableProperties: {
            borders: { top: { val: 'single', size: 4 } } as Record<string, unknown>,
          },
        },
      },
    };

    const table = {
      attrs: { tableStyleId: 'TableGrid' },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, buildContext(styles));
    // From TableGrid
    expect(result?.borders?.top?.style).toBe('single');
    expect(result?.borders?.top?.width).toBeCloseTo((4 / 8) * PX_PER_PT);
    // Inherited from TableNormal via basedOn
    expect(result?.cellPadding?.left).toBeCloseTo((108 / 1440) * 96);
    expect(result?.justification).toBe('left');
  });

  it('does not fall back to raw tableStyleId when effectiveStyleId is null', () => {
    const styles: StylesDocumentProperties = {
      ...emptyStyles,
      styles: {
        SomeStyle: {
          type: 'table',
          tableProperties: {
            justification: 'center',
          },
        },
      },
    };

    const table = {
      attrs: { tableStyleId: 'SomeStyle' },
    } as unknown as PMNode;

    // effectiveStyleId = null means "resolver found no valid style"
    const result = hydrateTableStyleAttrs(table, buildContext(styles), null);
    // Should NOT resolve SomeStyle even though it's on the raw node
    expect(result).toBeNull();
  });

  it('handles marginStart/marginEnd for RTL table direction support', () => {
    const styles: StylesDocumentProperties = {
      ...emptyStyles,
      styles: {
        TableGrid: {
          type: 'table',
          tableProperties: {
            cellMargins: {
              marginStart: { value: 100, type: 'dxa' },
              marginEnd: { value: 200, type: 'dxa' },
            },
          },
        },
      },
    };

    const table = {
      attrs: { tableStyleId: 'TableGrid' },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, buildContext(styles));
    // marginStart maps to left, marginEnd maps to right
    expect(result?.cellPadding?.left).toBeCloseTo((100 / 1440) * 96);
    expect(result?.cellPadding?.right).toBeCloseTo((200 / 1440) * 96);
  });
});
