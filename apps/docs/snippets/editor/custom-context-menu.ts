import { SuperDoc } from 'superdoc';
import type { BorrowedSuperDocUI, CommandExecutionResult, ViewportContext } from 'superdoc/ui';
import 'superdoc/style.css';

const editorHost = document.querySelector<HTMLElement>('#editor');
const menu = document.querySelector<HTMLElement>('#document-menu');
const acceptButton = document.querySelector<HTMLButtonElement>('[data-menu-action="accept"]');
const rejectButton = document.querySelector<HTMLButtonElement>('[data-menu-action="reject"]');
const copyButton = document.querySelector<HTMLButtonElement>('[data-menu-action="copy"]');
const status = document.querySelector<HTMLParagraphElement>('#menu-status');

if (!editorHost || !menu || !acceptButton || !rejectButton || !copyButton || !status) {
  throw new Error('The custom context-menu controls are incomplete.');
}

type ChangeTarget = { id: string; story?: unknown };

let ui: BorrowedSuperDocUI | null = null;
let context: ViewportContext | null = null;
let changeTarget: ChangeTarget | null = null;

const menuItems = [acceptButton, rejectButton, copyButton];

const describeResult = (result: CommandExecutionResult, success: string): string => {
  if (result === false) return 'That action is unavailable.';
  if (typeof result === 'object' && !result.success) return result.failure.message;
  return success;
};

const closeMenu = (restoreEditorFocus: boolean) => {
  menu.hidden = true;
  context = null;
  changeTarget = null;
  if (restoreEditorFocus) superdoc.focus();
};

const positionMenu = ({ x, y }: { x: number; y: number }) => {
  menu.style.position = 'fixed';
  menu.style.left = '0px';
  menu.style.top = '0px';
  menu.style.zIndex = '10';
  menu.hidden = false;

  const bounds = menu.getBoundingClientRect();
  const edge = 8;
  menu.style.left = `${Math.max(edge, Math.min(x, window.innerWidth - bounds.width - edge))}px`;
  menu.style.top = `${Math.max(edge, Math.min(y, window.innerHeight - bounds.height - edge))}px`;
};

const openMenu = (point: { x: number; y: number }) => {
  if (!ui) return;

  context = ui.viewport.contextAt(point);
  const trackedChange = context.entities.find((entity) => entity.type === 'trackedChange');
  changeTarget = trackedChange
    ? { id: trackedChange.id, ...(trackedChange.story === undefined ? {} : { story: trackedChange.story }) }
    : null;

  acceptButton.disabled = !changeTarget;
  rejectButton.disabled = !changeTarget;
  // `contextAt()` returns the best-known selection immediately. While a re-read
  // is in flight the slice reports `pending` or `stale` and still carries the
  // previous range, so enabling Copy on `quotedText` alone would let a quick
  // right-click after a selection change copy the old text. Require `ready`.
  copyButton.disabled =
    context.selection.status !== 'ready' || context.selection.empty || context.selection.quotedText.length === 0;

  positionMenu(point);
  const firstAvailable = menuItems.find((item) => !item.disabled);
  (firstAvailable ?? menu).focus();
};

const decideChange = async (command: 'acceptChange' | 'rejectChange', success: string) => {
  if (!ui || !changeTarget) return;
  const result = await ui.commands.executeAsync(command, changeTarget);
  status.textContent = describeResult(result, success);
  closeMenu(true);
};

const copySelection = async () => {
  const text = context?.selection.quotedText;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'Selection copied.';
  } catch {
    status.textContent = 'The browser did not allow clipboard access.';
  }
  closeMenu(true);
};

const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  openMenu({ x: event.clientX, y: event.clientY });
};

const handleContextMenuKey = (event: KeyboardEvent) => {
  const requested = event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
  if (!requested || !ui) return;

  const anchor = ui.selection.getAnchorRect({ placement: 'center' });
  if (!anchor) return;

  event.preventDefault();
  openMenu({ x: (anchor.left + anchor.right) / 2, y: (anchor.top + anchor.bottom) / 2 });
};

const handleMenuKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' || event.key === 'Tab') {
    closeMenu(event.key === 'Escape');
    return;
  }

  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();

  const available = menuItems.filter((item) => !item.disabled);
  const current = available.indexOf(document.activeElement as HTMLButtonElement);
  const direction = event.key === 'ArrowDown' ? 1 : -1;
  available[(current + direction + available.length) % available.length]?.focus();
};

const handleOutsidePointer = (event: PointerEvent) => {
  if (!menu.hidden && !menu.contains(event.target as Node)) closeMenu(false);
};

const handleViewportChange = () => {
  if (!menu.hidden) closeMenu(false);
};

const handleAccept = () => void decideChange('acceptChange', 'Change accepted.');
const handleReject = () => void decideChange('rejectChange', 'Change rejected.');
const handleCopy = () => void copySelection();

const superdoc = new SuperDoc({
  selector: editorHost,
  document: '/contract.docx',
  documentMode: 'suggesting',
  ui: { contextMenu: false },
  onReady: ({ superdoc: readySuperDoc }) => {
    ui = readySuperDoc.ui;
  },
});

acceptButton.addEventListener('click', handleAccept);
rejectButton.addEventListener('click', handleReject);
copyButton.addEventListener('click', handleCopy);
editorHost.addEventListener('contextmenu', handleContextMenu);
editorHost.addEventListener('keydown', handleContextMenuKey, true);
menu.addEventListener('keydown', handleMenuKey);
document.addEventListener('pointerdown', handleOutsidePointer);
document.addEventListener('scroll', handleViewportChange, true);
window.addEventListener('resize', handleViewportChange);

window.addEventListener('beforeunload', () => {
  acceptButton.removeEventListener('click', handleAccept);
  rejectButton.removeEventListener('click', handleReject);
  copyButton.removeEventListener('click', handleCopy);
  editorHost.removeEventListener('contextmenu', handleContextMenu);
  editorHost.removeEventListener('keydown', handleContextMenuKey, true);
  menu.removeEventListener('keydown', handleMenuKey);
  document.removeEventListener('pointerdown', handleOutsidePointer);
  document.removeEventListener('scroll', handleViewportChange, true);
  window.removeEventListener('resize', handleViewportChange);
  superdoc.destroy();
});
