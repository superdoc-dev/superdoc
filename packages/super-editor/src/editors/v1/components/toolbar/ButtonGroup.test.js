import { describe, it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { h, ref } from 'vue';
import ButtonGroup from './ButtonGroup.vue';

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
    expect(options[1].props.class).toBe('selected');
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
