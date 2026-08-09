import { resolveCanvas } from './src/canvas-resolver.js';
import { installNodeCanvasPolyfill } from './src/setup.js';

const { Canvas } = resolveCanvas();

installNodeCanvasPolyfill({
  document,
  Canvas,
});
