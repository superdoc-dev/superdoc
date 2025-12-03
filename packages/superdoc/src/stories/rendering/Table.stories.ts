import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { pixelsToTwips } from '@converter/helpers';
import Table from './Table.vue';

const meta = {
  title: 'Rendering/Table',
  component: Table,
  tags: ['autodocs'],
  args: {
    columns: 3,
    rows: 2,
  },
  argTypes: {
  },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SimpleTable: Story = {
};

export const FixedWidth: Story = {
  args: {
    columns: 3,
    rows: 3,
    tableAttrs: {
      grid: [
        { col: pixelsToTwips(150) },
        { col: pixelsToTwips(250) },
        { col: pixelsToTwips(50) },
      ],
      tableProperties: {
        tableWidth: {
          value: 0,
          type: 'auto',
        },
      },
    },
  },
};

export const NoBorders: Story = {
  args: {
    tableAttrs: {
      borders: null,
    },
    cellAttrs: {
      borders: null,
    },
  },
};
