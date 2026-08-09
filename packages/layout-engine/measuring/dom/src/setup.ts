/**
 * Helper to patch a jsdom document with a node-canvas powered context.
 * Call once during headless bootstrap so downstream measurer code can
 * rely on `document.createElement('canvas')`.
 */

type CanvasConstructor = new (
  width?: number,
  height?: number,
) => {
  getContext(type: '2d'): CanvasRenderingContext2D;
};

const PATCHED_FLAG = Symbol('superdocCanvasPatched');

export function installNodeCanvasPolyfill({
  document,
  Canvas,
  width = 1024,
  height = 768,
}: {
  document: Document;
  Canvas: CanvasConstructor;
  width?: number;
  height?: number;
}): void {
  const defaultView = document.defaultView;
  if (!defaultView) {
    throw new Error('installNodeCanvasPolyfill: document.defaultView is missing');
  }

  const CanvasElement = defaultView.HTMLCanvasElement;
  if (!CanvasElement) {
    throw new Error('installNodeCanvasPolyfill: HTMLCanvasElement is not available');
  }

  const proto = CanvasElement.prototype as typeof CanvasElement.prototype & {
    [PATCHED_FLAG]?: boolean;
  };

  if (proto[PATCHED_FLAG]) {
    return; // already patched
  }

  const originalGetContext = proto.getContext;

  proto.getContext = function getContext(
    this: HTMLCanvasElement,
    contextId: string,
    ...args: unknown[]
  ): RenderingContext | null {
    if (contextId === '2d') {
      const nodeCanvas = new Canvas(width, height);
      return nodeCanvas.getContext('2d');
    }

    if (typeof originalGetContext === 'function') {
      return originalGetContext.call(this, contextId, ...args) as RenderingContext | null;
    }

    return null;
  } as typeof proto.getContext;

  proto[PATCHED_FLAG] = true;
}
