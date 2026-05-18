/**
 * Contextual smart-field chip — SD-3157 demo.
 *
 * Shows a small chip anchored above the active smart-field content
 * control with the field's label and current value. Wired against the
 * public `superdoc/ui` controller (no framework — this demo is plain
 * TypeScript), using:
 *
 *   - `ui.contentControls.observe(...)` to react to the active control
 *   - `ui.contentControls.getRect({ id })` to anchor the chip
 *
 * Narrow on purpose: only renders for `kind: 'smartField'` controls so
 * the chip doesn't collide with the existing block-clause review UI in
 * the Clauses tab. Linked-occurrence highlights, field-details popovers,
 * and clause badges are deliberate follow-ups (SD-3155 umbrella).
 *
 * The chip renders ALONGSIDE SuperDoc's built-in SDT chrome (blue
 * label, border, hover background) by design: this demo demonstrates
 * the API's ability to add contextual UI on top of the document, not
 * to replace the editor's default visuals. Suppressing the built-in
 * chrome is filed as SD-3159 (`modules.contentControls.chrome: 'default' | 'none'`).
 */
import type { SuperDocUI } from 'superdoc/ui';

export type SmartFieldLookup = {
  /** Human label for a smart-field key (e.g. `disclosingParty` → `Disclosing party`). */
  labelFor(key: string): string;
  /** Current value tracked by the host demo (mirrors live SDT text). */
  valueFor(key: string): string | undefined;
};

const CHIP_CLASS = 'sd-field-chip';
const CHIP_OFFSET_PX = 6;

/**
 * Wire the chip to the controller. Returns a teardown function that
 * detaches listeners and removes the chip element. Safe to call after
 * `initialize()` has populated the field-value cache.
 */
export function attachFieldChip(ui: SuperDocUI, lookup: SmartFieldLookup): () => void {
  const chipEl = document.createElement('div');
  chipEl.className = CHIP_CLASS;
  chipEl.style.position = 'fixed';
  chipEl.style.visibility = 'hidden';
  chipEl.style.pointerEvents = 'none';
  chipEl.style.zIndex = '20';
  document.body.appendChild(chipEl);

  let currentId: string | null = null;
  let currentKey: string | null = null;

  /**
   * Clear the active control entirely. Use ONLY when the controller
   * tells us "no active SDT" — i.e. the observe callback fires with
   * `activeId: null` or the active control isn't a smart field. Do
   * NOT call this from the positioning loop on a transient rect miss
   * (a reflow can drop the rect for one tick; clearing here would
   * leave the chip hidden until the user clicks away and back).
   */
  const clearActive = () => {
    chipEl.style.visibility = 'hidden';
    currentId = null;
    currentKey = null;
  };

  /** Hide visually but keep the active state, so the next tick can re-anchor. */
  const hideVisually = () => {
    chipEl.style.visibility = 'hidden';
  };

  const positionChip = () => {
    if (!currentId) return;
    const rect = ui.contentControls.getRect({ id: currentId });
    if (!rect.success) {
      // Transient miss — keep the active state so the next scroll /
      // resize / observe tick can re-anchor without requiring the
      // user to click away.
      hideVisually();
      return;
    }
    // Position the chip above the wrapper. Falls below if there's no
    // room — keeps it on-screen during scroll-to-top behavior.
    const { rect: r } = rect;
    chipEl.style.visibility = 'visible';
    chipEl.style.left = `${r.left}px`;
    const wantedTop = r.top - chipEl.offsetHeight - CHIP_OFFSET_PX;
    chipEl.style.top = `${wantedTop >= 0 ? wantedTop : r.top + r.height + CHIP_OFFSET_PX}px`;
  };

  const renderChip = (label: string, value: string) => {
    const valueStr = value.length > 0 ? value : '(empty)';
    chipEl.innerHTML = '';
    const labelSpan = document.createElement('span');
    labelSpan.className = `${CHIP_CLASS}__label`;
    labelSpan.textContent = label;
    const dot = document.createTextNode(' · ');
    const valueSpan = document.createElement('span');
    valueSpan.className = `${CHIP_CLASS}__value`;
    valueSpan.textContent = valueStr;
    chipEl.appendChild(labelSpan);
    chipEl.appendChild(dot);
    chipEl.appendChild(valueSpan);
  };

  const update = () => {
    if (!currentId || !currentKey) {
      clearActive();
      return;
    }
    renderChip(lookup.labelFor(currentKey), lookup.valueFor(currentKey) ?? '');
    positionChip();
  };

  const onScrollOrResize = () => positionChip();

  const unsubscribe = ui.contentControls.observe((snapshot) => {
    // Narrow to smart-field SDTs only. Block-level reusable clauses
    // have their own review surface in the Clauses tab; rendering a
    // chip on them would compete with that flow.
    const activeId = snapshot.activeId;
    if (!activeId) {
      clearActive();
      return;
    }
    const info = ui.contentControls.get({ id: activeId });
    const tagStr = info?.properties?.tag;
    if (!tagStr) {
      clearActive();
      return;
    }
    let parsed: { kind?: unknown; key?: unknown } | null = null;
    try {
      parsed = JSON.parse(tagStr);
    } catch {
      clearActive();
      return;
    }
    if (!parsed || parsed.kind !== 'smartField' || typeof parsed.key !== 'string') {
      clearActive();
      return;
    }
    currentId = activeId;
    currentKey = parsed.key;
    update();
  });

  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  return () => {
    unsubscribe();
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
    chipEl.remove();
  };
}
