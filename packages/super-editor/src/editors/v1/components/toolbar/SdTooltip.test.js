import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SdTooltip from './SdTooltip.vue';

describe('SdTooltip', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  describe('positioning', () => {
    const TOOLTIP_WIDTH = 120;
    const TOOLTIP_HEIGHT = 34;

    const makeRect = ({ top, left, width, height }) => ({
      top,
      left,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    });

    // happy-dom does not compute layout: every measurement API returns 0. Geometry is
    // injected through all of them (offset* and getBoundingClientRect) so the tests do
    // not depend on which one the component reads.
    const stubLayout = (triggerRect) => {
      const isTooltipContent = (el) => el.classList?.contains('sd-tooltip-content');
      const contentRect = makeRect({ top: 0, left: 0, width: TOOLTIP_WIDTH, height: TOOLTIP_HEIGHT });

      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
        return isTooltipContent(this) ? TOOLTIP_WIDTH : triggerRect.width;
      });
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
        return isTooltipContent(this) ? TOOLTIP_HEIGHT : triggerRect.height;
      });
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        return isTooltipContent(this) ? contentRect : triggerRect;
      });
    };

    const mountAndOpen = async (triggerRect) => {
      stubLayout(triggerRect);

      const wrapper = mount(SdTooltip, {
        attachTo: document.body,
        props: {
          delay: 0,
          duration: 0,
        },
        slots: {
          trigger: '<button type="button">Undo</button>',
          default: 'Undo',
        },
      });

      await wrapper.find('.sd-tooltip-trigger').trigger('mouseenter');
      await nextTick();
      await nextTick();
      return document.body.querySelector('.sd-tooltip-content');
    };

    const renderedTop = (content) => parseFloat(content.style.top);

    it('renders fully above the trigger when there is room', async () => {
      const triggerRect = makeRect({ top: 200, left: 300, width: 32, height: 32 });
      const content = await mountAndOpen(triggerRect);

      expect(renderedTop(content)).toBeGreaterThanOrEqual(0);
      expect(renderedTop(content) + TOOLTIP_HEIGHT).toBeLessThanOrEqual(triggerRect.top);
    });

    it('stays inside the viewport and clear of the trigger when the trigger is flush with the top', async () => {
      const triggerRect = makeRect({ top: 0, left: 100, width: 32, height: 32 });
      const content = await mountAndOpen(triggerRect);

      expect(renderedTop(content)).toBeGreaterThanOrEqual(0);
      expect(renderedTop(content)).toBeGreaterThanOrEqual(triggerRect.bottom);
    });

    // data-placement is the styling contract the component's own CSS uses to orient
    // the arrow and the transition origin toward the trigger.
    it('marks the placement so the arrow points at the trigger from either side', async () => {
      const flushTopRect = makeRect({ top: 0, left: 100, width: 32, height: 32 });
      expect((await mountAndOpen(flushTopRect)).dataset.placement).toBe('bottom');

      document.body.innerHTML = '';
      vi.restoreAllMocks();

      const roomyRect = makeRect({ top: 200, left: 300, width: 32, height: 32 });
      expect((await mountAndOpen(roomyRect)).dataset.placement).toBe('top');
    });
  });
});
