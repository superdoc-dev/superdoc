import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect } from 'storybook/test';

import App from '../../../../../e2e-tests/templates/vue/src/App.vue';
import { CustomMark } from '../../../../../e2e-tests/templates/vue/src/custom-mark.js';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
const meta = {
  title: 'E2E Tests/Toolbar',
  component: App,
  tags: ['!autodocs'],
  argTypes: {
    onReady: { table: { disable: true } },
  },
  args: {
    superDocConfig: {
      editorExtensions: [CustomMark],
      modules: {
        toolbar: {
          selector: '#toolbar',
          toolbarGroups: ['center'],
          customButtons: [
            {
              type: 'button',
              name: 'insertCustomMark',
              command: 'setMyCustomMark',
              tooltip: 'Insert Custom Mark',
              group: 'center',
              icon: '🎧',
              attributes: {
                ariaLabel: 'Insert Custom Mark',
              },
            },
          ],
        },
      },
      toolbar: null,
    },
  },
  mount: ({ args, canvas, renderToCanvas }) => async () => {
    const { promise: readyPromise, resolve: onReady } = Promise.withResolvers();
    args.onReady = onReady;

    await renderToCanvas();
    await readyPromise;
    return canvas;
  },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;



// import { test, expect } from '@playwright/test';
// import { ptToPx, sleep } from '../helpers.js';

export const CustomButtons: Story = {
  args: {
  },
  play: async({ canvas, userEvent }) => {
    // Find toolbar button and click it.
    // It should add a "data-custom-id" attribute to the "Hello" node.
    const customButton = await canvas.findByRole("button", { name: 'Insert Custom Mark' });

    await userEvent.click(customButton);
    await userEvent.keyboard('Hello');

    const hello = await canvas.findByText('Hello');
    const customAttribute = hello.getAttribute('data-custom-id');
    expect(customAttribute).not.toBeNull();
  },
}
