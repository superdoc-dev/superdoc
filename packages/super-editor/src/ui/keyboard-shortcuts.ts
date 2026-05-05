/**
 * Keyboard-shortcut parsing and matching for `ui.commands.register({
 * shortcut })`. Shortcut strings follow the ProseMirror / Tiptap
 * convention so consumers don't have to relearn:
 *
 *   `Mod-K`           Cmd+K on macOS, Ctrl+K elsewhere
 *   `Mod-Shift-C`     Cmd+Shift+C / Ctrl+Shift+C
 *   `Alt-Enter`       Alt+Enter
 *   `Mod-Alt-1`       Cmd+Option+1 / Ctrl+Alt+1
 *
 * Modifier order in the input string doesn't matter; everything is
 * normalized to canonical `Mod, Alt, Shift, KEY` order so registry
 * lookups by event key and by registered string land in the same
 * bucket.
 */

/** Single-character keys are upper-cased so 'Mod-k' === 'Mod-K'. */
function canonicalKey(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * Normalize a shortcut string to canonical form. Returns `null` for
 * malformed inputs (empty, missing key, only modifiers).
 */
export function normalizeShortcut(input: string): string | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  const parts = input.split('-').filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1]!;
  const mods = new Set(parts.slice(0, -1));
  // Reject if the "key" is itself a modifier (e.g. someone wrote
  // "Mod-Shift" — there's no actual key to match).
  if (mods.has(key) || key === 'Mod' || key === 'Alt' || key === 'Shift' || key === 'Control' || key === 'Meta') {
    return null;
  }
  const out: string[] = [];
  if (mods.has('Mod') || mods.has('Meta') || mods.has('Control') || mods.has('Ctrl')) out.push('Mod');
  if (mods.has('Alt') || mods.has('Option')) out.push('Alt');
  if (mods.has('Shift')) out.push('Shift');
  out.push(canonicalKey(key));
  return out.join('-');
}

/**
 * Build the canonical shortcut string for a `KeyboardEvent`. Treats
 * Cmd (macOS) and Ctrl (other platforms) as the same `Mod` so
 * consumers can register one string per shortcut and have it match
 * either platform's combo. Returns `null` for events whose `key` is
 * itself a modifier (the user is still composing the chord).
 */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const key = event.key;
  if (!key || key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift') return null;
  const out: string[] = [];
  if (event.metaKey || event.ctrlKey) out.push('Mod');
  if (event.altKey) out.push('Alt');
  if (event.shiftKey) out.push('Shift');
  out.push(canonicalKey(key));
  return out.join('-');
}
