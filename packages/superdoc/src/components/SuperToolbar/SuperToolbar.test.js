import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

vi.mock('@superdoc/super-editor', () => ({
  Toolbar: defineComponent({
    name: 'ToolbarStub',
    emits: ['command'],
    setup(_, { emit, expose }) {
      expose({ triggerCommand: (payload) => emit('command', payload) });
      return () => h('div', { class: 'toolbar-stub' });
    },
  }),
}));

import SuperToolbar from './SuperToolbar.vue';

describe('SuperToolbar.vue', () => {
  const onToolbarCommand = vi.fn();

  const mountToolbar = () => {
    return mount(SuperToolbar, {
      global: {
        config: {
          globalProperties: {
            $superdoc: { onToolbarCommand },
          },
        },
      },
    });
  };

  it('renders the inner Toolbar', () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('.toolbar-stub').exists()).toBe(true);
  });

  it('forwards toolbar commands to $superdoc.onToolbarCommand', async () => {
    const wrapper = mountToolbar();
    const inner = wrapper.findComponent({ name: 'ToolbarStub' });
    await inner.vm.$emit('command', { item: 'bold', argument: true });
    expect(onToolbarCommand).toHaveBeenCalledWith({ item: 'bold', argument: true });
  });

  it('exposes innerToolbar via defineExpose', () => {
    const wrapper = mountToolbar();
    expect(wrapper.vm.innerToolbar).toBeDefined();
  });
});
