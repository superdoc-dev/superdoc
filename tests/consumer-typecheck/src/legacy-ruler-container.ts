/**
 * Consumer typecheck: the legacy `rulerContainer` alias stays accepted.
 *
 * The runtime has always honored this field — `normalizeUiConfig` folds it in
 * under `ui.ruler.container` — but it was missing from `Config`, so a strict
 * TypeScript consumer got `TS2353` for a value SuperDoc acts on. That is the
 * inverse of the usual compatibility hazard: not a type promising more than
 * the runtime does, but a runtime honoring more than the type admits.
 *
 * These assertions fail if the alias is dropped from the type again before the
 * 3.0 removal it is scheduled for.
 */
import type { Config } from 'superdoc';

// Selector form, which is what the guides and examples use.
const _selectorForm: Config = {
  selector: '#editor',
  rulers: true,
  rulerContainer: '#ruler',
};

// Element form. `normalizeUiConfig` passes the value through untouched, so an
// already-resolved node has to be assignable too.
declare const rulerHost: HTMLElement;
const _elementForm: Config = {
  selector: '#editor',
  rulerContainer: rulerHost,
};

// Both spellings together: legal, and the canonical one wins at runtime. A
// config mid-migration carries this shape, so it must not be a type error.
const _mixedForm: Config = {
  selector: '#editor',
  rulerContainer: '#legacy-ruler',
  ui: { ruler: { container: '#canonical-ruler' } },
};

void [_selectorForm, _elementForm, _mixedForm];
