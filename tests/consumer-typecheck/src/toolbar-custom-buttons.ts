/**
 * Consumer typecheck: `ui.toolbar.customButtons` accepts the shapes that
 * render and rejects the ones that do not.
 *
 * `ToolbarCustomButton` was `{ name, command?, [key: string]: unknown }` until
 * #1098, so every shape below compiled -- including the ones that render
 * nothing and the two that took the whole toolbar down. The union it became is
 * derived from a rendered-behavior survey rather than from what the
 * constructor tolerates, because for this surface those were never the same
 * question.
 *
 * The rejected cases are the point. Each one is a shape a consumer could
 * plausibly write and then watch do nothing.
 */
import type { Config, ToolbarCustomButton } from 'superdoc';

// --- Accepted: the three variants that render a usable control -------------

const _button: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [{ type: 'button', name: 'save', icon: '<svg />', command: () => {} }],
    },
  },
};

// A string command is read as a canonical id and routed through the shared
// controller, so both command forms have to compile.
const _stringCommand: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [{ type: 'button', name: 'b', icon: '<svg />', command: 'bold' }],
    },
  },
};

const _dropdown: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [
        {
          type: 'dropdown',
          name: 'pick',
          label: 'Pick one',
          options: [
            { label: 'Alpha', key: 'alpha' },
            { label: 'Beta', key: 'beta' },
          ],
          command: ({ option }) => option?.key,
        },
      ],
    },
  },
};

// Fields the toolbar renders and the first cut of this union rejected:
// `hasCaret` draws the trigger caret and row `icon` draws beside the label,
// both in working configurations the docs already show.
const _dropdownExtras: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [
        {
          type: 'dropdown',
          name: 'styled',
          label: 'Styled',
          hasCaret: true,
          // Without this the command receives the row's label rather than its
          // key, which is why the field has to be expressible.
          dropdownValueKey: 'key',
          // Vue `:style` takes a string, an object, or an array of either.
          // Styles the dropdown control itself, not the panel it opens, and is
          // forwarded to Vue `:style` untouched -- so any shape that binding
          // takes is valid, including a value typed `CSSProperties`.
          dropdownStyles: 'min-width: 200px',
          selectedValue: 'alpha',
          isWide: true,
          attributes: { className: 'my-dropdown', ariaLabel: 'Pick a style' },
          options: [
            { label: 'Alpha', key: 'alpha', icon: '<svg />' },
            { label: 'Beta', key: 'beta', icon: (option) => `<svg data-k="${option.key}" />` },
          ],
        },
      ],
    },
  },
};

// A `type: "render"` row is not selectable, so `ToolbarDropdown` sends it to
// its `RenderOption` branch and never reads `label`. Requiring `label` here
// rejected rows the runtime supports.
const _renderRow: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [
        {
          type: 'dropdown',
          name: 'withRender',
          label: 'Mixed',
          options: [
            { label: 'Alpha', key: 'alpha' },
            // `type` as application metadata: still a selectable row.
            { type: 'action', label: 'Save', key: 'save' },
            { type: 'render', render: () => null },
            // A VNode-shaped icon: `OptionIcon` returns whatever this resolves
            // to straight from a render function, so it is not markup-only.
            { label: 'Gamma', key: 'gamma', icon: () => ({ tag: 'svg' }) },
            // Both are read by `ToolbarDropdown` when it builds the row.
            { label: 'Delta', key: 'delta', class: 'my-row', props: { 'data-test': 'delta' } },
          ],
        },
      ],
    },
  },
};

// A separator has nothing to run, which is why `command` is absent from its
// variant rather than optional everywhere.
const _separator: Config = {
  selector: '#editor',
  ui: { toolbar: { container: '#toolbar', customButtons: [{ type: 'separator', name: 'div1' }] } },
};

// --- Rejected: shapes that compiled and then did nothing --------------------

