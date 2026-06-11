import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import FontFamilyCombobox from './FontFamilyCombobox.vue';

let wrapper;
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

const makeItem = () => ({
  id: ref('font-family'),
  type: 'dropdown',
  name: ref('fontFamily'),
  command: 'setFontFamily',
  label: ref('Arial'),
  defaultLabel: ref('Arial'),
  selectedValue: ref('Arial'),
  disabled: ref(false),
  expand: ref(false),
  style: ref({ width: '116px' }),
  attributes: ref({ ariaLabel: 'Font family' }),
  nestedOptions: ref([
    {
      key: 'Arial',
      label: 'Arial',
      props: { style: { fontFamily: 'Liberation Sans, sans-serif' }, 'data-item': 'btn-fontFamily-option' },
    },
    {
      key: 'Helvetica',
      label: 'Helvetica',
      props: { style: { fontFamily: 'Liberation Sans, sans-serif' }, 'data-item': 'btn-fontFamily-option' },
    },
    {
      key: 'Times New Roman',
      label: 'Times New Roman',
      props: { style: { fontFamily: 'Liberation Serif, serif' }, 'data-item': 'btn-fontFamily-option' },
    },
  ]),
});

const mountCombobox = (item = makeItem()) => {
  wrapper = mount(FontFamilyCombobox, {
    props: { item, uiFontFamily: 'Inter, sans-serif' },
    attachTo: document.body,
  });
  return { item, input: wrapper.get('input') };
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  } else {
    delete HTMLElement.prototype.scrollIntoView;
  }
  vi.restoreAllMocks();
});

describe('FontFamilyCombobox', () => {
  it('focuses and selects the input without opening the list', async () => {
    const { input } = mountCombobox();

    await input.trigger('mousedown');
    await nextTick();

    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(input.attributes('aria-expanded')).toBe('false');
    expect(input.element.selectionStart).toBe(0);
    expect(input.element.selectionEnd).toBe('Arial'.length);
  });

  it('opens the list from the caret control', async () => {
    const { input } = mountCombobox();

    await input.trigger('focus');
    await wrapper.get('[data-item="btn-fontFamily-toggle"]').trigger('mousedown');
    await nextTick();

    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    expect(input.attributes('aria-expanded')).toBe('true');
  });

  it('opens when the toolbar item expand flag is set by roving keyboard activation', async () => {
    const { item, input } = mountCombobox();

    item.expand.value = true;
    await nextTick();
    await nextTick();

    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    expect(input.attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(input.element);
  });

  it('does not leave the toolbar item expanded when no font options exist', async () => {
    const item = {
      ...makeItem(),
      nestedOptions: ref([]),
    };
    mountCombobox(item);

    item.expand.value = true;
    await nextTick();
    await nextTick();

    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(item.expand.value).toBe(false);
  });

  it('autocompletes while collapsed and applies the logical font name on Enter', async () => {
    const { input } = mountCombobox();

    await input.trigger('focus');
    await input.setValue('hel');

    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(input.element.value).toBe('Helvetica');

    await input.trigger('keydown', { key: 'Enter' });

    const event = wrapper.emitted('command')?.[0]?.[0];
    expect(event.argument).toBe('Helvetica');
    expect(event.item.command).toBe('setFontFamily');
  });

  it('applies an autocompleted font on Tab and delegates toolbar focus movement', async () => {
    const { input } = mountCombobox();

    await input.trigger('focus');
    await input.setValue('hel');
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    input.element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted('command')?.[0]?.[0].argument).toBe('Helvetica');
    expect(wrapper.emitted('tab-out')?.[0]?.[0]).toBe(event);
  });

  it('keeps the full list open while typing, highlights the match, and applies it', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const { input } = mountCombobox();

    await input.trigger('focus');
    await wrapper.get('[data-item="btn-fontFamily-toggle"]').trigger('mousedown');
    await nextTick();
    await input.setValue('ti');
    await nextTick();

    const listbox = document.body.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(document.body.querySelector('[aria-selected="true"]')?.textContent).toContain('Arial');
    expect(document.body.querySelector('.sd-active')?.textContent).toContain('Times New Roman');
    expect(scrollIntoView).toHaveBeenCalled();

    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('command')?.[0]?.[0].argument).toBe('Times New Roman');
  });

  it('opens with ArrowDown at the typed match when collapsed', async () => {
    const { input } = mountCombobox();

    await input.trigger('focus');
    await input.setValue('ti');
    await input.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();

    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    expect(document.body.querySelector('.sd-active')?.textContent).toContain('Times New Roman');
  });

  it('syncs autocomplete when an IME composition ends', async () => {
    const { input } = mountCombobox();

    await input.trigger('focus');
    await input.trigger('compositionstart');
    input.element.value = 'hel';
    await input.trigger('input');
    expect(input.element.value).toBe('hel');

    await input.trigger('compositionend');
    await nextTick();

    expect(input.element.value).toBe('Helvetica');
    expect(input.element.selectionStart).toBe(3);
    expect(input.element.selectionEnd).toBe('Helvetica'.length);
  });

  it('applies a typed custom font as a bare logical family', async () => {
    const { input } = mountCombobox();

    await input.trigger('focus');
    await input.setValue('Brand Sans');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('command')?.[0]?.[0]).toMatchObject({
      argument: 'Brand Sans',
      option: null,
    });
  });

  it('normalizes a typed custom font before applying it', async () => {
    const { input } = mountCombobox();

    await input.trigger('focus');
    await input.setValue('"Brand Sans", sans-serif');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('command')?.[0]?.[0]).toMatchObject({
      argument: 'Brand Sans',
      option: null,
    });
  });

  it('keeps the caret position for mid-string custom edits', async () => {
    const { input } = mountCombobox();

    await input.trigger('focus');
    input.element.value = 'Brand Sans';
    input.element.setSelectionRange(5, 5);
    await input.trigger('input', { inputType: 'insertText' });

    expect(input.element.value).toBe('Brand Sans');
    expect(input.element.selectionStart).toBe(5);
    expect(input.element.selectionEnd).toBe(5);
  });

  it('restores the applied label on Escape without applying a command', async () => {
    const { input } = mountCombobox();

    await input.trigger('focus');
    await input.setValue('Brand Sans');
    expect(input.element.value).toBe('Brand Sans');

    await input.trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(input.element.value).toBe('Arial');
    expect(document.activeElement).toBe(input.element);
    expect(wrapper.emitted('command')).toBeUndefined();
  });

  it('emits item-clicked on focus so the toolbar can restore the document selection', async () => {
    const { input } = mountCombobox();

    await input.trigger('focus');

    expect(wrapper.emitted('item-clicked')).toHaveLength(1);
  });

  it('hides the legacy label from assistive technology', () => {
    mountCombobox();

    expect(wrapper.get('.sd-font-combobox__legacy-label').attributes('aria-hidden')).toBe('true');
  });
});
