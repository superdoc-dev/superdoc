import { describe, expect, it } from 'vitest';

import { makeDefaultItems } from './defaultItems.js';
import { RESPONSIVE_BREAKPOINTS } from './constants.js';

const stubProxy = new Proxy(
  {},
  {
    get: () => 'stub',
  },
);

const superToolbar = {
  config: { mode: 'docx', superdoc: { config: { modules: { ai: {} } } } },
  activeEditor: null,
  emitCommand: () => {},
};

function getItemNames(list) {
  return list.map((item) => item.name.value);
}

function buildItems(availableWidth) {
  return makeDefaultItems({
    superToolbar,
    toolbarIcons: stubProxy,
    toolbarTexts: stubProxy,
    toolbarFonts: [],
    hideButtons: true,
    availableWidth,
  });
}

describe('makeDefaultItems XL overflow boundary (SD-2328)', () => {
  const XL_OVERFLOW_SAFETY_BUFFER = 20;
  const XL_CUTOFF = RESPONSIVE_BREAKPOINTS.xl + XL_OVERFLOW_SAFETY_BUFFER;
  const XL_ITEMS = ['linkedStyles', 'clearFormatting', 'copyFormat', 'ruler'];

  it(`moves XL items into overflow at ${XL_CUTOFF - 1}px (below cutoff)`, () => {
    const { defaultItems, overflowItems } = buildItems(XL_CUTOFF - 1);
    const overflowNames = getItemNames(overflowItems);
    const visibleNames = getItemNames(defaultItems);

    for (const name of XL_ITEMS) {
      expect(overflowNames).toContain(name);
      expect(visibleNames).not.toContain(name);
    }
  });

  it(`keeps XL items visible at ${XL_CUTOFF}px (on cutoff)`, () => {
    const { defaultItems, overflowItems } = buildItems(XL_CUTOFF);
    const overflowNames = getItemNames(overflowItems);
    const visibleNames = getItemNames(defaultItems);

    for (const name of XL_ITEMS) {
      expect(visibleNames).toContain(name);
      expect(overflowNames).not.toContain(name);
    }
  });

  it(`keeps XL items visible at ${XL_CUTOFF + 1}px (above cutoff)`, () => {
    const { defaultItems, overflowItems } = buildItems(XL_CUTOFF + 1);
    const overflowNames = getItemNames(overflowItems);
    const visibleNames = getItemNames(defaultItems);

    for (const name of XL_ITEMS) {
      expect(visibleNames).toContain(name);
      expect(overflowNames).not.toContain(name);
    }
  });
});

describe('makeDefaultItems LG compact styles', () => {
  const LG_BREAKPOINT = RESPONSIVE_BREAKPOINTS.lg;

  function getItem(defaultItems, overflowItems, name) {
    return [...defaultItems, ...overflowItems].find((item) => item.name.value === name);
  }

  it(`applies compact classes at ${LG_BREAKPOINT}px (on breakpoint)`, () => {
    const { defaultItems, overflowItems } = buildItems(LG_BREAKPOINT);
    const documentMode = getItem(defaultItems, overflowItems, 'documentMode');
    const linkedStyles = getItem(defaultItems, overflowItems, 'linkedStyles');

    expect(documentMode.attributes.value.className).toContain('toolbar-item--doc-mode-compact');
    expect(linkedStyles.attributes.value.className).toContain('toolbar-item--linked-styles-compact');
  });

  it(`does not apply compact classes at ${LG_BREAKPOINT + 1}px (above breakpoint)`, () => {
    const { defaultItems, overflowItems } = buildItems(LG_BREAKPOINT + 1);
    const documentMode = getItem(defaultItems, overflowItems, 'documentMode');
    const linkedStyles = getItem(defaultItems, overflowItems, 'linkedStyles');

    expect(documentMode.attributes.value.className).not.toContain('toolbar-item--doc-mode-compact');
    expect(linkedStyles.attributes.value.className).not.toContain('toolbar-item--linked-styles-compact');
  });
});
