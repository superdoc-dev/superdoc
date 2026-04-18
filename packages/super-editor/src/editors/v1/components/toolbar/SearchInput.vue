<script setup>
import { ref } from 'vue';

const props = defineProps({
  searchRef: {
    type: Object,
  },
});

const searchValue = ref('');
const emit = defineEmits(['submit']);

const handleSubmit = () => {
  emit('submit', { value: searchValue.value });
};
</script>

<template>
  <div class="search-input-ctn">
    <div class="row">
      <input
        :ref="searchRef"
        v-model="searchValue"
        class="search-input"
        type="text"
        name="search"
        placeholder="Type search string"
        @keydown.enter.stop.prevent="handleSubmit"
      />
    </div>
    <div class="row submit">
      <button class="submit-btn" @click="handleSubmit">Apply</button>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.search-input-ctn {
  padding: 10px;
  border-radius: var(--sd-ui-radius, 6px);

  .search-input {
    min-width: 200px;
    font-size: var(--sd-ui-font-size-300, 13px);
    flex-grow: 1;
    padding: 10px;
    border-radius: var(--sd-ui-radius, 6px);
    color: var(--sd-ui-text-muted, #666666);
    border: 1px solid var(--sd-ui-border, #dbdbdb);
    box-sizing: border-box;
    box-shadow: var(--sd-ui-shadow, 0 4px 12px rgba(0, 0, 0, 0.12));

    &:active,
    &:focus {
      outline: none;
      border: 1px solid var(--sd-ui-action, #1355ff);
    }
  }

  .row {
    display: flex;
    &.submit {
      margin-top: 10px;
      flex-direction: row-reverse;
    }
  }

  .submit-btn {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 10px 16px;
    border-radius: var(--sd-ui-radius, 6px);
    outline: none;
    border: none;
    background-color: var(--sd-ui-action, #1355ff);
    color: white;
    font-weight: 400;
    font-size: var(--sd-ui-font-size-300, 13px);
    cursor: pointer;
    transition: all 0.2s ease;
    box-sizing: border-box;
  }
}
</style>
