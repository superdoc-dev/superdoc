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

  it('flips to bottom placement when there is not enough space above the trigger', async () => {
    // Trigger at top=20, bottom=40 in a 768px tall viewport.
    // offset=10, GUTTER=8 → availableAbove = max(0, 20 - 10 - 8) = 2
    // availableBelow = max(0, 768 - 40 - 10 - 8) = 710
    // contentHeight=60 > availableAbove=2, so the tooltip must flip to 'bottom'.
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });

    // happy-dom does not compute layout; mock geometry so the flip condition and position check fire.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      return this.classList.contains('sd-tooltip-content') ? 60 : 0;
    });

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.classList.contains('sd-tooltip-trigger')) {
        return { top: 20, bottom: 40, left: 400, right: 420, width: 20, height: 20, x: 400, y: 20, toJSON() {} };
      }
      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} };
    });

    const wrapper = mount(SdTooltip, {
      attachTo: document.body,
      props: { delay: 0, duration: 0 },
      slots: {
        trigger: '<button type="button">Hover me</button>',
        default: 'Tooltip text',
      },
    });

    await wrapper.find('.sd-tooltip-trigger').trigger('mouseenter');
    await nextTick();

    const arrowEl = document.body.querySelector('.sd-tooltip-arrow');
    expect(arrowEl).not.toBeNull();
    expect(arrowEl.classList.contains('sd-tooltip-arrow-bottom')).toBe(true);

    // Tooltip must be positioned below the trigger (not cut off above)
    const topValue = parseInt(document.body.querySelector('.sd-tooltip-content').style.top, 10);
    expect(topValue).toBeGreaterThanOrEqual(40);
  });
});
