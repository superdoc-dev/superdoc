import { describe, expect, it } from 'vite-plus/test';
import type { ImageRun } from '@superdoc/contracts';
import { renderImageRun } from './image-run.js';
import type { RunRenderContext } from './types.js';

const createContext = (doc: Document): RunRenderContext => ({
  doc,
  layoutEpoch: 7,
  showFormattingMarks: false,
  contentControlsChrome: 'default',
  pendingTooltips: new WeakMap(),
  getNextLinkId: () => 'link-1',
  applySdtDataset: () => undefined,
  buildImageHyperlinkAnchor: (child) => child,
  resolveTrackedChangesConfig: () => ({ mode: 'review', enabled: false }),
  applyTrackedChangeDecorations: () => undefined,
  resolveRunSdtId: () => null,
  createInlineSdtWrapper: () => doc.createElement('span'),
  syncInlineSdtWrapperTypography: () => undefined,
  expandSdtWrapperPmRange: () => undefined,
});

describe('renderImageRun fail-closed placeholder', () => {
  it('preserves authored geometry and exposes the owning diagnostic', () => {
    const doc = document.implementation.createHTMLDocument('inline-image-placeholder');
    const run: ImageRun = {
      kind: 'image',
      src: '',
      width: 120,
      height: 48,
      pmStart: 4,
      pmEnd: 5,
      placeholder: {
        diagnosticIds: ['render.media.unsupported-mime'],
        accessibleName: 'Legacy divider image',
      },
    };

    const element = renderImageRun(run, createContext(doc));

    expect(element).not.toBeNull();
    expect(element?.classList.contains('superdoc-placeholder-block')).toBe(true);
    expect(element?.dataset.placeholderDiagnosticIds).toBe('render.media.unsupported-mime');
    expect(element?.getAttribute('role')).toBe('img');
    expect(element?.getAttribute('aria-label')).toBe('Legacy divider image');
    expect(element?.style.width).toBe('120px');
    expect(element?.style.height).toBe('48px');
    expect(element?.dataset.pmStart).toBe('4');
    expect(element?.dataset.pmEnd).toBe('5');
  });
});
