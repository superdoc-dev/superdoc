/**
 * Custom toolbar (vanilla TypeScript), single file.
 *
 * Wires SuperDoc's UI controller to a hand-rolled toolbar. Three
 * patterns to notice:
 *
 *   1. createSuperDocUI({ superdoc }) accepts the SuperDoc instance
 *      directly. No cast.
 *   2. ui.createScope() collects every subscription, custom command
 *      registration, and DOM listener. ui.destroy() cascades into
 *      every scope so consumers tear everything down with one call.
 *   3. BUILT_IN_COMMAND_IDS + ui.commands.has(id) validate a
 *      config-driven button list at startup so a typo cannot ship
 *      silently. ui.commands.require(id) throws on unknown ids at
 *      trusted dispatch sites.
 */

import { SuperDoc } from 'superdoc';
import {
  BUILT_IN_COMMAND_IDS,
  createSuperDocUI,
  type PublicToolbarItemId,
} from 'superdoc/ui';
import 'superdoc/style.css';
import './style.css';

// Compile-time-typed config. TypeScript verifies every id is a real
// built-in. The runtime check below catches dynamic / config-driven
// arrays the type system cannot see (feature flags, user settings).
const BUTTONS: readonly PublicToolbarItemId[] = ['bold', 'italic', 'underline', 'undo', 'redo'];

const LABELS: Partial<Record<PublicToolbarItemId, string>> = {
  bold: 'B',
  italic: 'I',
  underline: 'U',
  undo: '↶',
  redo: '↷',
};

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/test_file.docx',
  documentMode: 'editing',
});

const ui = createSuperDocUI({ superdoc });
const scope = ui.createScope();

// Custom command. scope.register(...) is a passthrough to
// ui.commands.register(...) that auto-unregisters when the scope (or
// the controller) is destroyed.
scope.register({
  id: 'company.insertClause',
  getState: ({ state }) => ({ disabled: state.selection.selectionTarget == null }),
  execute: ({ editor }) => {
    const target = ui.selection.getSnapshot().selectionTarget;
    if (!target || !editor?.doc?.insert) return false;
    return editor.doc.insert({ target, value: ' [Standard MSA boilerplate] ', type: 'text' }).success;
  },
});

const toolbarEl = document.querySelector<HTMLElement>('#toolbar')!;

// Built-in buttons. Each button binds to its OWN command's state via
// observe(state => ...), so unrelated state changes never re-render
// the button. Equivalent to React's useSuperDocCommand(id).
for (const id of BUTTONS) {
  if (!ui.commands.has(id)) {
    console.warn(`[toolbar] unknown command id: ${id}`);
    continue;
  }
  const handle = ui.commands.require(id);
  const btn = document.createElement('button');
  btn.className = 'tb-btn';
  btn.textContent = LABELS[id] ?? id;
  btn.addEventListener('click', () => handle.execute());
  scope.add(
    handle.observe((state) => {
      btn.classList.toggle('active', !!state.active);
      btn.disabled = !!state.disabled;
    }),
  );
  toolbarEl.appendChild(btn);
}

// Custom command button. Same observe / execute shape as built-ins;
// `ui.commands.require(id)` returns a typed handle for either.
const customHandle = ui.commands.require('company.insertClause');
const insertBtn = document.createElement('button');
insertBtn.className = 'tb-btn tb-btn-pill';
insertBtn.textContent = 'Insert clause';
insertBtn.addEventListener('click', () => {
  void customHandle.execute();
});
scope.add(
  customHandle.observe((state) => {
    insertBtn.disabled = !!state.disabled;
  }),
);
toolbarEl.appendChild(insertBtn);

// Quick reference for consumers reading this file: BUILT_IN_COMMAND_IDS
// is the readonly list of every valid built-in. Useful for validating
// configs loaded from outside the type system (feature flags, user
// settings, plugin manifests).
void BUILT_IN_COMMAND_IDS;

// One teardown for the whole app. ui.destroy() cascades into every
// scope created from this controller, so consumers do not need a
// separate scope.destroy() call.
const teardown = () => {
  ui.destroy();
  superdoc.destroy();
};
window.addEventListener('beforeunload', teardown);
if (import.meta.hot) import.meta.hot.dispose(teardown);
