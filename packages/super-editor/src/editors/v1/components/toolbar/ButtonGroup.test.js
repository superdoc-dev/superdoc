import { afterEach, describe, it, expect, vi } from 'vitest';
import { mount, shallowMount } from '@vue/test-utils';
import { h, nextTick, ref } from 'vue';
import ButtonGroup from './ButtonGroup.vue';

const waitForAnimationFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const createDropdownItem = (selectedKey) => ({
  type: 'dropdown',
  id: ref('btn-test'),
  name: ref('test'),
  isNarrow: ref(false),
  isWide: ref(false),
  disabled: ref(false),
  expand: ref(false),
  tooltip: ref('Test'),
  dropdownStyles: ref({}),
  dropdownValueKey: ref('key'),
  selectedValue: ref(selectedKey),
  attributes: ref({ ariaLabel: 'Test dropdown' }),
  nestedOptions: ref([
    {
      key: 'render-match',
      type: 'render',
      render: () => h('div', 'render option'),
      props: {},
    },
    {
      key: 'plain-match',
      label: 'Plain option',
      props: {},
    },
  ]),
});

const mountWithItem = (item) =>
  shallowMount(ButtonGroup, {
    props: {
      toolbarItems: [item],
      overflowItems: [],
    },
  });

describe('ButtonGroup dropdownOptions selected class', () => {
  it('does not mark render option as selected even when selectedValue matches', () => {
    const wrapper = mountWithItem(createDropdownItem('render-match'));
    const options = wrapper.findComponent({ name: 'ToolbarDropdown' }).props('options');

    expect(options[0].type).toBe('render');
    expect(options[0].props.class).toBe('');
  });

  it('marks non-render option as selected when selectedValue matches', () => {
    const wrapper = mountWithItem(createDropdownItem('plain-match'));
    const options = wrapper.findComponent({ name: 'ToolbarDropdown' }).props('options');

    expect(options[1].type).toBeUndefined();
    expect(options[1].props.class).toBe('sd-selected');
  });
});

// PR #3226: ButtonGroup forwards a button item's static `argument` (set via
// useToolbarItem({argument})) on click when no caller arg is passed. This is
// how custom buttons carry fixed args like {direction, alignmentPolicy} into
// emit('command'). If this breaks, such buttons become silent no-ops.
describe('ButtonGroup button argument forwarding', () => {
  // `type` and `command` are plain (not refs) in useToolbarItem; the rest are refs.
  const createButtonItem = (argument) => ({
    type: 'button',
    command: 'setParagraphDirection',
    id: ref('btn-test'),
    name: ref('directionLtr'),
    argument: argument === undefined ? undefined : ref(argument),
    disabled: ref(false),
    isNarrow: ref(false),
    isWide: ref(false),
    tooltip: ref('Test'),
    icon: ref(null),
    active: ref(false),
    expand: ref(false),
    attributes: ref({ ariaLabel: 'Test button' }),
  });

  // shallowMount stubs all children including SdTooltip; SdTooltip is what
  // wraps the button branch via <template #trigger>. Provide a custom stub
  // that renders its trigger slot so the ToolbarButton stub becomes findable.
  const mountButtonItem = (item) =>
    shallowMount(ButtonGroup, {
      props: { toolbarItems: [item], overflowItems: [] },
      global: {
        stubs: {
          SdTooltip: {
            name: 'SdTooltip',
            template: '<div><slot name="trigger" /></div>',
          },
        },
      },
    });

  const findToolbarButton = (wrapper) => wrapper.findComponent({ name: 'ToolbarButton' });

  it('plain button click forwards item.argument.value into command emission', () => {
    const argument = { direction: 'ltr', alignmentPolicy: 'matchDirection' };
    const wrapper = mountButtonItem(createButtonItem(argument));
    const button = findToolbarButton(wrapper);

    button.vm.$emit('buttonClick');

    const events = wrapper.emitted('command');
    expect(events).toHaveLength(1);
    expect(events[0][0].argument).toEqual(argument);
  });

  it('emits null argument when item has no static argument', () => {
    const wrapper = mountButtonItem(createButtonItem(undefined));
    const button = findToolbarButton(wrapper);

    button.vm.$emit('buttonClick');

    const events = wrapper.emitted('command');
    expect(events).toHaveLength(1);
    expect(events[0][0].argument).toBeNull();
  });

  it('directionLtr-shaped item forwards {direction:ltr, alignmentPolicy:matchDirection}', () => {
    const argument = { direction: 'ltr', alignmentPolicy: 'matchDirection' };
    const wrapper = mountButtonItem(createButtonItem(argument));
    const button = findToolbarButton(wrapper);

    button.vm.$emit('buttonClick');

    const events = wrapper.emitted('command');
    expect(events[0][0].argument.direction).toBe('ltr');
    expect(events[0][0].argument.alignmentPolicy).toBe('matchDirection');
  });

  it('directionRtl-shaped item forwards {direction:rtl, alignmentPolicy:matchDirection}', () => {
    const argument = { direction: 'rtl', alignmentPolicy: 'matchDirection' };
    const wrapper = mountButtonItem(createButtonItem(argument));
    const button = findToolbarButton(wrapper);

    button.vm.$emit('buttonClick');

    const events = wrapper.emitted('command');
    expect(events[0][0].argument.direction).toBe('rtl');
    expect(events[0][0].argument.alignmentPolicy).toBe('matchDirection');
  });

  it('skips command emission when item is disabled', () => {
    const disabledItem = { ...createButtonItem({ direction: 'ltr' }), disabled: ref(true) };
    const wrapper = mountButtonItem(disabledItem);
    const button = findToolbarButton(wrapper);

    button.vm.$emit('buttonClick');

    expect(wrapper.emitted('command')).toBeUndefined();
  });
});

