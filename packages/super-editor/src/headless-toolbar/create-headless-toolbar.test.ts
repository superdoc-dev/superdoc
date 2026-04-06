import { afterEach, describe, expect, it, vi } from 'vitest';
import { historyKey } from 'prosemirror-history';
import { NodeSelection } from 'prosemirror-state';

const getActiveFormattingMock = vi.hoisted(() => vi.fn(() => []));

vi.mock('../editors/v1/core/helpers/getActiveFormatting.js', () => ({
  getActiveFormatting: getActiveFormattingMock,
}));

import { createHeadlessToolbar } from './create-headless-toolbar.js';
import type { HeadlessToolbarSuperdocHost, ToolbarSubscriptionEvent } from './types.js';

const createSelectionState = (selection: Record<string, unknown> = { empty: true }) => ({
  selection,
});

const createActiveEditorHost = ({
  commands,
  state = createSelectionState(),
  extra = {},
}: {
  commands: Record<string, (...args: any[]) => any>;
  state?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}): HeadlessToolbarSuperdocHost => ({
  activeEditor: {
    commands,
    doc: {} as any,
    isEditable: true,
    state,
    ...extra,
  } as any,
});

describe('createHeadlessToolbar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes with an object payload containing snapshot', () => {
    const toggleBold = vi.fn(() => true);
    const superdoc: HeadlessToolbarSuperdocHost = {
      activeEditor: {
        commands: { toggleBold },
        doc: {} as any,
        isEditable: true,
        state: {
          selection: {
            empty: true,
          },
        },
      } as any,
    };

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['bold'],
    });

    const listener = vi.fn((_event: ToolbarSubscriptionEvent) => {});
    const unsubscribe = controller.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      snapshot: controller.getSnapshot(),
    });

    unsubscribe();
    controller.destroy();
  });

  it('executes built-in direct commands through the registry', () => {
    const toggleBold = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: { toggleBold },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['bold'],
    });

    expect(controller.execute?.('bold')).toBe(true);
    expect(toggleBold).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('executes track-changes accept-selection through the registry direct command path', () => {
    const acceptTrackedChangeFromToolbar = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: { acceptTrackedChangeFromToolbar },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['track-changes-accept-selection'],
    });

    expect(controller.execute?.('track-changes-accept-selection')).toBe(true);
    expect(acceptTrackedChangeFromToolbar).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('executes track-changes reject-selection through the registry direct command path', () => {
    const rejectTrackedChangeFromToolbar = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: { rejectTrackedChangeFromToolbar },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['track-changes-reject-selection'],
    });

    expect(controller.execute?.('track-changes-reject-selection')).toBe(true);
    expect(rejectTrackedChangeFromToolbar).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('executes underline through the registry adapter and syncs field annotations', () => {
    const toggleUnderline = vi.fn(() => true);
    const toggleFieldAnnotationsFormat = vi.fn();
    const superdoc = createActiveEditorHost({
      commands: {
        toggleUnderline,
        toggleFieldAnnotationsFormat,
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['underline'],
    });

    expect(controller.execute?.('underline')).toBe(true);
    expect(toggleUnderline).toHaveBeenCalledTimes(1);
    expect(toggleFieldAnnotationsFormat).toHaveBeenCalledTimes(1);
    expect(toggleFieldAnnotationsFormat).toHaveBeenCalledWith('underline', true);

    controller.destroy();
  });

  it('executes bold via field-annotation-only path for field annotation selections', () => {
    const toggleBold = vi.fn(() => true);
    const toggleFieldAnnotationsFormat = vi.fn();
    const selection = Object.create(NodeSelection.prototype);
    selection.node = { type: { name: 'fieldAnnotation' } };
    selection.ranges = [{ $from: { pos: 1 }, $to: { pos: 1 } }];
    const superdoc: HeadlessToolbarSuperdocHost = {
      activeEditor: {
        commands: {
          toggleBold,
          toggleFieldAnnotationsFormat,
        },
        doc: {} as any,
        isEditable: true,
        state: {
          selection,
        },
      } as any,
    };

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['bold'],
    });

    expect(controller.execute?.('bold')).toBe(true);
    expect(toggleBold).not.toHaveBeenCalled();
    expect(toggleFieldAnnotationsFormat).toHaveBeenCalledTimes(1);
    expect(toggleFieldAnnotationsFormat).toHaveBeenCalledWith('bold', true);

    controller.destroy();
  });

  it('executes italic via field-annotation-only path for field annotation selections', () => {
    const toggleItalic = vi.fn(() => true);
    const toggleFieldAnnotationsFormat = vi.fn();
    const selection = Object.create(NodeSelection.prototype);
    selection.node = { type: { name: 'fieldAnnotation' } };
    selection.ranges = [{ $from: { pos: 1 }, $to: { pos: 1 } }];
    const superdoc: HeadlessToolbarSuperdocHost = {
      activeEditor: {
        commands: {
          toggleItalic,
          toggleFieldAnnotationsFormat,
        },
        doc: {} as any,
        isEditable: true,
        state: {
          selection,
        },
      } as any,
    };

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['italic'],
    });

    expect(controller.execute?.('italic')).toBe(true);
    expect(toggleItalic).not.toHaveBeenCalled();
    expect(toggleFieldAnnotationsFormat).toHaveBeenCalledTimes(1);
    expect(toggleFieldAnnotationsFormat).toHaveBeenCalledWith('italic', true);

    controller.destroy();
  });

  it('executes underline via field-annotation-only path for field annotation selections', () => {
    const toggleUnderline = vi.fn(() => true);
    const toggleFieldAnnotationsFormat = vi.fn();
    const selection = Object.create(NodeSelection.prototype);
    selection.node = { type: { name: 'fieldAnnotation' } };
    selection.ranges = [{ $from: { pos: 1 }, $to: { pos: 1 } }];
    const superdoc: HeadlessToolbarSuperdocHost = {
      activeEditor: {
        commands: {
          toggleUnderline,
          toggleFieldAnnotationsFormat,
        },
        doc: {} as any,
        isEditable: true,
        state: {
          selection,
        },
      } as any,
    };

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['underline'],
    });

    expect(controller.execute?.('underline')).toBe(true);
    expect(toggleUnderline).not.toHaveBeenCalled();
    expect(toggleFieldAnnotationsFormat).toHaveBeenCalledTimes(1);
    expect(toggleFieldAnnotationsFormat).toHaveBeenCalledWith('underline', true);

    controller.destroy();
  });

  it('executes strikethrough through the registry direct command path', () => {
    const toggleStrike = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: {
        toggleStrike,
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['strikethrough'],
    });

    expect(controller.execute?.('strikethrough')).toBe(true);
    expect(toggleStrike).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('executes font-size through the registry adapter and syncs field annotation font size', () => {
    const setFontSize = vi.fn(() => true);
    const setFieldAnnotationsFontSize = vi.fn();
    const superdoc = createActiveEditorHost({
      commands: {
        setFontSize,
        setFieldAnnotationsFontSize,
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['font-size'],
    });

    expect(controller.execute?.('font-size', '12')).toBe(true);
    expect(setFontSize).toHaveBeenCalledTimes(1);
    expect(setFontSize).toHaveBeenCalledWith('12');
    expect(setFieldAnnotationsFontSize).toHaveBeenCalledTimes(1);
    expect(setFieldAnnotationsFontSize).toHaveBeenCalledWith('12', true);

    controller.destroy();
  });

  it('executes font-size via field-annotation-only path for field annotation selections', () => {
    const setFontSize = vi.fn(() => true);
    const setFieldAnnotationsFontSize = vi.fn();
    const selection = Object.create(NodeSelection.prototype);
    selection.node = { type: { name: 'fieldAnnotation' } };
    selection.ranges = [{ $from: { pos: 1 }, $to: { pos: 1 } }];
    const superdoc: HeadlessToolbarSuperdocHost = {
      activeEditor: {
        commands: {
          setFontSize,
          setFieldAnnotationsFontSize,
        },
        doc: {} as any,
        isEditable: true,
        state: {
          selection,
        },
      } as any,
    };

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['font-size'],
    });

    expect(controller.execute?.('font-size', '12')).toBe(true);
    expect(setFontSize).not.toHaveBeenCalled();
    expect(setFieldAnnotationsFontSize).toHaveBeenCalledTimes(1);
    expect(setFieldAnnotationsFontSize).toHaveBeenCalledWith('12', true);

    controller.destroy();
  });

  it('executes font-family through the registry adapter and syncs field annotation font family', () => {
    const setFontFamily = vi.fn(() => true);
    const setFieldAnnotationsFontFamily = vi.fn();
    const superdoc = createActiveEditorHost({
      commands: {
        setFontFamily,
        setFieldAnnotationsFontFamily,
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['font-family'],
    });

    expect(controller.execute?.('font-family', 'Arial')).toBe(true);
    expect(setFontFamily).toHaveBeenCalledTimes(1);
    expect(setFontFamily).toHaveBeenCalledWith('Arial');
    expect(setFieldAnnotationsFontFamily).toHaveBeenCalledTimes(1);
    expect(setFieldAnnotationsFontFamily).toHaveBeenCalledWith('Arial', true);

    controller.destroy();
  });

  it('executes font-family via field-annotation-only path for field annotation selections', () => {
    const setFontFamily = vi.fn(() => true);
    const setFieldAnnotationsFontFamily = vi.fn();
    const selection = Object.create(NodeSelection.prototype);
    selection.node = { type: { name: 'fieldAnnotation' } };
    selection.ranges = [{ $from: { pos: 1 }, $to: { pos: 1 } }];
    const superdoc: HeadlessToolbarSuperdocHost = {
      activeEditor: {
        commands: {
          setFontFamily,
          setFieldAnnotationsFontFamily,
        },
        doc: {} as any,
        isEditable: true,
        state: {
          selection,
        },
      } as any,
    };

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['font-family'],
    });

    expect(controller.execute?.('font-family', 'Arial')).toBe(true);
    expect(setFontFamily).not.toHaveBeenCalled();
    expect(setFieldAnnotationsFontFamily).toHaveBeenCalledTimes(1);
    expect(setFieldAnnotationsFontFamily).toHaveBeenCalledWith('Arial', true);

    controller.destroy();
  });

  it('executes link through the registry direct command path', () => {
    const toggleLink = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: {
        toggleLink,
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['link'],
    });

    expect(controller.execute?.('link', { href: 'https://example.com' })).toBe(true);
    expect(toggleLink).toHaveBeenCalledTimes(1);
    expect(toggleLink).toHaveBeenCalledWith({ href: 'https://example.com' });

    controller.destroy();
  });

  it('executes text-color and syncs field annotation text color', () => {
    const setColor = vi.fn(() => true);
    const setFieldAnnotationsTextColor = vi.fn();
    const superdoc = createActiveEditorHost({
      commands: {
        setColor,
        setFieldAnnotationsTextColor,
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['text-color'],
    });

    expect(controller.execute?.('text-color', '#ff0000')).toBe(true);
    expect(setColor).toHaveBeenCalledTimes(1);
    expect(setColor).toHaveBeenCalledWith('#ff0000');
    expect(setFieldAnnotationsTextColor).toHaveBeenCalledTimes(1);
    expect(setFieldAnnotationsTextColor).toHaveBeenCalledWith('#ff0000', true);

    controller.destroy();
  });

  it('executes highlight-color none and syncs annotation and cell background resets', () => {
    const setHighlight = vi.fn(() => true);
    const setFieldAnnotationsTextHighlight = vi.fn();
    const setCellBackground = vi.fn();
    const superdoc = createActiveEditorHost({
      commands: {
        setHighlight,
        setFieldAnnotationsTextHighlight,
        setCellBackground,
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['highlight-color'],
    });

    expect(controller.execute?.('highlight-color', 'none')).toBe(true);
    expect(setHighlight).toHaveBeenCalledTimes(1);
    expect(setHighlight).toHaveBeenCalledWith('transparent');
    expect(setFieldAnnotationsTextHighlight).toHaveBeenCalledTimes(1);
    expect(setFieldAnnotationsTextHighlight).toHaveBeenCalledWith(null, true);
    expect(setCellBackground).toHaveBeenCalledTimes(1);
    expect(setCellBackground).toHaveBeenCalledWith(null);

    controller.destroy();
  });

  it('executes bullet-list through the registry direct command path', () => {
    const toggleBulletList = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: {
        toggleBulletList,
      },
      state: createSelectionState({
        empty: true,
        $from: {
          depth: 1,
          node: vi.fn(() => ({ type: { name: 'doc' } })),
          before: vi.fn(() => 0),
          start: vi.fn(() => 0),
        },
      }),
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['bullet-list'],
    });

    expect(controller.execute?.('bullet-list')).toBe(true);
    expect(toggleBulletList).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('executes numbered-list through the registry direct command path', () => {
    const toggleOrderedList = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: {
        toggleOrderedList,
      },
      state: createSelectionState({
        empty: true,
        $from: {
          depth: 1,
          node: vi.fn(() => ({ type: { name: 'doc' } })),
          before: vi.fn(() => 0),
          start: vi.fn(() => 0),
        },
      }),
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['numbered-list'],
    });

    expect(controller.execute?.('numbered-list')).toBe(true);
    expect(toggleOrderedList).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('executes indent-increase via list indent first', () => {
    const increaseListIndent = vi.fn(() => true);
    const increaseTextIndent = vi.fn(() => true);
    const superdoc: HeadlessToolbarSuperdocHost = {
      activeEditor: {
        commands: {
          increaseListIndent,
          increaseTextIndent,
        },
        doc: {} as any,
        isEditable: true,
        state: {
          selection: {
            empty: true,
          },
        },
      } as any,
    };

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['indent-increase'],
    });

    expect(controller.execute?.('indent-increase')).toBe(true);
    expect(increaseListIndent).toHaveBeenCalledTimes(1);
    expect(increaseTextIndent).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('executes indent-decrease via text indent fallback when list indent does not apply', () => {
    const decreaseListIndent = vi.fn(() => false);
    const decreaseTextIndent = vi.fn(() => true);
    const superdoc: HeadlessToolbarSuperdocHost = {
      activeEditor: {
        commands: {
          decreaseListIndent,
          decreaseTextIndent,
        },
        doc: {} as any,
        isEditable: true,
        state: {
          selection: {
            empty: true,
          },
        },
      } as any,
    };

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['indent-decrease'],
    });

    expect(controller.execute?.('indent-decrease')).toBe(true);
    expect(decreaseListIndent).toHaveBeenCalledTimes(1);
    expect(decreaseTextIndent).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('executes undo through the registry direct command path', () => {
    const undo = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: {
        undo,
      },
      state: {
        ...createSelectionState(),
        plugins: [historyKey],
        field: vi.fn(() => ({ done: { eventCount: 1 }, undone: { eventCount: 0 } })),
      },
      extra: {
        options: {},
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['undo'],
    });

    expect(controller.execute?.('undo')).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('executes redo through the registry direct command path', () => {
    const redo = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: {
        redo,
      },
      state: {
        ...createSelectionState(),
        plugins: [historyKey],
        field: vi.fn(() => ({ done: { eventCount: 0 }, undone: { eventCount: 1 } })),
      },
      extra: {
        options: {},
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['redo'],
    });

    expect(controller.execute?.('redo')).toBe(true);
    expect(redo).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('executes ruler through the registry execute path', () => {
    const toggleRuler = vi.fn();
    const superdoc: HeadlessToolbarSuperdocHost = {
      activeEditor: {
        commands: {},
        doc: {} as any,
        isEditable: true,
        state: {
          selection: {
            empty: true,
          },
        },
      } as any,
      toggleRuler,
      config: {
        rulers: true,
      },
    } as any;

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['ruler'],
    });

    expect(controller.execute?.('ruler')).toBe(true);
    expect(toggleRuler).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('executes zoom through the registry execute path', () => {
    const setZoom = vi.fn();
    const superdoc: HeadlessToolbarSuperdocHost = {
      activeEditor: {
        commands: {},
        doc: {} as any,
        isEditable: true,
        state: {
          selection: {
            empty: true,
          },
        },
      } as any,
      setZoom,
      getZoom: vi.fn(() => 100),
    } as any;

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['zoom'],
    });

    expect(controller.execute?.('zoom', 150)).toBe(true);
    expect(setZoom).toHaveBeenCalledTimes(1);
    expect(setZoom).toHaveBeenCalledWith(150);

    controller.destroy();
  });

  it('executes document-mode through the registry execute path', () => {
    const setDocumentMode = vi.fn();
    const superdoc: HeadlessToolbarSuperdocHost = {
      activeEditor: {
        commands: {},
        doc: {} as any,
        isEditable: true,
        state: {
          selection: {
            empty: true,
          },
        },
      } as any,
      setDocumentMode,
      config: {
        documentMode: 'editing',
      },
    } as any;

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['document-mode'],
    });

    expect(controller.execute?.('document-mode', 'viewing')).toBe(true);
    expect(setDocumentMode).toHaveBeenCalledTimes(1);
    expect(setDocumentMode).toHaveBeenCalledWith('viewing');

    controller.destroy();
  });

  it('executes linked-style through the registry direct command path', () => {
    const setLinkedStyle = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: {
        setLinkedStyle,
      },
      state: {
        doc: {
          resolve: vi.fn(() => '$resolved-pos'),
        },
        selection: {
          empty: true,
          from: 5,
          to: 5,
          $from: {
            depth: 1,
            node: vi.fn((depth) =>
              depth === 1
                ? {
                    type: { name: 'paragraph' },
                    attrs: {
                      paragraphProperties: {
                        styleId: 'Heading1',
                      },
                    },
                  }
                : null,
            ),
            before: vi.fn(() => 5),
            start: vi.fn(() => 6),
          },
        },
      },
      extra: {
        converter: null,
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['linked-style'],
    });

    expect(controller.execute?.('linked-style', { id: 'Heading1' })).toBe(true);
    expect(setLinkedStyle).toHaveBeenCalledTimes(1);
    expect(setLinkedStyle).toHaveBeenCalledWith({ id: 'Heading1' });

    controller.destroy();
  });

  it.each([
    { id: 'clear-formatting', commandName: 'clearFormat' },
    { id: 'copy-format', commandName: 'copyFormat' },
    { id: 'table-add-row-before', commandName: 'addRowBefore' },
    { id: 'table-add-row-after', commandName: 'addRowAfter' },
    { id: 'table-delete-row', commandName: 'deleteRow' },
    { id: 'table-add-column-before', commandName: 'addColumnBefore' },
    { id: 'table-add-column-after', commandName: 'addColumnAfter' },
    { id: 'table-delete-column', commandName: 'deleteColumn' },
    { id: 'table-delete', commandName: 'deleteTable' },
    { id: 'table-merge-cells', commandName: 'mergeCells' },
    { id: 'table-split-cell', commandName: 'splitCell' },
    { id: 'table-remove-borders', commandName: 'deleteCellAndTableBorders' },
    { id: 'table-fix', commandName: 'fixTables' },
  ] as const)('executes $id through the registry direct command path', ({ id, commandName }) => {
    const command = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: {
        [commandName]: command,
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: [id],
    });

    expect(controller.execute?.(id)).toBe(true);
    expect(command).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('executes table-insert through the registry direct command path', () => {
    const insertTable = vi.fn(() => true);
    const superdoc = createActiveEditorHost({
      commands: {
        insertTable,
      },
    });

    const controller = createHeadlessToolbar({
      superdoc,
      commands: ['table-insert'],
    });

    expect(controller.execute?.('table-insert', { rows: 3, cols: 4 })).toBe(true);
    expect(insertTable).toHaveBeenCalledTimes(1);
    expect(insertTable).toHaveBeenCalledWith({ rows: 3, cols: 4 });

    controller.destroy();
  });
});
