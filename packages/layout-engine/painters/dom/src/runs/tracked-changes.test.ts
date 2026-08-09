// IT-1250: painted tracked-change carriers must fail closed on an unknown
// owning story. The projector stamps `storyKey` for every known story
// (including 'body'); when it is missing the painter must NOT default the
// `data-story-key` dataset to 'body', or a header/footer carrier with missing
// story metadata would win body-scoped carrier searches in the host.

import { describe, expect, it } from 'vite-plus/test';
import type { TrackedChangeMeta } from '@superdoc/contracts';
import type { TextRun } from '@superdoc/contracts';
import {
  applyCellTrackedChangeToCell,
  applyRowTrackedChangeToCell,
  applyTrackedChangeDecorations,
} from './tracked-changes.js';
import type { TrackedChangesRenderConfig } from './types.js';

const CONFIG: TrackedChangesRenderConfig = { mode: 'review', enabled: true };

const meta = (storyKey?: string): TrackedChangeMeta =>
  ({
    kind: 'insert',
    id: 'tc-1',
    ...(storyKey ? { storyKey } : {}),
  }) as TrackedChangeMeta;

const el = (): HTMLElement => document.implementation.createHTMLDocument('tc').createElement('div');

describe('tracked-change carrier story-key stamping', () => {
  it('applyTrackedChangeDecorations stamps the projected story key', () => {
    for (const storyKey of ['body', 'hf:rId8']) {
      const elem = el();
      const run = { text: 'x', fontFamily: 'Arial', fontSize: 16, trackedChange: meta(storyKey) } as TextRun;
      applyTrackedChangeDecorations(elem, run, CONFIG);
      expect(elem.dataset.storyKey).toBe(storyKey);
    }
  });

  it('applyTrackedChangeDecorations omits data-story-key when the owning story is unknown', () => {
    const elem = el();
    const run = { text: 'x', fontFamily: 'Arial', fontSize: 16, trackedChange: meta() } as TextRun;
    applyTrackedChangeDecorations(elem, run, CONFIG);
    expect(elem.dataset.trackChangeId).toBe('tc-1');
    expect(elem.dataset.storyKey).toBeUndefined();
  });

  it('applyRowTrackedChangeToCell omits data-story-key when the owning story is unknown', () => {
    const elem = el();
    applyRowTrackedChangeToCell(elem, meta(), CONFIG);
    expect(elem.dataset.trackChangeId).toBe('tc-1');
    expect(elem.dataset.storyKey).toBeUndefined();

    const bodyElem = el();
    applyRowTrackedChangeToCell(bodyElem, meta('body'), CONFIG);
    expect(bodyElem.dataset.storyKey).toBe('body');
  });

  it('applyCellTrackedChangeToCell omits data-story-key when the owning story is unknown', () => {
    const elem = el();
    applyCellTrackedChangeToCell(elem, meta(), CONFIG);
    expect(elem.dataset.storyKey).toBeUndefined();

    const bodyElem = el();
    applyCellTrackedChangeToCell(bodyElem, meta('body'), CONFIG);
    expect(bodyElem.dataset.storyKey).toBe('body');
  });
});
