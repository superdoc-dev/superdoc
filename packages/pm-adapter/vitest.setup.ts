import { resolveCanvas } from '@superdoc/measuring-dom/canvas-resolver';
import { installNodeCanvasPolyfill } from '@superdoc/measuring-dom';

const { Canvas } = resolveCanvas();

installNodeCanvasPolyfill({
  document,
  Canvas,
});
