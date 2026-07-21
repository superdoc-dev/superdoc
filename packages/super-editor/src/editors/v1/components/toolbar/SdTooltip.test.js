import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SdTooltip from './SdTooltip.vue';

// jsdom reports 0 for offset/client sizes; mock the accessor so positioning math is actually exercised.
const metricRestores = [];
function mockAccessor(target, prop, value) {
  const prev = Object.getOwnPropertyDescriptor(target, prop);
  Object.defineProperty(target, prop, { configurable: true, get: () => value });
  metricRestores.push(() => (prev ? Object.defineProperty(target, prop, prev) : delete target[prop]));
}

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
    metricRestores.splice(0).forEach((restore) => restore());
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('flips below based on the tooltip height, not only when the trigger touches the top', async () => {
    mockAccessor(HTMLElement.prototype, 'offsetHeight', 40);
    // above = 30 - 40 - 10 = -20 < gutter → flips below (bottom + 10 = 60).
    const content = await openTooltipWithTriggerRect({
      top: 30,
      bottom: 50,
      left: 100,
      right: 140,
      width: 40,
      height: 20,
    });
    expect(content.style.top).toBe('60px');
    expect(content.classList.contains('sd-tooltip-content--bottom')).toBe(true);
  });

  it('clamps horizontally to clientWidth, excluding the window scrollbar', async () => {
    mockAccessor(HTMLElement.prototype, 'offsetWidth', 100);
    mockAccessor(document.documentElement, 'clientWidth', 500);
    // left 450 clamps to clientWidth - width - gutter = 500 - 100 - 8 = 392 (innerWidth stays 1024).
    const content = await openTooltipWithTriggerRect({
      top: 500,
      bottom: 520,
      left: 480,
      right: 520,
      width: 40,
      height: 20,
    });
    expect(content.style.left).toBe('392px');
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
