import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

vi.mock('@stores/superdoc-store', () => ({
  useSuperdocStore: () => ({
    documentUsers: ref([
      { name: 'Alice', email: 'a@x.com' },
      { name: 'Bob', email: 'b@x.com' },
      { name: 'Carol', email: 'c@x.com' },
    ]),
  }),
}));

vi.mock('pinia', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    storeToRefs: (store) => store,
  };
});

import DocumentUsers from './DocumentUsers.vue';

describe('DocumentUsers.vue', () => {
  it('renders all users when no filter is provided', () => {
    const wrapper = mount(DocumentUsers);
    const rows = wrapper.findAll('.user-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].text()).toBe('Alice');
  });

  it('filters users by case-insensitive prefix match', () => {
    const wrapper = mount(DocumentUsers, { props: { filter: 'b' } });
    const rows = wrapper.findAll('.user-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toBe('Bob');
  });

  it('matches filter case-insensitively', () => {
    const wrapper = mount(DocumentUsers, { props: { filter: 'A' } });
    expect(wrapper.findAll('.user-row')).toHaveLength(1);
  });

  it('renders no rows when filter has no matches', () => {
    const wrapper = mount(DocumentUsers, { props: { filter: 'zzz' } });
    expect(wrapper.findAll('.user-row')).toHaveLength(0);
  });
});
