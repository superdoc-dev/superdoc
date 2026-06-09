import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import ToolbarDropdown from './ToolbarDropdown.vue';

const waitForAnimationFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
let wrapper;
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

const restoreDescriptor = (target, property, descriptor) => {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }
  delete target[property];
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  restoreDescriptor(window, 'innerHeight', originalInnerHeight);
  restoreDescriptor(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
  restoreDescriptor(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
});

describe('ToolbarDropdown keyboard focus', () => {
  it('returns focus to the trigger when Escape closes after option navigation', async () => {
    const Harness = defineComponent({
      components: { ToolbarDropdown },
      setup() {
        const show = ref(false);
        const options = [
          { key: 'georgia', label: 'Georgia', props: { class: 'sd-selected' } },
          { key: 'arial', label: 'Arial', props: {} },
          { key: 'courier', label: 'Courier New', props: {} },
        ];
        return { options, show };
      },
      template: `
        <ToolbarDropdown v-model:show="show" :options="options">
          <template #trigger>
            <button data-test="trigger" type="button">Font family</button>
          </template>
        </ToolbarDropdown>
      `,
    });

    wrapper = mount(Harness, { attachTo: document.body });
    const trigger = wrapper.get('[data-test="trigger"]');
    trigger.element.focus();
    expect(document.activeElement).toBe(trigger.element);

    wrapper.vm.show = true;
    await nextTick();
    await nextTick();

    const options = document.body.querySelectorAll('.toolbar-dropdown-option');
    expect(options).toHaveLength(3);
    expect(document.activeElement).toBe(options[0]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(options[1]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    await waitForAnimationFrame();

    expect(document.activeElement).toBe(trigger.element);
  });

  it('constrains long menus to the available viewport height', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 220 });

    const Harness = defineComponent({
      components: { ToolbarDropdown },
      setup() {
        const show = ref(false);
        const options = Array.from({ length: 30 }, (_, index) => ({
          key: `font-${index}`,
          label: `Font ${index}`,
          props: {},
        }));
        return { options, show };
      },
      template: `
        <ToolbarDropdown v-model:show="show" :options="options">
          <template #trigger>
            <button data-test="trigger" type="button">Font family</button>
          </template>
        </ToolbarDropdown>
      `,
    });

    wrapper = mount(Harness, { attachTo: document.body });
    const triggerRoot = wrapper.get('[data-sd-part="dropdown-trigger"]').element;
    triggerRoot.getBoundingClientRect = () => ({
      bottom: 40,
      left: 10,
      right: 120,
      top: 8,
      width: 110,
      height: 32,
      x: 10,
      y: 8,
      toJSON: () => {},
    });

    wrapper.vm.show = true;
    await nextTick();
    await nextTick();
    await nextTick();

    const menu = document.body.querySelector('.toolbar-dropdown-menu');
    expect(menu.style.maxHeight).toBe('168px');
  });

  it('flips a long menu above the trigger when there is not enough space below', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.classList?.contains('toolbar-dropdown-menu') ? 500 : 0;
      },
    });

    const Harness = defineComponent({
      components: { ToolbarDropdown },
      setup() {
        const show = ref(false);
        const options = Array.from({ length: 30 }, (_, index) => ({
          key: `font-${index}`,
          label: `Font ${index}`,
          props: {},
        }));
        return { options, show };
      },
      template: `
        <ToolbarDropdown v-model:show="show" :options="options">
          <template #trigger>
            <button data-test="trigger" type="button">Font family</button>
          </template>
        </ToolbarDropdown>
      `,
    });

    wrapper = mount(Harness, { attachTo: document.body });
    const triggerRoot = wrapper.get('[data-sd-part="dropdown-trigger"]').element;
    triggerRoot.getBoundingClientRect = () => ({
      bottom: 290,
      left: 10,
      right: 120,
      top: 260,
      width: 110,
      height: 30,
      x: 10,
      y: 260,
      toJSON: () => {},
    });

    wrapper.vm.show = true;
    await nextTick();
    await nextTick();
    await nextTick();

    const menu = document.body.querySelector('.toolbar-dropdown-menu');
    expect(menu.style.top).toBe('8px');
    expect(menu.style.maxHeight).toBe('248px');
  });

  it('scrolls the selected option into view after constraining the menu', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    const Harness = defineComponent({
      components: { ToolbarDropdown },
      setup() {
        const show = ref(false);
        const options = Array.from({ length: 14 }, (_, index) => ({
          key: `size-${index}`,
          label: `${index}`,
          props: index === 13 ? { class: 'sd-selected' } : {},
        }));
        return { options, show };
      },
      template: `
        <ToolbarDropdown v-model:show="show" :options="options">
          <template #trigger>
            <button data-test="trigger" type="button">Font size</button>
          </template>
        </ToolbarDropdown>
      `,
    });

    wrapper = mount(Harness, { attachTo: document.body });
    wrapper.vm.show = true;
    await nextTick();
    await nextTick();
    await nextTick();

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });
});
