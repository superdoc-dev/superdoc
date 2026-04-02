import { SuperDoc } from 'superdoc';
import {
  createHeadlessToolbar,
  headlessToolbarConstants,
  type HeadlessToolbarController,
  type ToolbarSnapshot,
  type PublicToolbarItemId,
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

function select(id: string, options: readonly { label: string; value: string }[]): HTMLSelectElement {
  const el = document.createElement('select');
  el.dataset.cmd = id;
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    el.appendChild(o);
  }
  return el;
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
    select('font-family', DEFAULT_FONT_FAMILY_OPTIONS),
    select('font-size', DEFAULT_FONT_SIZE_OPTIONS.map(o => ({ label: o.label, value: o.value }))),
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
    select('text-color', DEFAULT_TEXT_COLOR_OPTIONS.map(o => ({ label: o.label, value: o.value }))),
    sep(),
  );

  // Text align
  const alignSelect = document.createElement('select');
  alignSelect.dataset.cmd = 'text-align';
  for (const opt of headlessToolbarConstants.DEFAULT_TEXT_ALIGN_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    alignSelect.appendChild(o);
  }
  container.append(alignSelect, sep());

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
    const cmd = target.dataset.cmd as PublicToolbarItemId;
    toolbar.execute(cmd);
  });

  container.querySelectorAll<HTMLSelectElement>('select[data-cmd]').forEach((sel) => {
    sel.addEventListener('change', () => {
      toolbar.execute(sel.dataset.cmd as PublicToolbarItemId, sel.value);
    });
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

  // Selects
  for (const id of ['font-family', 'font-size', 'text-color', 'text-align'] as PublicToolbarItemId[]) {
    const sel = container.querySelector<HTMLSelectElement>(`select[data-cmd="${id}"]`);
    if (!sel) continue;
    const state = snapshot.commands[id];
    sel.disabled = state?.disabled ?? true;
    if (state?.value != null) {
      const val = String(state.value);
      // Only set if the value matches an existing option
      const hasOption = Array.from(sel.options).some((o) => o.value === val);
      if (hasOption) sel.value = val;
    }
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
