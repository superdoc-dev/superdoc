import { SuperDoc } from 'superdoc';
import {
  createHeadlessToolbar,
  headlessToolbarConstants,
  type HeadlessToolbarController,
  type ToolbarSnapshot,
  type PublicToolbarItemId,
  type ToolbarPayloadMap,
} from 'superdoc/headless-toolbar';
import 'superdoc/style.css';
import './style.css';
import {
  Bold, Italic, Underline, Strikethrough,
  Undo2, Redo2, Image,
  createElement,
} from 'lucide';

// --- Icon helpers ---

function icon(node: Parameters<typeof createElement>[0]): SVGElement {
  return createElement(node) as unknown as SVGElement;
}

// --- DOM helpers ---

const $ = (sel: string) => document.querySelector(sel)!;

function btn(id: string, child: Node): HTMLButtonElement {
  const el = document.createElement('button');
  el.dataset.cmd = id;
  el.type = 'button';
  el.appendChild(child);
  return el;
}

function sep(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'separator';
  return el;
}

type MenuOption = { label: string; value: string };
type ButtonToolbarItemId = {
  [Id in PublicToolbarItemId]: ToolbarPayloadMap[Id] extends never ? Id : never;
}[PublicToolbarItemId];

function firstFontName(value: string): string {
  return value.split(',')[0]?.trim().replace(/^["']|["']$/g, '') || value;
}

function normalizedMenuValue(value: string): string {
  return firstFontName(value).toLowerCase();
}

function menu(id: string, options: readonly MenuOption[], placeholder: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'menu-control';
  el.dataset.menuCmd = id;
  el.dataset.placeholder = placeholder;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'menu-trigger';
  trigger.dataset.menuTrigger = 'true';
  trigger.textContent = placeholder;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  el.appendChild(trigger);

  const list = document.createElement('div');
  list.className = 'menu-list';
  list.hidden = true;
  list.setAttribute('role', 'listbox');

  for (const opt of options) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'menu-option';
    item.dataset.menuValue = opt.value;
    item.textContent = opt.label;
    item.setAttribute('role', 'option');
    list.appendChild(item);
  }

  el.appendChild(list);
  return el;
}

function setMenuOpen(control: HTMLElement, open: boolean) {
  const list = control.querySelector<HTMLElement>('.menu-list');
  const trigger = control.querySelector<HTMLButtonElement>('[data-menu-trigger]');
  if (!list || !trigger) return;
  list.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
}

function closeMenus(container: HTMLElement, except?: HTMLElement) {
  container.querySelectorAll<HTMLElement>('[data-menu-cmd]').forEach((control) => {
    if (control !== except) setMenuOpen(control, false);
  });
}

// --- Build toolbar DOM ---

function buildToolbar(container: HTMLElement) {
  const { DEFAULT_FONT_FAMILY_OPTIONS, DEFAULT_FONT_SIZE_OPTIONS, DEFAULT_TEXT_COLOR_OPTIONS } = headlessToolbarConstants;

  // Undo / Redo
  container.append(
    btn('undo', icon(Undo2)),
    btn('redo', icon(Redo2)),
    sep(),
  );

  // Font family & size
  container.append(
    menu('font-family', DEFAULT_FONT_FAMILY_OPTIONS, 'Font'),
    menu('font-size', DEFAULT_FONT_SIZE_OPTIONS.map(o => ({ label: o.label, value: o.value })), 'Size'),
    sep(),
  );

  // Inline formatting
  container.append(
    btn('bold', icon(Bold)),
    btn('italic', icon(Italic)),
    btn('underline', icon(Underline)),
    btn('strikethrough', icon(Strikethrough)),
    sep(),
  );

  // Text color
  container.append(
    menu('text-color', DEFAULT_TEXT_COLOR_OPTIONS.map(o => ({ label: o.label, value: o.value })), 'Color'),
    sep(),
  );

  // Text align
  container.append(menu('text-align', headlessToolbarConstants.DEFAULT_TEXT_ALIGN_OPTIONS, 'Align'), sep());

  // Image
  container.append(btn('image', icon(Image)));
}

// --- Wire events ---

function bindEvents(
  container: HTMLElement,
  toolbar: HeadlessToolbarController,
) {
  container.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('button[data-cmd]');
    if (!target) return;
    const cmd = target.dataset.cmd as ButtonToolbarItemId;
    toolbar.execute(cmd);
  });

  container.querySelectorAll<HTMLElement>('[data-menu-cmd]').forEach((control) => {
    const trigger = control.querySelector<HTMLButtonElement>('[data-menu-trigger]');
    trigger?.addEventListener('mousedown', (event) => event.preventDefault());
    trigger?.addEventListener('click', () => {
      const isOpen = control.querySelector<HTMLElement>('.menu-list')?.hidden === false;
      closeMenus(container, control);
      setMenuOpen(control, !isOpen);
    });

    control.querySelectorAll<HTMLButtonElement>('[data-menu-value]').forEach((option) => {
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => {
        const cmd = control.dataset.menuCmd as PublicToolbarItemId;
        const value = option.dataset.menuValue ?? '';
        toolbar.execute(cmd, value);
        setMenuOpen(control, false);
      });
    });
  });

  document.addEventListener('mousedown', (event) => {
    if (!container.contains(event.target as Node | null)) closeMenus(container);
  });
}

