import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vite-plus/test';
import LinkedStyle from './LinkedStyle.vue';

describe('LinkedStyle', () => {
  it('renders catalogue preview CSS on style option labels', () => {
    const wrapper = mount(LinkedStyle, {
      props: {
        styles: [
          {
            id: 'Heading1',
            name: 'Heading 1',
            preview: {
              available: true,
              css: {
                fontFamily: 'Aptos Display',
                fontSize: '16pt',
                fontWeight: 'bold',
              },
            },
          },
        ],
      },
    });

    const option = wrapper.find('[data-item="btn-linkedStyles-option"]');
    expect(option.text()).toBe('Heading 1');
    expect(option.element.style.fontFamily).toContain('Aptos Display');
    expect(option.element.style.fontSize).toBe('16pt');
    expect(option.element.style.fontWeight).toBe('bold');

    wrapper.unmount();
  });
});
