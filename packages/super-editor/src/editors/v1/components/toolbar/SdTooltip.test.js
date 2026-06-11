import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SdTooltip from './SdTooltip.vue';

describe('SdTooltip', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('auto-hides after the configured visible duration', async () => {
    vi.useFakeTimers();
    const wrapper = mount(SdTooltip, {
      attachTo: document.body,
      props: {
        delay: 0,
        duration: 0,
        autoHideDuration: 3000,
      },
      slots: {
        trigger: '<button type="button">Font family</button>',
        default: 'Font family',
      },
    });

    await wrapper.find('.sd-tooltip-trigger').trigger('mouseenter');
    await nextTick();
    expect(document.body.querySelector('.sd-tooltip-content')?.textContent).toContain('Font family');

    vi.advanceTimersByTime(2999);
    await nextTick();
    expect(document.body.querySelector('.sd-tooltip-content')).not.toBeNull();

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(document.body.querySelector('.sd-tooltip-content')).toBeNull();
  });
});
