/**
 * Custom toolbar built straight on `ui.commands.<id>`.
 *
 * Built-ins (bold, italic, underline, undo, redo, bullet-list,
 * numbered-list) bind to per-command observables — the React demo
 * uses `useSuperDocCommand(id)`; here we call `.observe(...)`
 * directly. Each button only re-renders when its own command flips
 * active / disabled, matching the React per-button granularity.
 *
 * One custom command is registered through `ui.commands.register(...)`
 * to demonstrate the AI-Rewrite / Insert-Clause pattern without React.
 */

import type { SuperDocUI } from 'superdoc/ui';
import { Disposer } from './bind';

interface MountToolbarOpts {
  toolbarEl: HTMLElement;
  ui: SuperDocUI;
  disposer: Disposer;
  onComposeComment(): void;
}

interface BuiltInDef {
  id: string;
  label: string;
  title: string;
  fontStyle?: Partial<CSSStyleDeclaration>;
}

const TEXT_BUTTONS: BuiltInDef[] = [
  { id: 'bold', label: 'B', title: 'Bold (⌘B)', fontStyle: { fontWeight: '700' } },
  { id: 'italic', label: 'I', title: 'Italic (⌘I)', fontStyle: { fontStyle: 'italic' } },
  { id: 'underline', label: 'U', title: 'Underline (⌘U)', fontStyle: { textDecoration: 'underline' } },
];

const HISTORY_BUTTONS: BuiltInDef[] = [
  { id: 'undo', label: '↶', title: 'Undo (⌘Z)' },
  { id: 'redo', label: '↷', title: 'Redo (⌘⇧Z)' },
];

const LIST_BUTTONS: BuiltInDef[] = [
  { id: 'bullet-list', label: '•', title: 'Bullet list' },
  { id: 'numbered-list', label: '1.', title: 'Numbered list' },
];

const INSERT_CLAUSE_ID = 'company.insertClause';

export function mountToolbar({ toolbarEl, ui, disposer, onComposeComment }: MountToolbarOpts): void {
  toolbarEl.innerHTML = '';

  // Built-in command groups
  toolbarEl.appendChild(builtInGroup(TEXT_BUTTONS, ui, disposer));
  toolbarEl.appendChild(builtInGroup(HISTORY_BUTTONS, ui, disposer));
  toolbarEl.appendChild(builtInGroup(LIST_BUTTONS, ui, disposer));

  // Selection-driven group: comment + custom Insert Clause command.
  // Both buttons depend on the live selection; they bind to
  // `ui.selection.subscribe` for enable/disable state.
  toolbarEl.appendChild(selectionGroup(ui, disposer, onComposeComment));

  // Document-level controls (mode toggle / export / import) are
  // mounted by `mountDocumentControls` so the document-domain wiring
  // lives next to its slice. They append to this same toolbar.
}

function builtInGroup(defs: BuiltInDef[], ui: SuperDocUI, disposer: Disposer): HTMLElement {
  const group = document.createElement('div');
  group.className = 'toolbar-group';
  for (const def of defs) {
    const btn = makeBuiltInButton(def, ui, disposer);
    group.appendChild(btn);
  }
  return group;
}

function makeBuiltInButton(def: BuiltInDef, ui: SuperDocUI, disposer: Disposer): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tb-btn';
  btn.title = def.title;
  btn.textContent = def.label;
  if (def.fontStyle) Object.assign(btn.style, def.fontStyle);

  btn.addEventListener('click', () => {
    ui.commands.get(def.id)?.execute();
  });

  // Per-command subscription. `ui.commands.get(id)` returns a
  // type-erased {@link DynamicCommandHandle}; for ids known at
  // compile time we could index `ui.commands.bold` for typed
  // payloads / values, but the demo loops over a config array so
  // the dynamic lookup wins.
  const handle = ui.commands.get(def.id);
  if (!handle) {
    btn.disabled = true;
    btn.title = `${def.title} (unknown command)`;
    return btn;
  }
  const off = handle.observe((state) => {
    btn.classList.toggle('active', !!state.active);
    btn.disabled = !!state.disabled;
  });
  disposer.add(off);
  return btn;
}

function selectionGroup(ui: SuperDocUI, disposer: Disposer, onComposeComment: () => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'toolbar-group';

  // Comment button — disabled while there's no positional selection
  // (mirrors the React demo's CommentButton). Selection-driven enable
  // state comes from `ui.selection.subscribe` so the button keeps
  // sync across keyboard movement and clicks alike.
  const commentBtn = document.createElement('button');
  commentBtn.type = 'button';
  commentBtn.className = 'tb-btn';
  commentBtn.title = 'Add comment on selection';
  commentBtn.textContent = '💬';
  commentBtn.disabled = true;
  commentBtn.addEventListener('click', () => onComposeComment());
  group.appendChild(commentBtn);

  // Insert-clause custom command. Registered against the controller
  // so its enable state is in the same snapshot as built-ins, and so
  // a future floating-menu surface or keyboard shortcut can dispatch
  // it through the same `ui.commands.<id>` pipeline.
  const registration = ui.commands.register({
    id: INSERT_CLAUSE_ID,
    getState({ state }) {
      // Disabled when there's no selection target to insert against.
      const empty = state.selection.empty || state.selection.selectionTarget == null;
      return { active: false, disabled: empty };
    },
    async execute({ editor }) {
      if (!editor?.doc?.insert) return false;
      // Read the live selectionTarget at execute-time. The doc-API
      // call itself anchors to the routed editor.
      const target = ui.selection.getSnapshot().selectionTarget;
      if (!target) return false;
      const receipt = editor.doc.insert({
        target,
        value: ' [Standard MSA boilerplate inserted]',
        type: 'text',
      });
      return !!receipt?.success;
    },
  });
  disposer.add(() => registration.unregister());

  const insertBtn = document.createElement('button');
  insertBtn.type = 'button';
  insertBtn.className = 'tb-btn tb-btn-pill';
  insertBtn.title = 'Insert standard MSA clause at the selection';
  insertBtn.textContent = 'Insert clause';
  insertBtn.disabled = true;
  insertBtn.addEventListener('click', () => {
    void registration.handle.execute();
  });
  disposer.add(
    registration.handle.observe((state) => {
      insertBtn.disabled = !!state.disabled;
    }),
  );
  group.appendChild(insertBtn);

  // Drive the comment button's enable state from selection.
  disposer.add(
    ui.selection.subscribe(({ snapshot }) => {
      commentBtn.disabled = snapshot.empty || snapshot.target == null;
    }),
  );

  return group;
}
