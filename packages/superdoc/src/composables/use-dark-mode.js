import { ref } from 'vue';

const isDarkMode = ref(false);

if (typeof document !== 'undefined') {
  document.body?.classList.toggle('dark-mode', isDarkMode.value);
}

export function useDarkMode() {
  const setDarkMode = (value) => {
    isDarkMode.value = value;
    if (typeof document !== 'undefined') {
      document.body?.classList.toggle('dark-mode', value);
    }
  };

  return {
    isDarkMode,
    setDarkMode,
  };
}
