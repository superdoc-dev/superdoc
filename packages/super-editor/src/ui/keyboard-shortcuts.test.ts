import { describe, expect, it } from 'vitest';

import { normalizeShortcut, shortcutFromEvent } from './keyboard-shortcuts.js';

describe('normalizeShortcut', () => {
  it('canonicalizes modifier order to Mod, Alt, Shift, KEY', () => {
    expect(normalizeShortcut('Shift-Mod-K')).toBe('Mod-Shift-K');
    expect(normalizeShortcut('Alt-Mod-Enter')).toBe('Mod-Alt-Enter');
    expect(normalizeShortcut('Shift-Alt-Mod-Period')).toBe('Mod-Alt-Shift-Period');
  });

  it('upper-cases single-character keys (case-insensitive registration)', () => {
    expect(normalizeShortcut('Mod-k')).toBe('Mod-K');
    expect(normalizeShortcut('Mod-K')).toBe('Mod-K');
  });

  it('treats Cmd / Ctrl / Meta / Mod as the same modifier', () => {
    expect(normalizeShortcut('Mod-K')).toBe('Mod-K');
    expect(normalizeShortcut('Ctrl-K')).toBe('Mod-K');
    expect(normalizeShortcut('Meta-K')).toBe('Mod-K');
    expect(normalizeShortcut('Control-K')).toBe('Mod-K');
  });

  it('returns null for malformed inputs', () => {
    expect(normalizeShortcut('')).toBeNull();
    expect(normalizeShortcut('Mod')).toBeNull();
    expect(normalizeShortcut('Mod-Shift')).toBeNull();
    expect(normalizeShortcut('Shift')).toBeNull();
  });
});

describe('shortcutFromEvent', () => {
  function event(init: Partial<KeyboardEventInit> & { key: string }) {
    return new KeyboardEvent('keydown', init);
  }

  it('builds Mod when ctrlKey or metaKey is set', () => {
    expect(shortcutFromEvent(event({ key: 'k', ctrlKey: true }))).toBe('Mod-K');
    expect(shortcutFromEvent(event({ key: 'k', metaKey: true }))).toBe('Mod-K');
  });

  it('combines modifiers in canonical order', () => {
    expect(shortcutFromEvent(event({ key: 'C', ctrlKey: true, shiftKey: true }))).toBe('Mod-Shift-C');
    expect(shortcutFromEvent(event({ key: 'Enter', altKey: true, ctrlKey: true }))).toBe('Mod-Alt-Enter');
  });

  it('returns null while a modifier itself is being pressed', () => {
    expect(shortcutFromEvent(event({ key: 'Control' }))).toBeNull();
    expect(shortcutFromEvent(event({ key: 'Meta' }))).toBeNull();
    expect(shortcutFromEvent(event({ key: 'Shift' }))).toBeNull();
    expect(shortcutFromEvent(event({ key: 'Alt' }))).toBeNull();
  });

  it('round-trips through normalizeShortcut for a canonical event', () => {
    const combo = shortcutFromEvent(event({ key: 'k', ctrlKey: true, shiftKey: true }));
    expect(combo).not.toBeNull();
    expect(normalizeShortcut(combo!)).toBe(combo);
  });
});
