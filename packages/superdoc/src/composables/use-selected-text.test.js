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

  const makeRuntime = (text, { canReadSelectedText = true } = {}) => ({
    getCapabilities: () => ({ selection: { canReadSelectedText } }),
    getSelectedText: () => text,
  });

  it('routes the read through the active runtime when it can read selected text', () => {
    const editorFallback = (from, to, sep) => `fallback[${from}..${to}|${sep}]`;
    const runtime = makeRuntime('runtime-selection');
    const { selectedText } = useSelectedText(ref(makeEditor(editorFallback)), {
      getActiveRuntime: () => runtime,
    });
    expect(selectedText.value).toBe('runtime-selection');
  });

  it('falls back to the editor read when no runtime is active', () => {
    const { selectedText } = useSelectedText(ref(makeEditor(() => 'editor-read')), {
      getActiveRuntime: () => null,
    });
    expect(selectedText.value).toBe('editor-read');
  });

  it('falls back to the editor read when the runtime cannot read selected text', () => {
    const runtime = makeRuntime('unused', { canReadSelectedText: false });
    const { selectedText } = useSelectedText(ref(makeEditor(() => 'editor-read')), {
      getActiveRuntime: () => runtime,
    });
    expect(selectedText.value).toBe('editor-read');
  });

  it('routes the read through the active runtime even when the editor ref is null', () => {
    const runtime = makeRuntime('runtime-selection');
    const { selectedText } = useSelectedText(ref(null), { getActiveRuntime: () => runtime });
    expect(selectedText.value).toBe('runtime-selection');
  });
});
