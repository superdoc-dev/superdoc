/**
 * The smallest example that proves how to build your own toolbar with
 * `superdoc/ui`. Three built-in commands and one custom command, all
 * on the same surface, no framework.
 *
 * Each button subscribes per-id via `ui.commands.<id>.observe(...)`,
 * which only fires when that command's `active` / `disabled` /
 * `value` flips. Click handlers run `ui.commands.get(id).execute()`.
 *
 * `ui.commands.register({ id, execute, getState })` puts a custom
 * command on the same surface as built-ins. Bind to it the same way.
 *
 * No threading, no resolve / reopen, no comments, no mode toggle.
 * For the full Custom UI surface, see `demos/custom-ui` (React).
 */

import { SuperDoc } from 'superdoc';
import { createSuperDocUI } from 'superdoc/ui';
import 'superdoc/style.css';
import './style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/test_file.docx',
  documentMode: 'editing',
  user: { name: 'Alex', email: 'alex@example.com' },
  // No `modules.toolbar` — the built-in toolbar only mounts when its
  // selector is set, so we get a no-op default and render our own.
});

const ui = createSuperDocUI({ superdoc });
const scope = ui.createScope();

const toolbar = document.querySelector<HTMLElement>('#toolbar')!;

// Built-in command buttons. Same shape, different ids. Each one
// subscribes per-id so unrelated state changes don't re-render the
// row.
type ButtonConfig = { id: 'bold' | 'italic' | 'underline'; label: string; title: string; className?: string };
const BUILT_IN_BUTTONS: ButtonConfig[] = [
  { id: 'bold', label: 'B', title: 'Bold (\u2318B)' },
  { id: 'italic', label: 'I', title: 'Italic (\u2318I)', className: 'italic' },
  { id: 'underline', label: 'U', title: 'Underline (\u2318U)', className: 'underline' },
];

for (const config of BUILT_IN_BUTTONS) {
  const btn = document.createElement('button');
  btn.textContent = config.label;
  btn.title = config.title;
  if (config.className) btn.classList.add(config.className);
  // Keep editor focus while the button is clicked. Without this, the
  // mousedown moves focus to the button, the editor blurs, and the
  // selection that fed `state.disabled` / `state.active` may collapse
  // before the click handler runs. The built-in toolbar uses the
  // same trick.
  btn.addEventListener('mousedown', (event) => event.preventDefault());
  btn.addEventListener('click', () => {
    ui.commands.get(config.id)?.execute();
  });
  toolbar.appendChild(btn);

  // `ui.commands.<id>.observe` fires once with the initial state and
  // again when `active` / `disabled` flip. The fallback during
  // editor-init is `{ disabled: true, active: false }`, so the button
  // renders disabled with no flicker.
  scope.add(
    ui.commands[config.id].observe((state) => {
      btn.disabled = state.disabled;
      btn.classList.toggle('active', state.active === true);
    }),
  );
}

const sep = document.createElement('span');
sep.className = 'sep';
toolbar.appendChild(sep);

// Custom command. Same surface as built-ins. The id is namespaced so
// it won't collide with future built-ins.
const insertClause = scope.register({
  id: 'example.insertClause',
  execute: ({ superdoc: sd }) => {
    const editor = sd?.activeEditor;
    const target = ui.selection.getSnapshot().selectionTarget;
    if (!editor?.doc?.insert || !target) return false;
    const receipt = editor.doc.insert({ target, value: 'This is a confidentiality clause.', type: 'text' });
    return receipt.success === true;
  },
  getState: ({ state }) => ({
    // Disable until the editor is ready and the user has a positional
    // selection (insert needs a target). The bold / italic buttons
    // already disable themselves when the selection collapses, so the
    // toolbar reads consistently across built-ins and customs.
    disabled: !state.document.ready || state.selection.selectionTarget == null,
  }),
});

const insertBtn = document.createElement('button');
insertBtn.textContent = 'Insert clause';
insertBtn.className = 'custom';
insertBtn.title = 'Insert a fixed snippet (custom command)';
insertBtn.addEventListener('mousedown', (event) => event.preventDefault());
insertBtn.addEventListener('click', () => {
  ui.commands.get('example.insertClause')?.execute();
});
toolbar.appendChild(insertBtn);

scope.add(
  insertClause.handle.observe((state) => {
    insertBtn.disabled = state.disabled === true;
  }),
);

const teardown = () => {
  ui.destroy();
  superdoc.destroy();
};
window.addEventListener('beforeunload', teardown);
if (import.meta.hot) import.meta.hot.dispose(teardown);
