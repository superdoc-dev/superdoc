import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PasswordPromptSurface from './PasswordPromptSurface.vue';

const mountPrompt = (propsOverrides = {}) => {
  return mount(PasswordPromptSurface, {
    props: {
      surfaceId: 'test-1',
      mode: 'dialog',
      request: {},
      resolve: vi.fn(),
      close: vi.fn(),
      attemptPassword: vi.fn(async () => ({ success: true })),
      errorCode: 'DOCX_PASSWORD_REQUIRED',
      ...propsOverrides,
    },
  });
};

describe('PasswordPromptSurface', () => {
  it('renders password input, cancel, and submit buttons', () => {
    const wrapper = mountPrompt();

    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
    expect(wrapper.find('.sd-password-prompt__btn--cancel').exists()).toBe(true);
    expect(wrapper.find('.sd-password-prompt__btn--submit').exists()).toBe(true);
  });

  it('submit button is disabled when password is empty', () => {
    const wrapper = mountPrompt();
    const submit = wrapper.find('.sd-password-prompt__btn--submit');
    expect(submit.attributes('disabled')).toBeDefined();
  });

  it('submit button is enabled after typing a password', async () => {
    const wrapper = mountPrompt();
    await wrapper.find('input[type="password"]').setValue('secret');
    const submit = wrapper.find('.sd-password-prompt__btn--submit');
    expect(submit.attributes('disabled')).toBeUndefined();
  });

  it('calls attemptPassword with the entered password on submit', async () => {
    const attemptPassword = vi.fn(async () => ({ success: true }));
    const resolve = vi.fn();
    const wrapper = mountPrompt({ attemptPassword, resolve });

    await wrapper.find('input[type="password"]').setValue('my-pass');
    await wrapper.find('.sd-password-prompt__btn--submit').trigger('click');

    expect(attemptPassword).toHaveBeenCalledWith('my-pass');
  });

  it('shows busy state while attemptPassword is pending', async () => {
    let resolveAttempt;
    const attemptPassword = vi.fn(
      () =>
        new Promise((r) => {
          resolveAttempt = r;
        }),
    );
    const wrapper = mountPrompt({ attemptPassword });

    await wrapper.find('input[type="password"]').setValue('pass');
    await wrapper.find('.sd-password-prompt__btn--submit').trigger('click');
    await nextTick();

    // Input should be disabled during busy state
    expect(wrapper.find('input[type="password"]').attributes('disabled')).toBeDefined();
    // Submit button shows busy text
    expect(wrapper.find('.sd-password-prompt__btn--submit').text()).toContain('Decrypting');

    // Resolve the attempt
    resolveAttempt({ success: true });
    await nextTick();
  });

  it('calls resolve() on successful password attempt', async () => {
    const resolve = vi.fn();
    const attemptPassword = vi.fn(async () => ({ success: true }));
    const wrapper = mountPrompt({ resolve, attemptPassword });

    await wrapper.find('input[type="password"]').setValue('correct');
    await wrapper.find('.sd-password-prompt__btn--submit').trigger('click');
    // Wait for the async attemptPassword to complete
    await nextTick();
    await nextTick();

    expect(resolve).toHaveBeenCalledWith({ password: 'correct' });
  });

  it('shows error message on failed attempt and re-enables input', async () => {
    const attemptPassword = vi.fn(async () => ({
      success: false,
      errorCode: 'DOCX_PASSWORD_INVALID',
    }));
    const wrapper = mountPrompt({ attemptPassword });

    await wrapper.find('input[type="password"]').setValue('wrong');
    await wrapper.find('.sd-password-prompt__btn--submit').trigger('click');
    await nextTick();
    await nextTick();

    expect(wrapper.find('.sd-password-prompt__error').exists()).toBe(true);
    expect(wrapper.find('.sd-password-prompt__error').text()).toContain('Incorrect password');
    // Input should be re-enabled
    expect(wrapper.find('input[type="password"]').attributes('disabled')).toBeUndefined();
  });

  it('calls close() on cancel', async () => {
    const close = vi.fn();
    const wrapper = mountPrompt({ close });

    await wrapper.find('.sd-password-prompt__btn--cancel').trigger('click');

    expect(close).toHaveBeenCalledWith('user-cancelled');
  });

  it('shows error immediately when initial errorCode is DOCX_PASSWORD_INVALID', () => {
    const wrapper = mountPrompt({ errorCode: 'DOCX_PASSWORD_INVALID' });

    expect(wrapper.find('.sd-password-prompt__error').exists()).toBe(true);
    expect(wrapper.find('.sd-password-prompt__error').text()).toContain('Incorrect password');
  });

  it('does not show error initially for DOCX_PASSWORD_REQUIRED', () => {
    const wrapper = mountPrompt({ errorCode: 'DOCX_PASSWORD_REQUIRED' });

    expect(wrapper.find('.sd-password-prompt__error').exists()).toBe(false);
  });

  it('uses custom button labels from props', () => {
    const wrapper = mountPrompt({
      submitLabel: 'Unlock',
      cancelLabel: 'Nah',
    });

    expect(wrapper.find('.sd-password-prompt__btn--submit').text()).toBe('Unlock');
    expect(wrapper.find('.sd-password-prompt__btn--cancel').text()).toBe('Nah');
  });

  it('shows default title heading for PASSWORD_REQUIRED', () => {
    const wrapper = mountPrompt({ errorCode: 'DOCX_PASSWORD_REQUIRED' });
    expect(wrapper.find('.sd-password-prompt__heading').text()).toBe('Password Required');
  });

  it('shows invalidTitle heading for PASSWORD_INVALID', () => {
    const wrapper = mountPrompt({
      errorCode: 'DOCX_PASSWORD_INVALID',
      invalidTitle: 'Wrong!',
    });
    expect(wrapper.find('.sd-password-prompt__heading').text()).toBe('Wrong!');
  });

  it('updates heading to invalidTitle after failed retry', async () => {
    const attemptPassword = vi.fn(async () => ({
      success: false,
      errorCode: 'DOCX_PASSWORD_INVALID',
    }));
    const wrapper = mountPrompt({
      attemptPassword,
      title: 'Enter password',
      invalidTitle: 'Try again',
    });

    // Initially shows the base title
    expect(wrapper.find('.sd-password-prompt__heading').text()).toBe('Enter password');

    await wrapper.find('input[type="password"]').setValue('wrong');
    await wrapper.find('.sd-password-prompt__btn--submit').trigger('click');
    await nextTick();
    await nextTick();

    // After failed attempt, heading switches to invalidTitle
    expect(wrapper.find('.sd-password-prompt__heading').text()).toBe('Try again');
  });

  it('submits on Enter without using a native form', async () => {
    const attemptPassword = vi.fn(async () => ({ success: true }));
    const wrapper = mountPrompt({ attemptPassword });

    await wrapper.find('input[type="password"]').setValue('secret');
    await wrapper.find('.sd-password-prompt').trigger('keydown.enter');

    expect(attemptPassword).toHaveBeenCalledWith('secret');
  });
});
