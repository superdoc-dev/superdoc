import { describe, it, expect } from 'vitest';
import { updateDOMAttributes } from './updateDOMAttributes.js';

describe('updateDOMAttributes', () => {
  it('sets and removes standard attributes based on values', () => {
    const element = document.createElement('input');
    element.setAttribute('data-existing', 'keep');

    updateDOMAttributes(element, {
      placeholder: 'Enter text',
      'data-existing': null,
      required: true,
      checked: false,
    });

    expect(element.getAttribute('placeholder')).toBe('Enter text');
    expect(element.hasAttribute('data-existing')).toBe(false);
    expect(element.hasAttribute('required')).toBe(true);
    expect(element.hasAttribute('checked')).toBe(false);
  });

  it('supports custom boolean attributes supplied via options', () => {
    const element = document.createElement('div');

    const options = { customBooleans: ['data-active'] };

    updateDOMAttributes(
      element,
      {
        'data-active': true,
        role: 'note',
      },
      options,
    );

    expect(element.hasAttribute('data-active')).toBe(true);
    expect(element.getAttribute('role')).toBe('note');

    updateDOMAttributes(element, { 'data-active': false }, options);
    expect(element.hasAttribute('data-active')).toBe(false);
  });
});
