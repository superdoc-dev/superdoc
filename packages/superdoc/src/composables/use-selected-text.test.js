import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useSelectedText } from './use-selected-text.js';

const makeEditor = (textBetween) => ({
  state: {
    doc: { textBetween: (from, to, sep) => textBetween(from, to, sep) },
    selection: { from: 3, to: 7 },
  },
});

describe('useSelectedText', () => {
  it('returns empty string when ref is null', () => {
    const { selectedText } = useSelectedText(ref(null));
    expect(selectedText.value).toBe('');
  });

  it('returns empty string when editor has no state', () => {
    const { selectedText } = useSelectedText(ref({}));
    expect(selectedText.value).toBe('');
  });

  it('returns textBetween over the current selection range, space-joined', () => {
    const fn = (from, to, sep) => `text[${from}..${to}|${sep}]`;
    const { selectedText } = useSelectedText(ref(makeEditor(fn)));
    expect(selectedText.value).toBe('text[3..7| ]');
  });

  it('recomputes when the editor ref changes', () => {
    const r = ref(makeEditor(() => 'first'));
    const { selectedText } = useSelectedText(r);
    expect(selectedText.value).toBe('first');
    r.value = makeEditor(() => 'second');
    expect(selectedText.value).toBe('second');
  });
});
