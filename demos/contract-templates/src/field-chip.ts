/**
 * Contextual smart-field chip — SD-3157 / SD-3232 demo.
 *
 * Shows a small chip anchored above the active smart-field content
 * control with the field's label and current value. Plain TypeScript
 * (no framework), wired against two public SuperDoc APIs:
 *
 *   - `superdoc.on('content-control:active-change', ...)` to know *which*
 *     control is active (SD-3232 events). The payload's `SdtRef` carries
 *     the tag/alias/scope directly, so no extra lookup is needed.
 *   - `ui.contentControls.getRect({ id })` to know *where* to draw the chip.
 *
 * That pairing is the intended model: events tell you what is active;
 * `getRect()` tells you where to place your own UI.
 *
 * Narrow on purpose: only renders for `kind: 'smartField'` controls so
 * the chip doesn't collide with the block-clause review UI in the Clauses
 * tab. Linked-occurrence highlights, field-details popovers, and clause
 * badges are deliberate follow-ups (SD-3155 umbrella).
 *
 * The demo runs with SuperDoc's built-in SDT chrome turned off
 * (`modules.contentControls.chrome: 'none'`, SD-3159), so the chip is the
 * smart field's active-state UI rather than an addition on top of the
 * built-in blue label/border. The wrappers and data-sdt-* datasets are
 * still emitted, which is what `getRect` relies on.
 */
import type { SuperDoc, ContentControlActiveChangePayload } from 'superdoc';
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
 * Wire the chip. `superdoc` supplies the active-change events; `ui`
 * supplies `getRect` for positioning. Returns a teardown function that
 * detaches listeners and removes the chip element. Safe to call after
 * `initialize()` has populated the field-value cache.
 */
export function attachFieldChip(superdoc: SuperDoc, ui: SuperDocUI, lookup: SmartFieldLookup): () => void {
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
   * Clear the active control entirely. Use ONLY when active-change tells
   * us "no active smart field" (active is null, or not a smart field). Do
   * NOT call this from the positioning loop on a transient rect miss (a
   * reflow can drop the rect for one tick; clearing here would leave the
   * chip hidden until the user clicks away and back).
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
      // Transient miss — keep the active state so the next scroll / resize
      // tick can re-anchor without requiring the user to click away.
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

  // Re-anchor whenever the viewport geometry changes. ui.viewport.observe is
  // the single signal for this - it fires on scroll, resize, zoom, and
  // layout/pagination reflow, so we catch the zoom / reflow cases that
  // hand-wired window scroll + resize listeners miss (SD-3311).
  const onViewportChange = () => positionChip();

  // SD-3232: the active control comes from the public SuperDoc event. The
  // payload includes the SdtRef (id + tag), so we can narrow to smart
  // fields and anchor by id without a separate lookup.
  const onActiveChange = ({ active }: ContentControlActiveChangePayload) => {
    if (!active) {
      clearActive();
      return;
    }
    // Narrow to smart-field SDTs only. Block-level reusable clauses have
    // their own review surface in the Clauses tab; a chip on them would
    // compete with that flow.
    const tagStr = active.tag;
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
    currentId = active.id;
    currentKey = parsed.key;
    update();
  };

  superdoc.on('content-control:active-change', onActiveChange);
  const unobserveViewport = ui.viewport.observe(onViewportChange);

  return () => {
    superdoc.off('content-control:active-change', onActiveChange);
    unobserveViewport();
    chipEl.remove();
  };
}
