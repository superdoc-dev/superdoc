import type { Locator } from '@playwright/test';

type Point = { x: number; y: number };
type DragPointOptions = {
  /**
   * Offset from the target box's left edge. Defaults to the box center.
   */
  targetOffsetX?: number;
  /**
   * Offset from the target box's top edge. Defaults to the box center.
   */
  targetOffsetY?: number;
};

function centerOf(box: { x: number; y: number; width: number; height: number }): Point {
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

/**
 * Dispatches a native drag-start / drag-over / drop sequence between two
 * rendered elements using the browser's DataTransfer implementation.
 */
export async function dragRenderedElement(
  source: Locator,
  target: Locator,
  options: DragPointOptions = {},
): Promise<void> {
  let sourceBox = await source.boundingBox();
  if (!sourceBox) {
    await source.scrollIntoViewIfNeeded();
    sourceBox = await source.boundingBox();
  }

  let targetBox = await target.boundingBox();
  if (!targetBox) {
    await target.scrollIntoViewIfNeeded();
    targetBox = await target.boundingBox();
  }
  if (!sourceBox) {
    throw new Error('dragRenderedElement: source element is not visible');
  }
  if (!targetBox) {
    throw new Error('dragRenderedElement: target element is not visible');
  }

  const sourcePoint = centerOf(sourceBox);
  const targetPoint = {
    x: options.targetOffsetX !== undefined ? Math.round(targetBox.x + options.targetOffsetX) : centerOf(targetBox).x,
    y: options.targetOffsetY !== undefined ? Math.round(targetBox.y + options.targetOffsetY) : centerOf(targetBox).y,
  };

  await source.evaluate(
    (sourceEl, coords) => {
      const { sourceX, sourceY, targetX, targetY } = coords as {
        sourceX: number;
        sourceY: number;
        targetX: number;
        targetY: number;
      };

      const dataTransfer = new DataTransfer();
      dataTransfer.effectAllowed = 'move';
      sourceEl.dispatchEvent(
        new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          clientX: sourceX,
          clientY: sourceY,
          dataTransfer,
        }),
      );

      const targetEl = document.elementFromPoint(targetX, targetY) as HTMLElement | null;
      if (!targetEl) {
        throw new Error('dragRenderedElement: could not resolve target element from viewport coordinates');
      }

      targetEl.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          clientX: targetX,
          clientY: targetY,
          dataTransfer,
        }),
      );
      targetEl.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: targetX,
          clientY: targetY,
          dataTransfer,
        }),
      );

      sourceEl.dispatchEvent(
        new DragEvent('dragend', {
          bubbles: true,
          cancelable: false,
          clientX: targetX,
          clientY: targetY,
          dataTransfer,
        }),
      );
    },
    {
      sourceX: sourcePoint.x,
      sourceY: sourcePoint.y,
      targetX: targetPoint.x,
      targetY: targetPoint.y,
    },
  );
}