// --- Snapshot sync ---

const TOGGLE_COMMANDS: PublicToolbarItemId[] = [
  'bold', 'italic', 'underline', 'strikethrough',
];

function syncUI(container: HTMLElement, snapshot: ToolbarSnapshot) {
  // Toggle buttons
  for (const id of TOGGLE_COMMANDS) {
    const el = container.querySelector<HTMLButtonElement>(`button[data-cmd="${id}"]`);
    if (!el) continue;
    const state = snapshot.commands[id];
    el.classList.toggle('active', state?.active ?? false);
    el.disabled = state?.disabled ?? true;
  }

  // Non-toggle buttons
  for (const id of ['undo', 'redo', 'image'] as PublicToolbarItemId[]) {
    const el = container.querySelector<HTMLButtonElement>(`button[data-cmd="${id}"]`);
    if (!el) continue;
    el.disabled = snapshot.commands[id]?.disabled ?? true;
  }

  // Menus
  for (const id of ['font-family', 'font-size', 'text-color', 'text-align'] as PublicToolbarItemId[]) {
    const control = container.querySelector<HTMLElement>(`[data-menu-cmd="${id}"]`);
    const trigger = control?.querySelector<HTMLButtonElement>('[data-menu-trigger]');
    if (!control || !trigger) continue;
    const state = snapshot.commands[id];
    trigger.disabled = state?.disabled ?? true;
    const value = state?.value == null ? '' : String(state.value);
    const current = normalizedMenuValue(value);
    const selected = Array.from(control.querySelectorAll<HTMLButtonElement>('[data-menu-value]')).find((option) => {
      const optionValue = option.dataset.menuValue ?? '';
      const optionLabel = option.textContent ?? '';
      return (
        optionValue === value ||
        normalizedMenuValue(optionValue) === current ||
        normalizedMenuValue(optionLabel) === current
      );
    });
    trigger.textContent = selected?.textContent ?? (value ? firstFontName(value) : control.dataset.placeholder ?? '');
    control.querySelectorAll<HTMLButtonElement>('[data-menu-value]').forEach((option) => {
      option.setAttribute('aria-selected', String(option === selected));
    });
  }
}

// --- Bootstrap ---

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/test_file.docx',
});

const toolbarEl = $('#toolbar') as HTMLElement;
buildToolbar(toolbarEl);

const toolbar = createHeadlessToolbar({
  superdoc: superdoc as any,
  commands: [
    'bold', 'italic', 'underline', 'strikethrough',
    'font-family', 'font-size', 'text-color',
    'text-align', 'undo', 'redo', 'image',
  ],
});

bindEvents(toolbarEl, toolbar);
toolbar.subscribe(({ snapshot }) => syncUI(toolbarEl, snapshot));
