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

  it('rejects unknown modifier tokens rather than silently dropping them', () => {
    // `Cmd` would silently drop and bind to bare `K` if not rejected,
    // firing on every K keypress during normal typing.
    expect(normalizeShortcut('Cmdd-K')).toBeNull();
    // Lowercase modifier names are typos, not aliases — refuse them.
    expect(normalizeShortcut('mod-k')).toBeNull();
    expect(normalizeShortcut('shift-k')).toBeNull();
  });

  it('accepts Cmd / Command as aliases for Mod', () => {
    expect(normalizeShortcut('Cmd-K')).toBe('Mod-K');
    expect(normalizeShortcut('Command-K')).toBe('Mod-K');
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

  it('uses event.code to recover the unshifted base for shifted digits (US: Shift-1 → "!")', () => {
    // The browser fires `key='!'` for Shift-1 on US layouts. Without
    // `event.code` fallback the lookup would build 'Mod-Shift-!' and
    // miss any `'Mod-Shift-1'` registration.
    const combo = shortcutFromEvent(event({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }));
    expect(combo).toBe('Mod-Shift-1');
  });
});
