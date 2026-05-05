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
 * Modifier names accepted in a shortcut string. Anything else in a
 * non-key position rejects the registration — silently dropping
 * unknown tokens would cause `'Cmd-K'` (Cmd is not a recognized
 * alias here) to bind to bare `K`, which would fire on every K
 * keypress during normal typing.
 */
const MOD_ALIASES = new Set(['Mod', 'Meta', 'Cmd', 'Command']);
const ALT_ALIASES = new Set(['Alt', 'Option']);
const CTRL_ALIASES = new Set(['Control', 'Ctrl']);
const SHIFT_ALIASES = new Set(['Shift']);

/**
 * Normalize a shortcut string to canonical form. Returns `null` for
 * malformed inputs (empty, missing key, only modifiers, unknown
 * modifier names).
 */
export function normalizeShortcut(input: string): string | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  const parts = input.split('-').filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1]!;
  const modParts = parts.slice(0, -1);
  // Reject if the "key" is itself a modifier (e.g. someone wrote
  // "Mod-Shift" — there's no actual key to match).
  const allMods = new Set([...MOD_ALIASES, ...ALT_ALIASES, ...CTRL_ALIASES, ...SHIFT_ALIASES]);
  if (allMods.has(key)) return null;

  let hasMod = false;
  let hasAlt = false;
  let hasShift = false;
  for (const part of modParts) {
    if (MOD_ALIASES.has(part) || CTRL_ALIASES.has(part)) hasMod = true;
    else if (ALT_ALIASES.has(part)) hasAlt = true;
    else if (SHIFT_ALIASES.has(part)) hasShift = true;
    // Unknown token (typo like 'Cmdd' or lowercase 'mod') — refuse
    // rather than silently drop it. Returning the bare key would
    // bind the command to plain typing.
    else return null;
  }

  const out: string[] = [];
  if (hasMod) out.push('Mod');
  if (hasAlt) out.push('Alt');
  if (hasShift) out.push('Shift');
  out.push(canonicalKey(key));
  return out.join('-');
}

/**
 * Derive the unshifted base of a printable key from `event.code`.
 * Browsers report the *shifted* character in `event.key` for
 * printable keys (`Shift-1` on US layouts produces `!`, `Shift-/`
 * produces `?`), but consumers register `'Mod-Shift-1'` not
 * `'Mod-Shift-!'`. `event.code` carries the layout-stable digit /
 * letter id (`Digit1`, `KeyA`), so we use it when shift is held to
 * keep registrations and runtime lookups aligned. Letters are the
 * easy case — `event.key` already returns the base letter regardless
 * of shift.
 */
function unshiftedPrintableFromCode(code: string | undefined): string | null {
  if (!code) return null;
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  return null;
}

/**
 * Build the canonical shortcut string for a `KeyboardEvent`. Treats
 * Cmd (macOS) and Ctrl (other platforms) as the same `Mod` so
 * consumers can register one string per shortcut and have it match
 * either platform's combo. Returns `null` for events whose `key` is
 * itself a modifier (the user is still composing the chord).
 */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const rawKey = event.key;
  if (!rawKey || rawKey === 'Control' || rawKey === 'Meta' || rawKey === 'Alt' || rawKey === 'Shift') {
    return null;
  }
  // Shifted digits — fall back to the layout-stable code so
  // 'Mod-Shift-1' matches the actual keypress that produces '!' on
  // US keyboards (and the equivalent shifted glyph on other layouts).
  let key = rawKey;
  if (event.shiftKey && rawKey.length === 1) {
    const unshifted = unshiftedPrintableFromCode(event.code);
    if (unshifted) key = unshifted;
  }

  const out: string[] = [];
  if (event.metaKey || event.ctrlKey) out.push('Mod');
  if (event.altKey) out.push('Alt');
  if (event.shiftKey) out.push('Shift');
  out.push(canonicalKey(key));
  return out.join('-');
}
