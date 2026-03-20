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
