import { describe, expect, it } from 'vite-plus/test';
import { makeDefaultItems } from './default-items.js';
import { toolbarIcons } from './toolbarIcons.js';
import { toolbarTexts } from './toolbarTexts.js';

describe('built-in toolbar item identity', () => {
  it('gives every rendered item a unique id', () => {
    const { defaultItems } = makeDefaultItems({
      superToolbar: { config: { mode: 'docx' }, ui: {} },
      toolbarIcons,
      toolbarTexts,
      hideButtons: false,
    });

    const separatorIds = defaultItems.filter((item) => item.type === 'separator').map((item) => item.id.value);
    const itemIds = defaultItems.map((item) => item.id.value);

    expect(separatorIds.length).toBeGreaterThan(1);
    expect(new Set(itemIds).size).toBe(itemIds.length);
  });
});
