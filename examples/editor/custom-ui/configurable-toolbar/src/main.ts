/**
 * The smallest example that proves how to build your own toolbar with
 * `superdoc/ui`. Formatting buttons, a font-family picker, and one
 * custom command, all on the same surface, no framework.
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

type FontOption = { label: string; value: string; previewFamily: string };

function normalizeFontToken(value: unknown): string {
  return typeof value === 'string' ? value.split(',')[0]?.trim().replace(/^["']|["']$/g, '') || '' : '';
}

function optionValueForCurrentFont(value: unknown, options: readonly FontOption[]): string {
  const current = normalizeFontToken(value).toLowerCase();
  if (!current) return '';

  const match = options.find((option) => {
    const logical = normalizeFontToken(option.value).toLowerCase();
    const label = normalizeFontToken(option.label).toLowerCase();
    const preview = normalizeFontToken(option.previewFamily).toLowerCase();
    return current === logical || current === label || current === preview;
  });

  return match?.value ?? '';
}

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

const fontPicker = document.createElement('div');
fontPicker.className = 'font-picker';
toolbar.appendChild(fontPicker);

const fontButton = document.createElement('button');
fontButton.type = 'button';
fontButton.className = 'font-picker-trigger';
fontButton.title = 'Font family';
fontButton.setAttribute('aria-label', 'Font family');
fontButton.setAttribute('aria-haspopup', 'listbox');
fontButton.setAttribute('aria-expanded', 'false');
fontPicker.appendChild(fontButton);

const fontMenu = document.createElement('div');
fontMenu.className = 'font-picker-menu';
fontMenu.setAttribute('role', 'listbox');
fontMenu.hidden = true;
fontPicker.appendChild(fontMenu);

let currentFontValue = '';
let currentFontOptions: FontOption[] = [];
let capturedFontSelection: ReturnType<typeof ui.selection.capture> | null = null;

const rememberFontSelection = () => {
  const capture = ui.selection.capture();
  if (capture) capturedFontSelection = capture;
};

const selectedFontOption = () => {
  const value = optionValueForCurrentFont(currentFontValue, currentFontOptions);
  return currentFontOptions.find((font) => font.value === value) ?? null;
};

const setFontMenuOpen = (open: boolean) => {
  fontMenu.hidden = !open;
  fontButton.setAttribute('aria-expanded', String(open));
};

const refreshFontButton = () => {
  const selected = selectedFontOption();
  fontButton.textContent = selected?.label ?? 'Font';
  fontButton.style.fontFamily = selected?.previewFamily ?? '';
};

const applyFontValue = (value: string) => {
  if (capturedFontSelection) {
    ui.selection.restore(capturedFontSelection);
    capturedFontSelection = null;
  }
  setFontMenuOpen(false);
  ui.toolbar.execute('font-family', value);
};

const renderFontOptions = () => {
  const selectedValue = selectedFontOption()?.value ?? '';
  fontMenu.replaceChildren(
    ...currentFontOptions.map((font) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'font-picker-option';
      option.textContent = font.label;
      option.style.fontFamily = font.previewFamily;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(font.value === selectedValue));
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        rememberFontSelection();
      });
      option.addEventListener('click', () => applyFontValue(font.value));
      return option;
    }),
  );
};

scope.add(
  ui.fonts.observe((snapshot) => {
    currentFontOptions = [...snapshot.options];
    renderFontOptions();
    refreshFontButton();
  }),
);

fontButton.addEventListener('mousedown', (event) => {
  event.preventDefault();
  rememberFontSelection();
});
fontButton.addEventListener('click', () => setFontMenuOpen(fontMenu.hidden));

const closeFontMenuOnOutsideClick = (event: MouseEvent) => {
  if (!fontPicker.contains(event.target as Node | null)) setFontMenuOpen(false);
};
const closeFontMenuOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') setFontMenuOpen(false);
};
document.addEventListener('mousedown', closeFontMenuOnOutsideClick);
document.addEventListener('keydown', closeFontMenuOnEscape);
scope.add(() => {
  document.removeEventListener('mousedown', closeFontMenuOnOutsideClick);
  document.removeEventListener('keydown', closeFontMenuOnEscape);
});

const fontCommand = ui.commands.get('font-family');
if (fontCommand) {
  scope.add(
    fontCommand.observe((state) => {
      fontButton.disabled = state.disabled;
      currentFontValue = typeof state.value === 'string' ? state.value : '';
      renderFontOptions();
      refreshFontButton();
    }),
  );
}

const fontSep = document.createElement('span');
fontSep.className = 'sep';
toolbar.appendChild(fontSep);

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
