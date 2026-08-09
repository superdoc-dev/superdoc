import type { FontMeasureContext } from '@superdoc/font-system';
import { FontMetricsMeasurementCache } from './fontMetricsCache.js';
import { TextWidthMeasurementCache } from './measurementCache.js';

export interface SurfaceMeasurementExecutionControl {
  throwIfAborted?(): void;
  /** Returns null on the allocation-free under-budget path. */
  checkpointIfDue?(): Promise<void> | null;
}

export interface SurfaceMeasurementRuntimeState {
  readonly textWidths: TextWidthMeasurementCache;
  readonly fontMetrics: FontMetricsMeasurementCache;
  canvasContext: CanvasRenderingContext2D | null;
  fontSignature: string | null;
  execution: SurfaceMeasurementExecutionControl | null;
  activeFontContext: FontMeasureContext | null;
  activePass: boolean;
  disposed: boolean;
}

const runtimeByFontContext = new WeakMap<FontMeasureContext, SurfaceMeasurementRuntimeState>();
const runtimeByCanvasContext = new WeakMap<CanvasRenderingContext2D, SurfaceMeasurementRuntimeState>();

export function createSurfaceMeasurementRuntimeState(options: {
  maxTextEntries: number;
  maxEstimatedTextBytes: number;
}): SurfaceMeasurementRuntimeState {
  return {
    textWidths: new TextWidthMeasurementCache({
      maxEntries: options.maxTextEntries,
      maxEstimatedBytes: options.maxEstimatedTextBytes,
    }),
    fontMetrics: new FontMetricsMeasurementCache(),
    canvasContext: null,
    fontSignature: null,
    execution: null,
    activeFontContext: null,
    activePass: false,
    disposed: false,
  };
}

export function getSurfaceMeasurementRuntime(
  fontContext: FontMeasureContext | undefined,
): SurfaceMeasurementRuntimeState | undefined {
  return fontContext ? runtimeByFontContext.get(fontContext) : undefined;
}

export function getSurfaceMeasurementRuntimeForCanvas(
  context: CanvasRenderingContext2D,
): SurfaceMeasurementRuntimeState | undefined {
  return runtimeByCanvasContext.get(context);
}

export function ensureSurfaceMeasurementCanvas(state: SurfaceMeasurementRuntimeState): CanvasRenderingContext2D {
  assertSurfaceMeasurementRuntimeLive(state);
  if (!state.canvasContext) {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas) {
      throw new Error('Canvas not available. Ensure this runs in a DOM environment (browser or jsdom).');
    }
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get 2D context from canvas');
    state.canvasContext = context;
    runtimeByCanvasContext.set(context, state);
  }
  return state.canvasContext;
}

export function bindSurfaceMeasurementPass(
  state: SurfaceMeasurementRuntimeState,
  fontContext: FontMeasureContext,
  execution: SurfaceMeasurementExecutionControl | undefined,
): void {
  assertSurfaceMeasurementRuntimeLive(state);
  if (state.activePass) {
    throw new Error('DomMeasurementRuntime already has an active pass');
  }
  state.execution = execution ?? null;
  state.activeFontContext = fontContext;
  state.activePass = true;
  runtimeByFontContext.set(fontContext, state);
}

export function unbindSurfaceMeasurementPass(
  state: SurfaceMeasurementRuntimeState,
  fontContext: FontMeasureContext,
): void {
  if (runtimeByFontContext.get(fontContext) === state) {
    runtimeByFontContext.delete(fontContext);
  }
  if (state.activeFontContext === fontContext) state.activeFontContext = null;
  state.execution = null;
  state.activePass = false;
}

export function clearSurfaceMeasurementGeneration(
  state: SurfaceMeasurementRuntimeState,
  nextFontSignature: string,
): void {
  assertSurfaceMeasurementRuntimeLive(state);
  if (state.activePass) {
    throw new Error('Cannot change font generation during an active measurement pass');
  }
  if (state.canvasContext) runtimeByCanvasContext.delete(state.canvasContext);
  state.canvasContext = null;
  state.textWidths.clear();
  state.fontMetrics.clear();
  state.fontSignature = nextFontSignature;
}

export function disposeSurfaceMeasurementRuntime(state: SurfaceMeasurementRuntimeState): void {
  if (state.disposed) return;
  if (state.activeFontContext) {
    runtimeByFontContext.delete(state.activeFontContext);
  }
  if (state.canvasContext) runtimeByCanvasContext.delete(state.canvasContext);
  state.activeFontContext = null;
  state.canvasContext = null;
  state.execution = null;
  state.activePass = false;
  state.textWidths.dispose();
  state.fontMetrics.dispose();
  state.disposed = true;
}

export function surfaceMeasurementCheckpointIfDue(fontContext: FontMeasureContext): Promise<void> | null {
  const runtime = runtimeByFontContext.get(fontContext);
  runtime?.execution?.throwIfAborted?.();
  const pending = runtime?.execution?.checkpointIfDue?.() ?? null;
  if (!pending || !runtime) return null;
  return pending.then(() => runtime.execution?.throwIfAborted?.());
}

function assertSurfaceMeasurementRuntimeLive(state: SurfaceMeasurementRuntimeState): void {
  if (state.disposed) {
    throw new Error('DomMeasurementRuntime has been disposed');
  }
}
