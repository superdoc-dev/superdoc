import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('@extensions/table/tableHelpers/isCellSelection.js', () => ({
  isCellSelection: vi.fn(() => false),
}));

vi.mock('@extensions/table/tableHelpers/cellAround.js', () => ({
  cellAround: vi.fn(() => null),
}));

vi.mock('../../toolbar/IconGrid.vue', () => ({
  default: {
    props: ['icons', 'customIcons', 'activeColor', 'hasNoneIcon'],
    emits: ['select'],
    template: '<div class="icon-grid-stub" />',
  },
}));

vi.mock('../../toolbar/color-dropdown-helpers.js', () => ({
  icons: [[{ label: 'black', value: '#000000', icon: '<svg/>', style: {} }]],
}));

import CellBackgroundPicker from '../CellBackgroundPicker.vue';
import { isCellSelection } from '@extensions/table/tableHelpers/isCellSelection.js';
import { cellAround } from '@extensions/table/tableHelpers/cellAround.js';

describe('CellBackgroundPicker', () => {
  let mockEditor;
  let closePopover;

  beforeEach(() => {
    vi.clearAllMocks();

    closePopover = vi.fn();
    mockEditor = {
      state: {
        selection: {
          $from: { depth: 3 },
        },
      },
      commands: {
        setCellSelection: vi.fn(),
        setCellBackground: vi.fn(),
        setCellAttr: vi.fn(),
      },
    };
  });

  function mountPicker() {
    return mount(CellBackgroundPicker, {
      props: { editor: mockEditor, closePopover },
    });
  }

  it('should call setCellBackground directly when selection is already a CellSelection', () => {
    isCellSelection.mockReturnValue(true);

    const wrapper = mountPicker();
    wrapper.findComponent({ name: 'IconGrid' }).vm.$emit('select', '#FF0000');

    expect(mockEditor.commands.setCellSelection).not.toHaveBeenCalled();
    expect(mockEditor.commands.setCellBackground).toHaveBeenCalledWith('#FF0000');
    expect(closePopover).toHaveBeenCalled();
  });

  it('should select the cell first when cursor is inside a cell without CellSelection', () => {
    isCellSelection.mockReturnValue(false);
    cellAround.mockReturnValue({ pos: 42 });

    const wrapper = mountPicker();
    wrapper.findComponent({ name: 'IconGrid' }).vm.$emit('select', '#00FF00');

    expect(cellAround).toHaveBeenCalledWith(mockEditor.state.selection.$from);
    expect(mockEditor.commands.setCellSelection).toHaveBeenCalledWith({
      anchorCell: 42,
      headCell: 42,
    });
    expect(mockEditor.commands.setCellBackground).toHaveBeenCalledWith('#00FF00');
    expect(closePopover).toHaveBeenCalled();
  });

  it('should still attempt setCellBackground when cellAround returns null', () => {
    isCellSelection.mockReturnValue(false);
    cellAround.mockReturnValue(null);

    const wrapper = mountPicker();
    wrapper.findComponent({ name: 'IconGrid' }).vm.$emit('select', '#0000FF');

    expect(mockEditor.commands.setCellSelection).not.toHaveBeenCalled();
    expect(mockEditor.commands.setCellBackground).toHaveBeenCalledWith('#0000FF');
    expect(closePopover).toHaveBeenCalled();
  });

  it('should map "none" to setCellAttr(background, null) for removing background', () => {
    isCellSelection.mockReturnValue(true);

    const wrapper = mountPicker();
    wrapper.findComponent({ name: 'IconGrid' }).vm.$emit('select', 'none');

    expect(mockEditor.commands.setCellBackground).not.toHaveBeenCalled();
    expect(mockEditor.commands.setCellAttr).toHaveBeenCalledWith('background', null);
    expect(closePopover).toHaveBeenCalled();
  });
});
