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

function getItem(defaultItems, overflowItems, name) {
  return [...defaultItems, ...overflowItems].find((item) => item.name.value === name);
}

function buildItems(availableWidth, superToolbarOverrides = {}) {
  const toolbar = {
    ...superToolbar,
    ...superToolbarOverrides,
    config: {
      ...superToolbar.config,
      ...superToolbarOverrides.config,
    },
  };

  return makeDefaultItems({
    superToolbar: toolbar,
    toolbarIcons: stubProxy,
    toolbarTexts: stubProxy,
    toolbarFonts: [],
    hideButtons: true,
    availableWidth,
  });
}

describe('makeDefaultItems table of contents button opt-in', () => {
  it('does not include tableOfContents in the default toolbar items', () => {
    const { defaultItems, overflowItems } = buildItems(2000);
    expect(getItem(defaultItems, overflowItems, 'tableOfContents')).toBeUndefined();
  });

  it('includes tableOfContents when showTableOfContentsButton is true', () => {
    const { defaultItems, overflowItems } = buildItems(2000, {
      config: { showTableOfContentsButton: true },
    });
    const tableOfContents = getItem(defaultItems, overflowItems, 'tableOfContents');

    expect(tableOfContents).toBeDefined();
    expect(tableOfContents.command).toBe('insertTableOfContents');
  });
});

describe('makeDefaultItems formatting marks button opt-in', () => {
  it('does not include formattingMarks in the default toolbar items', () => {
    const { defaultItems, overflowItems } = buildItems(2000);
    expect(getItem(defaultItems, overflowItems, 'formattingMarks')).toBeUndefined();
  });

  it('includes formattingMarks when showFormattingMarksButton is true', () => {
    const { defaultItems, overflowItems } = buildItems(2000, {
      config: { showFormattingMarksButton: true },
    });
    const formattingMarks = getItem(defaultItems, overflowItems, 'formattingMarks');

    expect(formattingMarks).toBeDefined();
    expect(formattingMarks.command).toBe('toggleFormattingMarks');
  });

  it('includes formattingMarks in non-docx mode when showFormattingMarksButton is true', () => {
    const { defaultItems, overflowItems } = buildItems(2000, {
      config: { mode: 'html', showFormattingMarksButton: true },
    });
    const formattingMarks = getItem(defaultItems, overflowItems, 'formattingMarks');

    expect(formattingMarks).toBeDefined();
  });
});

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

    expect(documentMode.attributes.value.className).toContain('sd-toolbar-item--doc-mode-compact');
    expect(linkedStyles.attributes.value.className).toContain('sd-toolbar-item--linked-styles-compact');
  });

  it(`does not apply compact classes at ${LG_BREAKPOINT + 1}px (above breakpoint)`, () => {
    const { defaultItems, overflowItems } = buildItems(LG_BREAKPOINT + 1);
    const documentMode = getItem(defaultItems, overflowItems, 'documentMode');
    const linkedStyles = getItem(defaultItems, overflowItems, 'linkedStyles');

    expect(documentMode.attributes.value.className).not.toContain('sd-toolbar-item--doc-mode-compact');
    expect(linkedStyles.attributes.value.className).not.toContain('sd-toolbar-item--linked-styles-compact');
  });
});

// PR #3226: direction buttons (directionLtr / directionRtl) are intentionally
// NOT in the default toolbar. The command (`setParagraphDirection`) and the
// headless toolbar ids (`direction-ltr` / `direction-rtl`) stay available;
// customers wire them into their own UI via the headless toolbar API or by
// calling the command directly. Pin "not in default" here so a future
// re-add in makeDefaultItems fails this test instead of silently shipping.
describe('makeDefaultItems direction buttons not in default toolbar', () => {
  function getItem(defaultItems, overflowItems, name) {
    return [...defaultItems, ...overflowItems].find((item) => item.name.value === name);
  }

  it('directionLtr is not in the default toolbar items', () => {
    const { defaultItems, overflowItems } = buildItems(2000);
    expect(getItem(defaultItems, overflowItems, 'directionLtr')).toBeUndefined();
  });

  it('directionRtl is not in the default toolbar items', () => {
    const { defaultItems, overflowItems } = buildItems(2000);
    expect(getItem(defaultItems, overflowItems, 'directionRtl')).toBeUndefined();
  });
});
