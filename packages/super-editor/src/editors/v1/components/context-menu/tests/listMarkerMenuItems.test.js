/**
 * Tests for list-marker context menu section.
 *
 * When the user right-clicks on a list marker, getItems() should return
 * a "list-marker" section with restart-numbering, continue-numbering,
 * decrease-list-indent, and increase-list-indent actions.
 * These items must NOT appear when isOnListMarker is false.
 */
import { describe, it, expect, vi } from 'vitest';
import { getItems } from '../menuItems.js';
import { createMockContext, createMockEditor } from './testHelpers.js';

vi.mock('../constants.js', async () => {
  const actual = await vi.importActual('../constants.js');
  return actual;
});

vi.mock('@extensions/track-changes/permission-helpers.js', () => ({
  isTrackedChangeActionAllowed: vi.fn(() => true),
}));

vi.mock('../../../core/utilities/clipboardUtils.js', () => ({
  readClipboardRaw: vi.fn(async () => ({ html: '', text: '' })),
}));

vi.mock('../../../core/InputRule.js', () => ({
  handleClipboardPaste: vi.fn(() => false),
}));

/** IDs for the expected list-marker items */
const LIST_MARKER_ITEM_IDS = [
  'list-restart-numbering',
  'list-continue-numbering',
  'list-decrease-indent',
  'list-increase-indent',
];

function makeListMarkerContext(overrides = {}) {
  return createMockContext({
    trigger: 'click',
    isInList: true,
    isOnListMarker: true,
    ...overrides,
  });
}

function flatItems(sections) {
  return sections.flatMap((s) => s.items);
}

describe('list-marker menu section', () => {
  describe('visibility when isOnListMarker is true', () => {
    it('exposes all four items, grouped in the list-marker section', () => {
      const context = makeListMarkerContext();
      const sections = getItems(context);
      const markerSection = sections.find((s) => s.id === 'list-marker');
      expect(markerSection).toBeDefined();
      expect(markerSection.items.map((i) => i.id)).toEqual(LIST_MARKER_ITEM_IDS);
    });
  });

  describe('visibility when isOnListMarker is false', () => {
    it('hides all list-marker items when isOnListMarker is false', () => {
      const context = makeListMarkerContext({ isOnListMarker: false });
      const sections = getItems(context);
      const ids = flatItems(sections).map((i) => i.id);
      LIST_MARKER_ITEM_IDS.forEach((id) => {
        expect(ids).not.toContain(id);
      });
    });

    it('hides all list-marker items when trigger is slash (not click)', () => {
      const context = makeListMarkerContext({ trigger: 'slash', isOnListMarker: true });
      const sections = getItems(context);
      const ids = flatItems(sections).map((i) => i.id);
      LIST_MARKER_ITEM_IDS.forEach((id) => {
        expect(ids).not.toContain(id);
      });
    });

    it('hides all list-marker items when context is a plain paragraph', () => {
      const context = createMockContext({ trigger: 'click', isInList: false, isOnListMarker: false });
      const sections = getItems(context);
      const ids = flatItems(sections).map((i) => i.id);
      LIST_MARKER_ITEM_IDS.forEach((id) => {
        expect(ids).not.toContain(id);
      });
    });
  });

  describe('item actions', () => {
    const ACTION_CASES = [
      { itemId: 'list-restart-numbering', command: 'restartNumbering' },
      { itemId: 'list-continue-numbering', command: 'continueNumbering' },
      { itemId: 'list-decrease-indent', command: 'decreaseListIndent' },
      { itemId: 'list-increase-indent', command: 'increaseListIndent' },
    ];

    it.each(ACTION_CASES)('$itemId calls editor.commands.$command()', ({ itemId, command }) => {
      const editor = createMockEditor({
        commands: {
          restartNumbering: vi.fn(() => true),
          continueNumbering: vi.fn(() => true),
          decreaseListIndent: vi.fn(() => true),
          increaseListIndent: vi.fn(() => true),
        },
      });
      const context = makeListMarkerContext({ editor });
      const item = flatItems(getItems(context)).find((i) => i.id === itemId);

      expect(item).toBeDefined();
      item.action(editor, context);
      expect(editor.commands[command]).toHaveBeenCalled();
    });
  });
});
