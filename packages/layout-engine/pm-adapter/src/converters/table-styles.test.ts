import { describe, expect, it } from 'vitest';
import { hydrateTableStyleAttrs } from './table-styles.js';
import type { PMNode } from '../types.js';
import type { ConverterContext } from '../converter-context.js';
import type { StylesDocumentProperties } from '@superdoc/style-engine/ooxml';

const emptyStyles: StylesDocumentProperties = { docDefaults: {}, latentStyles: {}, styles: {} };

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
          tableWidth: { value: 1440, type: 'dxa' },
        },
      },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, undefined);
    expect(result?.cellPadding?.left).toBeCloseTo((108 / 1440) * 96);
    expect(result?.cellPadding?.top).toBe(12);
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
    expect(result?.borders).toEqual({ top: { val: 'single', size: 8 } });
    expect(result?.justification).toBe('center');
    expect(result?.cellPadding?.left).toBeCloseTo((72 / 1440) * 96);
    expect(result?.tableCellSpacing).toEqual({ value: 24, type: 'dxa' });
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
        },
      },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, buildContext(styles));
    // Inline borders win over style
    expect(result?.borders).toEqual({ top: { val: 'single', size: 12 } });
    // Inline justification wins over style
    expect(result?.justification).toBe('left');
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
    expect(result?.borders?.top).toEqual({ val: 'double', size: 8 });
    // Style fills other sides
    expect(result?.borders?.bottom).toEqual({ val: 'single', size: 4 });
    expect(result?.borders?.left).toEqual({ val: 'single', size: 4 });
    expect(result?.borders?.right).toEqual({ val: 'single', size: 4 });
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
    expect(result?.borders).toEqual({ top: { val: 'single', size: 4 } });
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
