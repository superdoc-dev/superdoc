import { describe, expect, it, vi } from 'vitest';
import type { FieldAnnotationRun } from '@superdoc/contracts';
import { renderFieldAnnotationRun } from './field-annotation-run.js';
import type { RunRenderContext } from './types.js';

/**
 * Minimal render context for the field-annotation paint path. The text variant only reads
 * `doc`, `layoutEpoch`, `resolvePhysical`, and `applySdtDataset`; the rest are stubbed so the
 * unit stays focused on font resolution.
 */
function makeContext(
  resolvePhysical: (cssFontFamily: string, face: { weight: '400' | '700'; style: 'normal' | 'italic' }) => string,
): RunRenderContext {
  const doc = document.implementation.createHTMLDocument('field-annotation');
  return {
    doc,
    layoutEpoch: 0,
    showFormattingMarks: false,
    contentControlsChrome: 'default',
    resolvePhysical,
    pendingTooltips: new WeakMap(),
    getNextLinkId: () => 'link-0',
    applySdtDataset: () => {},
    buildImageHyperlinkAnchor: (child: HTMLElement) => child,
    resolveTrackedChangesConfig: () => ({}),
    applyTrackedChangeDecorations: () => {},
    resolveRunSdtId: () => null,
    createInlineSdtWrapper: () => doc.createElement('span'),
    syncInlineSdtWrapperTypography: () => {},
    expandSdtWrapperPmRange: () => {},
  } as unknown as RunRenderContext;
}

describe('renderFieldAnnotationRun font resolution', () => {
  it('paints a fontless annotation through the same fallback the measure path resolves', () => {
    // The measure path resolves `run.fontFamily || 'Arial, sans-serif'`; paint must resolve the SAME
    // fallback (not inherit host CSS) so the pill's painted glyphs match its measured width.
    const resolvePhysical = vi.fn((family: string, _face: { weight: '400' | '700'; style: 'normal' | 'italic' }) =>
      family === 'Arial, sans-serif' ? 'Liberation Sans, sans-serif' : family,
    );
    const run: FieldAnnotationRun = {
      kind: 'fieldAnnotation',
      variant: 'text',
      displayLabel: 'Client',
      pmStart: 0,
      pmEnd: 1,
    };

    const el = renderFieldAnnotationRun(run, makeContext(resolvePhysical));

    expect(resolvePhysical).toHaveBeenCalledWith('Arial, sans-serif', { weight: '400', style: 'normal' });
    expect(el?.style.fontFamily).toContain('Liberation Sans');
  });

  it('resolves an explicit logical family through the render-context resolver', () => {
    const resolvePhysical = vi.fn((family: string, _face: { weight: '400' | '700'; style: 'normal' | 'italic' }) =>
      family === 'Calibri' ? 'Carlito' : family,
    );
    const run: FieldAnnotationRun = {
      kind: 'fieldAnnotation',
      variant: 'text',
      displayLabel: 'Name',
      fontFamily: 'Calibri',
      pmStart: 0,
      pmEnd: 1,
    };

    const el = renderFieldAnnotationRun(run, makeContext(resolvePhysical));

    expect(resolvePhysical).toHaveBeenCalledWith('Calibri', { weight: '400', style: 'normal' });
    expect(el?.style.fontFamily).toContain('Carlito');
  });
});
