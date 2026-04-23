import { describe, it, expect, vi, afterEach } from 'vitest';
import { SuperToolbar } from './super-toolbar.js';

vi.mock('prosemirror-history', () => ({
  undoDepth: () => 0,
  redoDepth: () => 0,
}));

vi.mock('@core/helpers/getActiveFormatting.js', () => ({
  getActiveFormatting: vi.fn(() => []),
}));

vi.mock('@helpers/isInTable.js', () => ({
  isInTable: vi.fn(() => false),
}));

vi.mock('@extensions/linked-styles/index.js', () => ({
  getQuickFormatList: vi.fn(() => []),
}));

vi.mock('@extensions/track-changes/permission-helpers.js', () => ({
  collectTrackedChanges: vi.fn(() => []),
  isTrackedChangeActionAllowed: vi.fn(() => true),
}));

vi.mock('./defaultItems.js', () => ({
  makeDefaultItems: () => ({ defaultItems: [], overflowItems: [] }),
}));

describe('SuperToolbar getAvailableWidth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns document width when responsiveToContainer is false', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1600);

    const container = document.createElement('div');
    Object.defineProperty(container, 'offsetWidth', { value: 900 });

    const context = {
      toolbarContainer: container,
      config: { responsiveToContainer: false },
    };

    expect(SuperToolbar.prototype.getAvailableWidth.call(context)).toBe(1600);
  });

  it('returns container width when responsiveToContainer is true', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1600);

    const container = document.createElement('div');
    Object.defineProperty(container, 'offsetWidth', { value: 900 });

    const context = {
      toolbarContainer: container,
      config: { responsiveToContainer: true },
    };

    expect(SuperToolbar.prototype.getAvailableWidth.call(context)).toBe(900);
  });

  it('falls back to 0 when responsiveToContainer is true but no container is set', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1600);

    const context = {
      toolbarContainer: null,
      config: { responsiveToContainer: true },
    };

    expect(SuperToolbar.prototype.getAvailableWidth.call(context)).toBe(0);
  });
});