const _buttonWithoutIcon: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      // @ts-expect-error a button needs `icon`; `defaultLabel` alone renders nothing (#1098).
      customButtons: [{ type: 'button', name: 'invisible', defaultLabel: 'Save', command: () => {} }],
    },
  },
};

// Rows are usually built from data rather than written out, so the array type
// has to survive losing its literal length. A nonempty tuple did not: it
// rejected all three of these, which is how it left review.
const rowData = [
  { id: 'alpha', title: 'Alpha' },
  { id: 'beta', title: 'Beta' },
];

const _rowsFromMap: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [
        {
          type: 'dropdown',
          name: 'mapped',
          label: 'Mapped',
          dropdownValueKey: 'key',
          options: rowData.map((row) => ({ label: row.title, key: row.id })),
          command: ({ option }) => option?.key,
        },
      ],
    },
  },
};

declare const preparedRows: { label: string; key: string }[];

const _rowsFromVariable: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [{ type: 'dropdown', name: 'fromVar', label: 'From var', options: preparedRows }],
    },
  },
};

// Empty is accepted on purpose. `#updateHighlightColors` assigns
// `nestedOptions` after construction, so a dropdown that fills in later is a
// shape the toolbar itself uses; `ButtonGroup` guards the render on row count.
const _dropdownWithoutRows: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [{ type: 'dropdown', name: 'empty', label: 'Empty', options: [] }],
    },
  },
};

const _topLevelOptions: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      // @ts-expect-error `options` constructs and then renders nothing: `ButtonGroup` has no branch for it.
      customButtons: [{ type: 'options', name: 'opts', options: [{ label: 'A', key: 'a' }] }],
    },
  },
};

const _topLevelOverflow: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      // @ts-expect-error `overflow` draws from a list `customButtons` cannot populate.
      customButtons: [{ type: 'overflow', name: 'more', label: 'More' }],
    },
  },
};

const _activeState: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      // @ts-expect-error `active` is discarded: `useToolbarItem` hard-codes the initial state to false.
      customButtons: [{ type: 'button', name: 'toggle', icon: '<svg />', active: true, command: () => {} }],
    },
  },
};

const _activeIcon: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      // @ts-expect-error `activeIcon` has no toolbar reader at all.
      customButtons: [{ type: 'button', name: 'toggle', icon: '<svg />', activeIcon: '<svg />', command: () => {} }],
    },
  },
};

// A dropdown with no visible trigger mounts a blank control, so the variant
// requires `icon` or `label`; `defaultLabel` does not render and does not count.
const _dropdownNoTrigger: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      // @ts-expect-error a dropdown needs `icon` or `label` for its trigger (#1098).
      customButtons: [{ type: 'dropdown', name: 'blank', defaultLabel: 'Nope', options: [{ label: 'A', key: 'a' }] }],
    },
  },
};

// `label` renders beside the icon on a button, and a row can carry any member
// for `dropdownValueKey` to name.
const _buttonLabelAndRowValue: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [
        { type: 'button', name: 'save', icon: '<svg />', label: 'Save', command: () => {} },
        {
          type: 'dropdown',
          name: 'spacing',
          label: 'Spacing',
          dropdownValueKey: 'value',
          options: [{ label: 'Double', key: 'double', value: 2 }],
          command: 'setLineHeight',
        },
      ],
    },
  },
};

// A render row with no renderer is a permanently blank, unclickable row:
// `RenderOption` returns `null` unless `render` is callable, and render rows
// are excluded from selection.
const _renderRowWithoutRenderer: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [
        // @ts-expect-error a `type: 'render'` row needs a callable `render` (#1098).
        { type: 'dropdown', name: 'blankRender', label: 'Blank', options: [{ type: 'render' }] },
      ],
    },
  },
};

