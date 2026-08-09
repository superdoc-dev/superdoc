import { afterEach, describe, expect, it } from 'vite-plus/test';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ButtonGroup from './ButtonGroup.vue';
import { useToolbarItem } from './use-toolbar-item.js';
import { TOOLBAR_FONTS, TOOLBAR_FONT_SIZES } from './constants.js';

let wrapper;

const makeFontControls = () => {
  const fontFamily = useToolbarItem({
    type: 'dropdown',
    name: 'fontFamily',
    command: 'setFontFamily',
    label: 'Arial',
    defaultLabel: 'Arial',
    hasCaret: true,
    hasInlineTextInput: true,
    inlineTextInputVisible: true,
    isWide: true,
    attributes: { ariaLabel: 'Font family' },
    options: TOOLBAR_FONTS,
  });
  const separator = useToolbarItem({ type: 'separator', name: 'separator', isNarrow: true });
  const fontSize = useToolbarItem({
    type: 'dropdown',
    name: 'fontSize',
    command: 'setFontSize',
    label: '12',
    defaultLabel: '12',
    hasCaret: true,
    hasInlineTextInput: true,
    inlineTextInputVisible: true,
    isWide: true,
    attributes: { ariaLabel: 'Font size' },
    options: TOOLBAR_FONT_SIZES,
  });
  return [fontFamily, separator, fontSize];
};

const mountGroup = (toolbarItems) => {
  wrapper = mount(ButtonGroup, {
    props: { toolbarItems, overflowItems: [], position: 'center' },
    attachTo: document.body,
    global: {
      config: {
        globalProperties: {
          $toolbar: { toolbarItems, overflowItems: [] },
        },
      },
    },
  });
  return wrapper;
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('ButtonGroup font-family combobox wiring', () => {
  it('renders the editable combobox for the font-family item', () => {
    mountGroup(makeFontControls());

    const combobox = document.body.querySelector('[data-item="btn-fontFamily"] input[role="combobox"]');
    expect(combobox).not.toBeNull();
    expect(combobox?.getAttribute('aria-label')).toBe('Font family');
  });

  it('renders the editable combobox for the font-size item', () => {
    mountGroup(makeFontControls());

    const combobox = document.body.querySelector('[data-item="btn-fontSize"] input[role="combobox"]');
    expect(combobox).not.toBeNull();
    expect(combobox?.getAttribute('aria-label')).toBe('Font size');
  });

  it('moves focus from the font-family combobox to the font-size field on Tab', async () => {
    mountGroup(makeFontControls());

    const combobox = wrapper.get('[data-item="btn-fontFamily"] input[role="combobox"]');
    combobox.element.focus();
    await combobox.trigger('keydown', { key: 'Tab' });
    await nextTick();

    const fontSizeInput = document.getElementById('inlineTextInput-fontSize');
    expect(fontSizeInput).not.toBeNull();
    expect(document.activeElement).toBe(fontSizeInput);
  });

  it('moves focus from the font-size field back to the font-family combobox on Shift+Tab', async () => {
    mountGroup(makeFontControls());

    const fontSizeInput = document.getElementById('inlineTextInput-fontSize');
    fontSizeInput.focus();
    fontSizeInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const combobox = document.getElementById('inlineTextInput-fontFamily');
    expect(combobox).not.toBeNull();
    expect(document.activeElement).toBe(combobox);
  });

  it('moves focus from the font-size combobox to the editor on Tab (Word chain end)', async () => {
    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    editor.tabIndex = -1;
    document.body.appendChild(editor);

    mountGroup(makeFontControls());

    const fontSizeInput = document.getElementById('inlineTextInput-fontSize');
    fontSizeInput.focus();
    fontSizeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    await nextTick();

    expect(document.activeElement).toBe(editor);
    editor.remove();
  });
});
