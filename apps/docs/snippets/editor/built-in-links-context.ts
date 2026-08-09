import { SuperDoc, type ContextMenuConfig, type LinkPopoverResolver } from 'superdoc';
import 'superdoc/style.css';

const resolveLinkPopover: LinkPopoverResolver = ({ href }) => ({
  type: 'external',
  render: ({ container, closePopover }) => {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open link';

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', closePopover);
    container.append(link, close);

    return { destroy: () => close.removeEventListener('click', closePopover) };
  },
});

const contextMenu = {
  includeDefaultItems: true,
  customItems: [
    {
      id: 'application-actions',
      items: [
        {
          id: 'copy-selection-to-workflow',
          label: 'Copy selection to workflow',
          showWhen: ({ hasSelection }) => hasSelection,
          // `onSelect`, not the v1 `action` callback: v2 cannot invoke `action`
          // because its first argument is a ProseMirror Editor this runtime does
          // not have, so an `action`-only item warns once and dismisses.
          //
          // `context` is the snapshot captured when the menu opened, and it is
          // null when none was captured. `selectedText` is read synchronously to
          // keep the click's user activation, which `navigator.clipboard`
          // requires; it is empty when a worker-backed read had not settled by
          // click time, so copy only when it carries text. Awaiting
          // `selectedTextSettled` would return the accurate text but spend the
          // activation the clipboard write needs.
          // `onSelect` returns `void | Promise<void>`, so returning the write
          // hands the rejection to the runtime instead of leaving an unhandled
          // one when clipboard access is denied. The write is still initiated
          // synchronously inside the gesture, which is what the permission
          // check requires.
          onSelect: ({ context }) => {
            if (!context?.selectedText) return;
            return navigator.clipboard.writeText(context.selectedText);
          },
        },
      ],
    },
  ],
} satisfies ContextMenuConfig;

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  ui: {
    // A toolbar renders only once it has somewhere to mount. Naming groups
    // without a container leaves the handle available and the toolbar absent.
    toolbar: { container: '#toolbar', groups: { center: ['link'] } },
    contextMenu,
  },
  // `popoverResolver` has no `ui` equivalent yet: the link popover reads it
  // from `modules.links`, so this one stays where the runtime looks for it.
  modules: {
    links: { popoverResolver: resolveLinkPopover },
  },
});

window.addEventListener('beforeunload', () => superdoc.destroy());
