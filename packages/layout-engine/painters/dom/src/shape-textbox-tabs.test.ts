import { describe, it, expect } from 'vitest';
import {
  appendShapeTextboxTabElement,
  createShapeTextboxTabState,
  measureShapeTextPartWidth,
} from './shape-textbox-tabs.js';

describe('shape-textbox-tabs', () => {
  it('measures text width for tab alignment', () => {
    const width = measureShapeTextPartWidth('123.45', { fontSize: 12, fontFamily: 'Arial' });
    expect(width).toBeGreaterThan(0);
  });

  it('renders a tab with width derived from explicit tab stops', () => {
    const parent = document.createElement('div');
    const state = createShapeTextboxTabState(300, [
      { val: 'start', pos: 150 },
      { val: 'end', pos: 4500 },
    ]);
    appendShapeTextboxTabElement(
      document,
      parent,
      { text: '', kind: 'tab', formatting: { fontSize: 12 } },
      state,
      'Right aligned',
    );

    const tab = parent.querySelector('.superdoc-tab') as HTMLElement | null;
    expect(tab).toBeTruthy();
    expect(parseFloat(tab?.style.width ?? '0')).toBeGreaterThan(0);
    expect(state.currentX).toBeGreaterThan(0);
  });
});
