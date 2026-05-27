/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';

import { DomPositionIndex } from './DomPositionIndex.ts';

describe('DomPositionIndex', () => {
  it('excludes structured-content chrome labels from caret position lookup', () => {
    const container = document.createElement('div');

    const fragment = document.createElement('div');
    fragment.className = `${DOM_CLASS_NAMES.FRAGMENT} ${DOM_CLASS_NAMES.BLOCK_SDT} ${DOM_CLASS_NAMES.TABLE_FRAGMENT}`;
    fragment.dataset.pmStart = '16';
    fragment.dataset.pmEnd = '44';

    const label = document.createElement('div');
    label.className = DOM_CLASS_NAMES.BLOCK_SDT_LABEL;
    label.dataset.pmStart = '16';
    label.dataset.pmEnd = '44';
    label.textContent = 'Block With Table';

    const line = document.createElement('div');
    line.className = DOM_CLASS_NAMES.LINE;
    line.dataset.pmStart = '16';
    line.dataset.pmEnd = '18';

    const span = document.createElement('span');
    span.dataset.pmStart = '16';
    span.dataset.pmEnd = '18';
    span.textContent = 'A1';

    line.appendChild(span);
    fragment.append(label, line);
    container.appendChild(fragment);

    const index = new DomPositionIndex();
    index.rebuild(container);

    expect(index.findEntryAtPosition(16)?.el).toBe(span);
  });
});
