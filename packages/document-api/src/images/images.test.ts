import { describe, expect, it, mock } from 'bun:test';
import { DocumentApiValidationError } from '../errors.js';
import { executeImagesSetZOrder, type ImagesAdapter } from './images.js';
import { Z_ORDER_RELATIVE_HEIGHT_MAX, Z_ORDER_RELATIVE_HEIGHT_MIN } from './z-order.js';

function makeSetZOrderAdapter() {
  const setZOrder = mock(() => ({
    success: true as const,
    image: {
      kind: 'inline' as const,
      nodeType: 'image' as const,
      nodeId: 'img-1',
      placement: 'floating' as const,
    },
  }));

  const adapter = { setZOrder } as unknown as ImagesAdapter;
  return { adapter, setZOrder };
}

describe('executeImagesSetZOrder', () => {
  it('accepts minimum valid relativeHeight (0)', () => {
    const { adapter, setZOrder } = makeSetZOrderAdapter();

    executeImagesSetZOrder(adapter, {
      imageId: 'img-1',
      zOrder: { relativeHeight: Z_ORDER_RELATIVE_HEIGHT_MIN },
    });

    expect(setZOrder).toHaveBeenCalledWith(
      {
        imageId: 'img-1',
        zOrder: { relativeHeight: Z_ORDER_RELATIVE_HEIGHT_MIN },
      },
      undefined,
    );
  });

  it('accepts maximum valid relativeHeight (4294967295)', () => {
    const { adapter, setZOrder } = makeSetZOrderAdapter();

    executeImagesSetZOrder(adapter, {
      imageId: 'img-1',
      zOrder: { relativeHeight: Z_ORDER_RELATIVE_HEIGHT_MAX },
    });

    expect(setZOrder).toHaveBeenCalledWith(
      {
        imageId: 'img-1',
        zOrder: { relativeHeight: Z_ORDER_RELATIVE_HEIGHT_MAX },
      },
      undefined,
    );
  });

  it.each([
    { label: 'fractional number', value: 1.5 },
    { label: 'negative integer', value: -1 },
    { label: 'overflow integer', value: Z_ORDER_RELATIVE_HEIGHT_MAX + 1 },
    { label: 'NaN', value: Number.NaN },
    { label: 'Infinity', value: Number.POSITIVE_INFINITY },
  ])('rejects invalid relativeHeight: $label', ({ value }) => {
    const { adapter, setZOrder } = makeSetZOrderAdapter();

    let thrown: unknown;
    try {
      executeImagesSetZOrder(adapter, {
        imageId: 'img-1',
        zOrder: { relativeHeight: value },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DocumentApiValidationError);
    expect((thrown as Error).message).toContain('unsigned 32-bit integer');
    expect(setZOrder).not.toHaveBeenCalled();
  });

  it('rejects missing zOrder object', () => {
    const { adapter, setZOrder } = makeSetZOrderAdapter();

    expect(() =>
      executeImagesSetZOrder(adapter, {
        imageId: 'img-1',
        zOrder: undefined as unknown as { relativeHeight: number },
      }),
    ).toThrow('requires a "zOrder" object');

    expect(setZOrder).not.toHaveBeenCalled();
  });
});
