<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps({
  // Reserved surface props (injected by SurfaceFloating)
  surfaceId: { type: String, default: '' },
  mode: { type: String, default: 'floating' },
  request: { type: Object, default: () => ({}) },
  resolve: { type: Function, default: () => {} },
  close: { type: Function, default: () => {} },
  // Feature-specific: the find/replace handle
  findReplace: { type: Object, required: true },
});

const findInputRef = ref(null);

function handleFindKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    props.findReplace.goNext();
  } else if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    props.findReplace.goPrev();
  }
}

function handleClose() {
  props.findReplace.close('user-closed');
}

function focusFindInput() {
  findInputRef.value?.focus();
  findInputRef.value?.select();
}

onMounted(() => {
  findInputRef.value?.focus();
  props.findReplace.registerFocusFn(focusFindInput);
});
</script>

<template>
  <div class="sd-find-replace" @keydown.esc.stop="handleClose">
    <!-- Find row -->
    <div class="sd-find-replace__row">
      <div class="sd-find-replace__input-wrap">
        <input
          ref="findInputRef"
          :value="findReplace.findQuery.value"
          @input="findReplace.findQuery.value = $event.target.value"
          type="text"
          class="sd-find-replace__input"
          :placeholder="findReplace.texts.findPlaceholder"
          :aria-label="findReplace.texts.findAriaLabel"
          @keydown="handleFindKeydown"
        />
        <span v-if="findReplace.findQuery.value" class="sd-find-replace__count">{{
          findReplace.matchLabel.value
        }}</span>
      </div>

      <div class="sd-find-replace__nav">
        <button
          type="button"
          class="sd-find-replace__btn sd-find-replace__btn--icon"
          :disabled="!findReplace.hasMatches.value"
          :title="findReplace.texts.previousMatchLabel"
          :aria-label="findReplace.texts.previousMatchAriaLabel"
          @click="findReplace.goPrev()"
        >
          &#x25B2;
        </button>
        <button
          type="button"
          class="sd-find-replace__btn sd-find-replace__btn--icon"
          :disabled="!findReplace.hasMatches.value"
          :title="findReplace.texts.nextMatchLabel"
          :aria-label="findReplace.texts.nextMatchAriaLabel"
          @click="findReplace.goNext()"
        >
          &#x25BC;
        </button>
        <button
          type="button"
          class="sd-find-replace__btn sd-find-replace__btn--icon"
          :title="findReplace.texts.closeLabel"
          :aria-label="findReplace.texts.closeAriaLabel"
          @click="handleClose"
        >
          &#x2715;
        </button>
      </div>
    </div>

    <!-- Replace row -->
    <div v-if="findReplace.showReplace.value && findReplace.replaceEnabled" class="sd-find-replace__row">
      <div class="sd-find-replace__input-wrap">
        <input
          :value="findReplace.replaceText.value"
          @input="findReplace.replaceText.value = $event.target.value"
          type="text"
          class="sd-find-replace__input"
          :placeholder="findReplace.texts.replacePlaceholder"
          :aria-label="findReplace.texts.replaceAriaLabel"
          @keydown.enter.prevent="findReplace.replaceCurrent()"
        />
      </div>

      <div class="sd-find-replace__nav">
        <button
          type="button"
          class="sd-find-replace__btn sd-find-replace__btn--action"
          :disabled="!findReplace.hasMatches.value"
          :title="findReplace.texts.replaceLabel"
          @click="findReplace.replaceCurrent()"
        >
          {{ findReplace.texts.replaceLabel }}
        </button>
        <button
          type="button"
          class="sd-find-replace__btn sd-find-replace__btn--action"
          :disabled="!findReplace.hasMatches.value"
          :title="findReplace.texts.replaceAllLabel"
          @click="findReplace.replaceAll()"
        >
          {{ findReplace.texts.replaceAllLabel }}
        </button>
      </div>
    </div>

    <!-- Options row -->
    <div class="sd-find-replace__options">
      <button
        v-if="findReplace.replaceEnabled"
        type="button"
        class="sd-find-replace__btn sd-find-replace__btn--toggle"
        :class="{ 'sd-find-replace__btn--active': findReplace.showReplace.value }"
        :title="findReplace.texts.toggleReplaceLabel"
        :aria-label="findReplace.texts.toggleReplaceAriaLabel"
        @click="findReplace.showReplace.value = !findReplace.showReplace.value"
      >
        &#x21C5;
      </button>
      <button
        type="button"
        class="sd-find-replace__btn sd-find-replace__btn--toggle"
        :class="{ 'sd-find-replace__btn--active': findReplace.caseSensitive.value }"
        :title="findReplace.texts.matchCaseLabel"
        :aria-label="findReplace.texts.matchCaseAriaLabel"
        @click="findReplace.caseSensitive.value = !findReplace.caseSensitive.value"
      >
        {{ findReplace.texts.matchCaseLabel }}
      </button>
      <button
        type="button"
        class="sd-find-replace__btn sd-find-replace__btn--toggle"
        :class="{ 'sd-find-replace__btn--active': findReplace.ignoreDiacritics.value }"
        :title="findReplace.texts.ignoreDiacriticsLabel"
        :aria-label="findReplace.texts.ignoreDiacriticsAriaLabel"
        @click="findReplace.ignoreDiacritics.value = !findReplace.ignoreDiacritics.value"
      >
        {{ findReplace.texts.ignoreDiacriticsLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sd-find-replace {
  display: flex;
  flex-direction: column;
  gap: var(--sd-ui-find-replace-gap, 8px);
}

.sd-find-replace__row {
  display: flex;
  align-items: center;
  gap: var(--sd-ui-find-replace-gap, 8px);
}

.sd-find-replace__input-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.sd-find-replace__input {
  width: 100%;
  height: var(--sd-ui-find-replace-input-height, 30px);
  padding: var(--sd-ui-find-replace-input-padding, 4px 8px);
  font-size: var(--sd-ui-find-replace-input-font-size, 14px);
  font-family: inherit;
  color: var(--sd-ui-text);
  background: var(--sd-ui-find-replace-input-bg, #fff);
  border: 1px solid var(--sd-ui-find-replace-input-border, var(--sd-ui-border));
  border-radius: var(--sd-ui-find-replace-input-radius, 4px);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.sd-find-replace__input:focus {
  border-color: var(--sd-ui-find-replace-input-focus-border, var(--sd-ui-action));
}

.sd-find-replace__count {
  position: absolute;
  right: var(--sd-ui-find-replace-count-inset, 8px);
  font-size: var(--sd-ui-find-replace-count-font-size, 13px);
  color: var(--sd-ui-find-replace-count-color, #6b7280);
  pointer-events: none;
  white-space: nowrap;
}

.sd-find-replace__nav {
  display: flex;
  gap: var(--sd-ui-find-replace-nav-gap, 2px);
  flex-shrink: 0;
}

.sd-find-replace__options {
  display: flex;
  gap: var(--sd-ui-find-replace-options-gap, 4px);
}

.sd-find-replace__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--sd-ui-find-replace-btn-color, var(--sd-ui-text));
  transition: background-color 0.15s;
}

.sd-find-replace__btn:disabled {
  opacity: var(--sd-ui-find-replace-btn-disabled-opacity, 0.4);
  cursor: not-allowed;
}

.sd-find-replace__btn--icon {
  width: var(--sd-ui-find-replace-btn-size, 28px);
  height: var(--sd-ui-find-replace-btn-size, 28px);
  border-radius: var(--sd-ui-find-replace-btn-radius, 4px);
  font-size: var(--sd-ui-find-replace-btn-icon-font-size, 12px);
  line-height: 1;
}

.sd-find-replace__btn--icon:hover:not(:disabled) {
  background: var(--sd-ui-find-replace-btn-hover-bg, rgba(0, 0, 0, 0.06));
}

.sd-find-replace__btn--action {
  padding: var(--sd-ui-find-replace-action-btn-padding, 4px 10px);
  font-size: var(--sd-ui-find-replace-count-font-size, 13px);
  border-radius: var(--sd-ui-find-replace-btn-radius, 4px);
  background: var(--sd-ui-find-replace-action-btn-bg, var(--sd-ui-action));
  color: var(--sd-ui-find-replace-action-btn-color, #fff);
  border: none;
}

.sd-find-replace__btn--action:hover:not(:disabled) {
  background: var(--sd-ui-find-replace-action-btn-hover-bg, var(--sd-ui-action));
}

.sd-find-replace__btn--toggle {
  padding: var(--sd-ui-find-replace-btn-toggle-padding, 4px 8px);
  font-size: var(--sd-ui-find-replace-btn-toggle-font-size, 12px);
  border-radius: var(--sd-ui-find-replace-btn-radius, 4px);
  border: 1px solid transparent;
}

.sd-find-replace__btn--toggle:hover:not(:disabled) {
  background: var(--sd-ui-find-replace-btn-hover-bg, rgba(0, 0, 0, 0.06));
}

.sd-find-replace__btn--active {
  background: var(--sd-ui-find-replace-toggle-active-bg, #dbeafe);
  color: var(--sd-ui-find-replace-toggle-active-color, #1d4ed8);
  border-color: var(--sd-ui-find-replace-toggle-active-color, #1d4ed8);
}

.sd-find-replace__btn--active:hover:not(:disabled) {
  background: var(--sd-ui-find-replace-toggle-active-bg, #dbeafe);
}
</style>