describe('ButtonGroup dropdown keyboard activation', () => {
  it.each(['Enter', ' ', 'Spacebar'])('opens a dropdown item with %s', async (key) => {
    const item = createDropdownItem('plain-match');
    const wrapper = mountWithItem(item);

    await wrapper.find('.sd-toolbar-item-ctn').trigger('keydown', { key });

    expect(item.expand.value).toBe(true);
  });
});

// Regression for the codex P2 finding on PR #3304: after Escape closes the
// dropdown, ToolbarDropdown.rememberTriggerFocusTarget restores focus to the
// inner `.sd-toolbar-item` (ToolbarButton root, role="button", tabindex="0"),
// not to `.sd-toolbar-item-ctn`. ToolbarButton used to handle Enter with
// `@keydown.enter.stop`, which silently swallowed the event before
// ButtonGroup's roving-tabindex handler could see it. Pressing Enter on the
// restored focus would emit `buttonClick` (no listener on the dropdown
// branch) and do nothing, so the dropdown could never be reopened by
// keyboard until focus moved elsewhere.
//
// Fix is the `allowEnterPropagation` prop on ToolbarButton: when true the
// keydown handler does NOT stopPropagation, so Enter bubbles to
// `.sd-toolbar-item-ctn` and ButtonGroup.activateToolbarItem runs.
// Note: this only applies to non-split dropdown items. Split buttons
// (bullet list / numbered list main button) call handleSplitMainClick on
// Enter which itself stops propagation and runs the main command instead.
describe('ButtonGroup dropdown trigger keyboard activation (codex P2 regression)', () => {
  let wrapper;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  // `mount()` renders the real ToolbarButton, which destructures more
  // refs off the toolbar item than `createDropdownItem` above provides.
  // Build a fuller item with every ref ToolbarButton expects.
  const createFullDropdownItem = (selectedKey = 'plain-match') => ({
    ...createDropdownItem(selectedKey),
    active: ref(false),
    icon: ref(null),
    label: ref('Test'),
    hideLabel: ref(false),
    iconColor: ref(null),
    hasCaret: ref(true),
    splitButton: ref(false),
    inlineTextInputVisible: ref(false),
    hasInlineTextInput: ref(false),
    minWidth: ref(null),
    style: ref(null),
  });

  // Real ToolbarButton (no stub) inside the dropdown branch so we exercise
  // the actual @keydown.enter handler + allowEnterPropagation plumbing.
  const mountWithDropdownItem = (item, globalOverrides = {}) =>
    mount(ButtonGroup, {
      props: { toolbarItems: [item], overflowItems: [] },
      attachTo: document.body,
      global: {
        ...globalOverrides,
        stubs: {
          // Render SdTooltip's trigger slot so the real ToolbarButton mounts.
          SdTooltip: { name: 'SdTooltip', template: '<div><slot name="trigger" /></div>' },
          ...(globalOverrides.stubs ?? {}),
        },
      },
    });

  it('Enter on the inner .sd-toolbar-item bubbles up and opens the dropdown', async () => {
    const item = createFullDropdownItem('plain-match');
    wrapper = mountWithDropdownItem(item);

    const innerItem = wrapper.find('.toolbar-dropdown-trigger .sd-toolbar-item').element;
    expect(innerItem.getAttribute('tabindex')).toBe('0');
    expect(innerItem.getAttribute('role')).toBe('button');

    innerItem.focus();
    expect(document.activeElement).toBe(innerItem);

    innerItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();

    expect(item.expand.value).toBe(true);
  });

  it('after Escape closes the dropdown, a second Enter on the restored focus reopens it', async () => {
    const item = createFullDropdownItem('plain-match');
    wrapper = mountWithDropdownItem(item);

    const ctn = wrapper.find('.sd-toolbar-item-ctn').element;
    const innerItem = wrapper.find('.toolbar-dropdown-trigger .sd-toolbar-item').element;

    // Open the dropdown the way Tab + Enter does (focus on ctn).
    ctn.focus();
    ctn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    await nextTick();
    expect(item.expand.value).toBe(true);

    // Escape closes and ToolbarDropdown restores focus to the inner item.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    await waitForAnimationFrame();
    expect(item.expand.value).toBe(false);
    expect(document.activeElement).toBe(innerItem);

    // Enter on the inner item must reopen the dropdown (the bug previously
    // left it closed because ToolbarButton's @keydown.enter.stop swallowed
    // the event before ButtonGroup could handle it).
    innerItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    expect(item.expand.value).toBe(true);
  });

  it('Space on the inner .sd-toolbar-item also opens the dropdown (control)', async () => {
    const item = createFullDropdownItem('plain-match');
    wrapper = mountWithDropdownItem(item);

    const innerItem = wrapper.find('.toolbar-dropdown-trigger .sd-toolbar-item').element;
    innerItem.focus();
    innerItem.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await nextTick();

    expect(item.expand.value).toBe(true);
  });

  // Pin existing split-button behavior so it does not silently change.
  // Bullet/Numbered list main buttons are split: Enter runs the main
  // command (mainClick) and does NOT toggle the dropdown. The
  // `allowEnterPropagation` flag has no effect because handleSplitMainClick
  // stops propagation internally.
  it('split button: Enter on inner runs the main command and does NOT open the dropdown', async () => {
    const item = {
      ...createFullDropdownItem('plain-match'),
      splitButton: ref(true),
      hasCaret: ref(true),
      // ButtonGroup.handleSplitButtonMainClick uses these as plain
      // properties (not refs) to choose which command to emit.
      splitButtonCommand: 'toggleBulletList',
    };
    wrapper = mountWithDropdownItem(item);

    const innerItem = wrapper.find('.toolbar-dropdown-trigger .sd-toolbar-item').element;
    innerItem.focus();
    innerItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();

    // Dropdown must stay closed.
    expect(item.expand.value).toBe(false);
    // ButtonGroup emits 'command' with the split-main command, not the
    // dropdown's selected option - so the rest of the editor runs the
    // main action (e.g. toggleBulletList) on this keystroke.
    const events = wrapper.emitted('command');
    expect(events).toHaveLength(1);
    expect(events[0][0].item.command).toBe('toggleBulletList');
    expect(events[0][0].argument).toBeNull();
  });

  it('does not open the font size dropdown when clicking inside the size input', async () => {
    const item = {
      ...createFullDropdownItem('12pt'),
      name: ref('fontSize'),
      label: ref('12'),
      selectedValue: ref('12pt'),
      inlineTextInputVisible: ref(true),
      hasInlineTextInput: ref(true),
      nestedOptions: ref([{ key: '12pt', label: '12', props: { 'data-item': 'btn-fontSize-option' } }]),
    };
    wrapper = mountWithDropdownItem(item);

    await wrapper.get('#inlineTextInput-fontSize').trigger('click');
    expect(item.expand.value).toBe(false);

    const caret = wrapper.get('[data-item="btn-fontSize-caret"]');
    expect(caret.attributes('aria-label')).toBe('Test dropdown options');

    await caret.trigger('click');
    expect(item.expand.value).toBe(true);
  });

  it('wraps the font family combobox in the toolbar tooltip', () => {
    const item = {
      ...createFullDropdownItem('Arial'),
      command: 'setFontFamily',
      id: ref('font-family'),
      name: ref('fontFamily'),
      label: ref('Arial'),
      selectedValue: ref('Arial'),
      nestedOptions: ref([
        { key: 'Arial', label: 'Arial', props: { style: { fontFamily: 'Arial' } } },
        { key: 'Helvetica', label: 'Helvetica', props: { style: { fontFamily: 'Helvetica' } } },
      ]),
    };
    wrapper = mountWithDropdownItem(item);

    expect(wrapper.findComponent({ name: 'SdTooltip' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'FontFamilyCombobox' }).exists()).toBe(true);
  });

  it('does not render the font family combobox when the font options list is empty', () => {
    const item = {
      ...createFullDropdownItem('Arial'),
      command: 'setFontFamily',
      id: ref('font-family'),
      name: ref('fontFamily'),
      label: ref('Arial'),
      selectedValue: ref('Arial'),
      nestedOptions: ref([]),
    };
    wrapper = mountWithDropdownItem(item);

    expect(wrapper.findComponent({ name: 'FontFamilyCombobox' }).exists()).toBe(false);
  });

  it('opens the font family combobox from roving keyboard activation', async () => {
    const item = {
      ...createFullDropdownItem('Arial'),
      command: 'setFontFamily',
      id: ref('font-family'),
      name: ref('fontFamily'),
      label: ref('Arial'),
      selectedValue: ref('Arial'),
      nestedOptions: ref([
        { key: 'Arial', label: 'Arial', props: { style: { fontFamily: 'Arial' } } },
        { key: 'Helvetica', label: 'Helvetica', props: { style: { fontFamily: 'Helvetica' } } },
      ]),
    };
    wrapper = mountWithDropdownItem(item);

    const ctn = wrapper.find('.sd-toolbar-item-ctn').element;
    ctn.focus();
    ctn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await nextTick();
    await nextTick();

    const input = wrapper.get('[data-item="btn-fontFamily"] input').element;
    expect(item.expand.value).toBe(true);
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('moves from font family to font size on Tab', async () => {
    const flushPendingMarkCommands = vi.fn(() => true);
    const fontFamily = {
      ...createFullDropdownItem('Arial'),
      command: 'setFontFamily',
      id: ref('font-family'),
      name: ref('fontFamily'),
      label: ref('Arial'),
      selectedValue: ref('Arial'),
      nestedOptions: ref([
        { key: 'Arial', label: 'Arial', props: { style: { fontFamily: 'Arial' } } },
        { key: 'Helvetica', label: 'Helvetica', props: { style: { fontFamily: 'Helvetica' } } },
      ]),
    };
    const separator = {
      type: 'separator',
      id: ref('separator'),
      disabled: ref(false),
      isNarrow: ref(false),
      isWide: ref(false),
    };
    const fontSize = {
      ...createFullDropdownItem('12pt'),
      command: 'setFontSize',
      id: ref('font-size'),
      name: ref('fontSize'),
      label: ref('12'),
      selectedValue: ref('12pt'),
      inlineTextInputVisible: ref(true),
      hasInlineTextInput: ref(true),
      nestedOptions: ref([{ key: '12pt', label: '12', props: { 'data-item': 'btn-fontSize-option' } }]),
    };
    // Mount the trio up front: production toolbar rebuilds re-mount ButtonGroup
    // with fresh props (Toolbar bumps its render key), so a mid-test setProps
    // swap does not model anything real. Rebuild survival is covered by the
    // browser-level Tab-flow behavior spec.
    wrapper = mount(ButtonGroup, {
      props: { toolbarItems: [fontFamily, separator, fontSize], overflowItems: [] },
      attachTo: document.body,
      global: {
        // Matches production: $toolbar is installed via app.config.globalProperties,
        // which is what getCurrentInstance().proxy can actually see.
        config: {
          globalProperties: {
            $toolbar: {
              flushPendingMarkCommands,
            },
          },
        },
        stubs: {
          SdTooltip: { name: 'SdTooltip', template: '<div><slot name="trigger" /></div>' },
        },
      },
    });

    const input = wrapper.get('[data-item="btn-fontFamily"] input');
    await input.trigger('focus');
    await input.setValue('hel');
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    input.element.dispatchEvent(event);
    await nextTick();
    await waitForAnimationFrame();
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(flushPendingMarkCommands).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('command')?.[0]?.[0].argument).toBe('Helvetica');
    const fontSizeInput = wrapper.get('#inlineTextInput-fontSize').element;
    expect(document.activeElement).toBe(fontSizeInput);
    await nextTick();
    expect(fontSizeInput.selectionStart).toBe(0);
    expect(fontSizeInput.selectionEnd).toBe(fontSizeInput.value.length);
  });

  it('moves from font size to the editor on Tab', async () => {
    const flushPendingMarkCommands = vi.fn(() => true);
    const item = {
      ...createFullDropdownItem('12pt'),
      command: 'setFontSize',
      id: ref('font-size'),
      name: ref('fontSize'),
      label: ref('12'),
      selectedValue: ref('12pt'),
      inlineTextInputVisible: ref(true),
      hasInlineTextInput: ref(true),
      nestedOptions: ref([{ key: '12pt', label: '12', props: { 'data-item': 'btn-fontSize-option' } }]),
    };
    const focusEditor = vi.fn();
    wrapper = mountWithDropdownItem(item, {
      config: {
        globalProperties: {
          $toolbar: {
            flushPendingMarkCommands,
            activeEditor: {
              focus: focusEditor,
            },
          },
        },
      },
    });

    const input = wrapper.get('#inlineTextInput-fontSize');
    await input.trigger('focus');
    await input.setValue('18');
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    input.element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted('command')?.[0]?.[0].argument).toBe('18');
    expect(flushPendingMarkCommands).toHaveBeenCalledTimes(1);
    expect(focusEditor).toHaveBeenCalledTimes(1);
  });

  it('flushes pending font marks when the font family combobox hands focus back to the editor', async () => {
    const flushPendingMarkCommands = vi.fn(() => true);
    const focusEditor = vi.fn();
    const item = {
      ...createFullDropdownItem('Arial'),
      command: 'setFontFamily',
      id: ref('font-family'),
      name: ref('fontFamily'),
      label: ref('Arial'),
      selectedValue: ref('Arial'),
      nestedOptions: ref([
        { key: 'Arial', label: 'Arial', props: { style: { fontFamily: 'Arial' } } },
        { key: 'Helvetica', label: 'Helvetica', props: { style: { fontFamily: 'Helvetica' } } },
      ]),
    };
    wrapper = mountWithDropdownItem(item, {
      config: {
        globalProperties: {
          $toolbar: {
            flushPendingMarkCommands,
            activeEditor: {
              focus: focusEditor,
            },
          },
        },
      },
    });

    wrapper.findComponent({ name: 'FontFamilyCombobox' }).vm.$emit('editor-handoff');
    await nextTick();

    expect(flushPendingMarkCommands).toHaveBeenCalledTimes(1);
    expect(focusEditor).toHaveBeenCalledTimes(1);
  });
});
