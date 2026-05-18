import { describe, expect, it } from 'vitest';
import { getTableSnapshotFlags } from './snapshot.js';

describe('getTableSnapshotFlags', () => {
  it('detects lines inside table fragments and table paragraphs', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'superdoc-table-fragment';
    const paragraph = document.createElement('div');
    paragraph.className = 'superdoc-table-paragraph';
    const line = document.createElement('div');
    line.className = 'superdoc-line';
    paragraph.appendChild(line);
    wrapper.appendChild(paragraph);

    expect(getTableSnapshotFlags(line)).toEqual({
      inTableFragment: true,
      inTableParagraph: true,
    });
  });

  it('leaves both flags false for non-table lines', () => {
    const line = document.createElement('div');
    line.className = 'superdoc-line';

    expect(getTableSnapshotFlags(line)).toEqual({
      inTableFragment: false,
      inTableParagraph: false,
    });
  });
});
