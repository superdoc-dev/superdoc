import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import ToolbarDropdown from './ToolbarDropdown.vue';

const waitForAnimationFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
let wrapper;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
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
});
