<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  // Reserved surface props (injected by SurfaceDialog)
  surfaceId: { type: String, default: '' },
  mode: { type: String, default: 'dialog' },
  request: { type: Object, default: () => ({}) },
  resolve: { type: Function, default: () => {} },
  close: { type: Function, default: () => {} },
  // Feature-specific props
  attemptPassword: { type: Function, required: true },
  errorCode: { type: String, default: 'DOCX_PASSWORD_REQUIRED' },
  title: { type: String, default: 'Password Required' },
  invalidTitle: { type: String, default: 'Incorrect Password' },
  submitLabel: { type: String, default: 'Open' },
  cancelLabel: { type: String, default: 'Cancel' },
});

const password = ref('');
const isBusy = ref(false);
const isInvalid = ref(props.errorCode === 'DOCX_PASSWORD_INVALID');
const errorMessage = ref(isInvalid.value ? 'Incorrect password. Please try again.' : '');

const heading = computed(() => (isInvalid.value ? props.invalidTitle : props.title));

const canSubmit = computed(() => password.value.length > 0 && !isBusy.value);

async function handleSubmit() {
  if (!canSubmit.value) return;

  isBusy.value = true;
  errorMessage.value = '';

  const result = await props.attemptPassword(password.value);

  if (result.success) {
    props.resolve({ password: password.value });
    return;
  }

  // Stay open — show error, let user retry
  isBusy.value = false;
  password.value = '';

  if (result.errorCode === 'DOCX_PASSWORD_INVALID') {
    isInvalid.value = true;
    errorMessage.value = 'Incorrect password. Please try again.';
  } else if (result.errorCode === 'timeout') {
    errorMessage.value = 'Timed out while decrypting. Please try again.';
  } else {
    errorMessage.value = 'Unable to decrypt this document.';
  }
}

function handleCancel() {
  props.close('user-cancelled');
}
</script>

<template>
  <div class="sd-password-prompt" @keydown.enter.prevent="handleSubmit">
    <h3 class="sd-password-prompt__heading">{{ heading }}</h3>
    <p class="sd-password-prompt__description">This document is password protected. Enter the password to open it.</p>

    <div class="sd-password-prompt__field">
      <input
        v-model="password"
        type="password"
        class="sd-password-prompt__input"
        placeholder="Enter password"
        :disabled="isBusy"
        autocomplete="current-password"
        aria-label="Document password"
      />
    </div>

    <p v-if="errorMessage" class="sd-password-prompt__error" role="alert">
      {{ errorMessage }}
    </p>

    <div class="sd-password-prompt__actions">
      <button
        type="button"
        class="sd-password-prompt__btn sd-password-prompt__btn--cancel"
        :disabled="isBusy"
        @click="handleCancel"
      >
        {{ cancelLabel }}
      </button>
      <button
        type="button"
        class="sd-password-prompt__btn sd-password-prompt__btn--submit"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        {{ isBusy ? 'Decrypting\u2026' : submitLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sd-password-prompt {
  display: flex;
  flex-direction: column;
  gap: var(--sd-ui-password-prompt-gap, 12px);
}

.sd-password-prompt__heading {
  margin: 0;
  font-size: var(--sd-ui-password-prompt-heading-size, 15px);
  font-weight: var(--sd-ui-password-prompt-heading-weight, 600);
  line-height: 1.4;
  color: var(--sd-ui-password-prompt-heading-color, var(--sd-ui-text));
}

.sd-password-prompt__description {
  margin: 0;
  font-size: var(--sd-ui-password-prompt-description-size, 14px);
  line-height: 1.5;
  color: var(--sd-ui-password-prompt-description-color, var(--sd-ui-text));
}

.sd-password-prompt__field {
  display: flex;
}

.sd-password-prompt__input {
  width: 100%;
  padding: var(--sd-ui-password-prompt-input-padding, 8px 10px);
  font-size: var(--sd-ui-password-prompt-input-size, 14px);
  font-family: inherit;
  color: var(--sd-ui-password-prompt-input-color, var(--sd-ui-text));
  background: var(--sd-ui-password-prompt-input-bg, #fff);
  border: 1px solid var(--sd-ui-password-prompt-input-border, var(--sd-ui-border));
  border-radius: var(--sd-ui-password-prompt-input-radius, 4px);
  outline: none;
  transition: border-color 0.15s;
}

.sd-password-prompt__input:focus {
  border-color: var(--sd-ui-password-prompt-input-focus-border, var(--sd-ui-action));
}

.sd-password-prompt__input:disabled {
  opacity: var(--sd-ui-password-prompt-input-disabled-opacity, 0.6);
  cursor: not-allowed;
}

.sd-password-prompt__error {
  margin: 0;
  font-size: var(--sd-ui-password-prompt-error-size, 13px);
  color: var(--sd-ui-password-prompt-error-color, var(--sd-color-red-500, #ed4337));
}

.sd-password-prompt__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sd-ui-password-prompt-actions-gap, 8px);
  margin-top: 4px;
}

.sd-password-prompt__btn {
  padding: var(--sd-ui-password-prompt-btn-padding, 6px 16px);
  font-size: var(--sd-ui-password-prompt-btn-size, 14px);
  font-family: inherit;
  border-radius: var(--sd-ui-password-prompt-btn-radius, 4px);
  cursor: pointer;
  transition:
    background-color 0.15s,
    opacity 0.15s;
}

.sd-password-prompt__btn:disabled {
  opacity: var(--sd-ui-password-prompt-btn-disabled-opacity, 0.5);
  cursor: not-allowed;
}

.sd-password-prompt__btn--cancel {
  background: var(--sd-ui-password-prompt-cancel-bg, transparent);
  border: 1px solid var(--sd-ui-password-prompt-cancel-border, var(--sd-ui-border));
  color: var(--sd-ui-password-prompt-cancel-color, var(--sd-ui-text));
}

.sd-password-prompt__btn--cancel:hover:not(:disabled) {
  background: var(--sd-ui-password-prompt-cancel-hover-bg, var(--sd-color-gray-100, #f5f5f5));
}

.sd-password-prompt__btn--submit {
  background: var(--sd-ui-password-prompt-submit-bg, var(--sd-ui-action));
  border: 1px solid var(--sd-ui-password-prompt-submit-border, var(--sd-ui-action));
  color: var(--sd-ui-password-prompt-submit-color, var(--sd-ui-action-text, #fff));
}

.sd-password-prompt__btn--submit:hover:not(:disabled) {
  background: var(--sd-ui-password-prompt-submit-hover-bg, var(--sd-ui-action-hover));
}
</style>
