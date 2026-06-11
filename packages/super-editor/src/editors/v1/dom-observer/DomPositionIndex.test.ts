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

  it('excludes behindDoc header/footer textbox spans from body caret lookup', () => {
    const container = document.createElement('div');
    container.className = DOM_CLASS_NAMES.PAGE;
    container.dataset.pageIndex = '0';

    const bodyLine = document.createElement('div');
    bodyLine.className = DOM_CLASS_NAMES.LINE;
    const bodySpan = document.createElement('span');
    bodySpan.dataset.pmStart = '10';
    bodySpan.dataset.pmEnd = '14';
    bodySpan.textContent = 'body';
    bodyLine.appendChild(bodySpan);

    const behindDoc = document.createElement('div');
    behindDoc.dataset.behindDocSection = 'header';
    const hfLine = document.createElement('div');
    hfLine.className = DOM_CLASS_NAMES.LINE;
    const hfSpan = document.createElement('span');
    hfSpan.dataset.pmStart = '10';
    hfSpan.dataset.pmEnd = '14';
    hfSpan.textContent = 'header';
    hfLine.appendChild(hfSpan);
    behindDoc.appendChild(hfLine);

    container.append(bodyLine, behindDoc);

    const index = new DomPositionIndex();
    index.rebuild(container);

    expect(index.findEntryAtPosition(12)?.el).toBe(bodySpan);
    expect(index.findEntryAtPosition(12)?.el.textContent).toBe('body');
  });
});
