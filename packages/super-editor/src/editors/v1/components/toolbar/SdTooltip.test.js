import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SdTooltip from './SdTooltip.vue';

async function openTooltipWithTriggerRect(rect) {
  const wrapper = mount(SdTooltip, {
    attachTo: document.body,
    props: { delay: 0, duration: 0 },
    slots: { trigger: '<button type="button">Bold</button>', default: 'Bold' },
  });
  const trigger = wrapper.find('.sd-tooltip-trigger').element;
  trigger.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, toJSON() {} });
  await wrapper.find('.sd-tooltip-trigger').trigger('mouseenter');
  await flushPromises();
  await nextTick();
  return document.body.querySelector('.sd-tooltip-content');
}

describe('SdTooltip', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('flips below the trigger when there is no room above the viewport top', async () => {
    const content = await openTooltipWithTriggerRect({
      top: 5,
      bottom: 25,
      left: 100,
      right: 140,
      width: 40,
      height: 20,
    });
    expect(content).not.toBeNull();
    expect(content.style.top).toBe('35px');
    expect(content.classList.contains('sd-tooltip-content--bottom')).toBe(true);
  });

  it('stays above the trigger when there is room', async () => {
    const content = await openTooltipWithTriggerRect({
      top: 500,
      bottom: 520,
      left: 100,
      right: 140,
      width: 40,
      height: 20,
    });
    expect(content).not.toBeNull();
    // contentHeight is 0 in jsdom, so above = top - 0 - 10 = 490.
    expect(content.style.top).toBe('490px');
    expect(content.classList.contains('sd-tooltip-content--bottom')).toBe(false);
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