// `as const` rows: the runtime only iterates and copies them, so a readonly
// tuple is supported and was rejected by the mutable requirement.
const _readonlyRows: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [
        {
          type: 'dropdown',
          name: 'frozen',
          // A row carrying `type` as application metadata stays selectable:
          // only `type: 'render'` is special-cased.
          // `as const` styles: forwarded to `:style` and never mutated.
          dropdownStyles: [{ minWidth: '180px' }] as const,
          label: 'Frozen',
          options: [{ label: 'Alpha', key: 'alpha' }] as const,
        },
      ],
    },
  },
};

// Numeric keys, as the built-in zoom dropdown uses (`key: 0.5`, `key: 1`).
const _numericKeys: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [
        {
          type: 'dropdown',
          name: 'zoomish',
          label: 'Zoom',
          selectedValue: 1,
          // The callback reads the numeric key back, so the context-facing
          // type has to admit it too.
          command: ({ option }) => (typeof option?.key === 'number' ? option.key * 100 : 0),
          options: [
            { label: '50%', key: 0.5 },
            { label: '100%', key: 1 },
          ],
        },
      ],
    },
  },
};

const _malformedRow: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [
        // @ts-expect-error a row needs both `label` and `key`; `key` is what reaches the command.
        { type: 'dropdown', name: 'rows', label: 'Rows', options: [{ label: 'No key' }] },
      ],
    },
  },
};

// A caret is a trigger by itself: `ToolbarButton` renders `.sd-dropdown-caret`
// on `v-if="hasCaret"` in the non-split branch, independent of icon and label.
// Requiring icon-or-label rejected this compact form while it kept rendering.
const _caretOnlyDropdown: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [
        {
          type: 'dropdown',
          name: 'compact',
          hasCaret: true,
          attributes: { ariaLabel: 'Pick one' },
          options: [{ label: 'Alpha', key: 'alpha' }],
        },
      ],
    },
  },
};

// `className` is spread into an array `:class` binding, so Vue's full class
// syntax resolves. A `string` type rejected the conditional form.
const _vueClassBinding: Config = {
  selector: '#editor',
  ui: {
    toolbar: {
      container: '#toolbar',
      customButtons: [
        {
          type: 'button',
          name: 'compactBtn',
          icon: '<svg />',
          attributes: { className: ['compact', { active: true, muted: false }], ariaLabel: 'Compact' },
          command: () => {},
        },
      ],
    },
  },
};

// Entries assembled outside the config object. Widening turns each `type` into
// `string`, so the array no longer matches the union even though the same
// entries compile inline -- which left `as const` and a per-entry assertion as
// the only ways through, and `as const` was itself rejected while the field
// was mutable. Both paths are asserted because both are what a consumer
// actually reaches for.
const preassembled: ToolbarCustomButton[] = [
  { type: 'button', name: 'saveVar', icon: '<svg />', command: () => {} },
  { type: 'separator', name: 'sepVar' },
];

const _annotatedArray: Config = {
  selector: '#editor',
  ui: { toolbar: { container: '#toolbar', customButtons: preassembled } },
};

const asConstEntries = [
  { type: 'button', name: 'saveConst', icon: '<svg />', command: () => {} },
  { type: 'separator', name: 'sepConst' },
] as const;

const _asConstArray: Config = {
  selector: '#editor',
  ui: { toolbar: { container: '#toolbar', customButtons: asConstEntries } },
};

export {
  _annotatedArray,
  _asConstArray,
  _caretOnlyDropdown,
  _vueClassBinding,
  _button,
  _stringCommand,
  _dropdown,
  _dropdownExtras,
  _renderRow,
  _separator,
  _buttonWithoutIcon,
  _dropdownWithoutRows,
  _rowsFromMap,
  _rowsFromVariable,
  _topLevelOptions,
  _topLevelOverflow,
  _activeState,
  _activeIcon,
  _readonlyRows,
  _numericKeys,
  _malformedRow,
  _renderRowWithoutRenderer,
  _dropdownNoTrigger,
  _buttonLabelAndRowValue,
};
