import { Attribute } from '@core/index';
import { NodeSelection } from 'prosemirror-state';

export class StructuredContentViewBase {
  node;

  view;

  getPos;

  decorations;

  innerDecorations;

  editor;

  extension;

  htmlAttributes;

  root;

  isDragging = false;

  constructor(props) {
    this.node = props.node;
    this.view = props.editor.view;
    this.getPos = props.getPos;
    this.decorations = props.decorations;
    this.innerDecorations = props.innerDecorations;
    this.editor = props.editor;
    this.extension = props.extension;
    this.htmlAttributes = props.htmlAttributes;

    this.mount(props);
  }

  mount() {
    return;
  }

  get dom() {
    return this.root;
  }

  get contentDOM() {
    return null;
  }

  update(node, decorations, innerDecorations) {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;
    this.decorations = decorations;
    this.innerDecorations = innerDecorations;
    this.updateHTMLAttributes();

    return true;
  }

  stopEvent(event) {
    if (!this.dom) return false;

    const target = event.target;
    const isInElement = this.dom.contains(target) && !this.contentDOM?.contains(target);

    // any event from child nodes should be handled by ProseMirror
    if (!isInElement) return false;

    const isDragEvent = event.type.startsWith('drag');
    const isDropEvent = event.type === 'drop';
    const isInput = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;

    // any input event within node views should be ignored by ProseMirror
    if (isInput && !isDropEvent && !isDragEvent) return true;

    const { isEditable } = this.editor;
    const { isDragging } = this;
    const isDraggable = !!this.node.type.spec.draggable;
    const isSelectable = NodeSelection.isSelectable(this.node);
    const isCopyEvent = event.type === 'copy';
    const isPasteEvent = event.type === 'paste';
    const isCutEvent = event.type === 'cut';
    const isClickEvent = event.type === 'mousedown';

    // ProseMirror tries to drag selectable nodes
    // even if `draggable` is set to `false`
    // this fix prevents that
    if (!isDraggable && isSelectable && isDragEvent && event.target === this.dom) {
      event.preventDefault();
    }

    if (isDraggable && isDragEvent && !isDragging && event.target === this.dom) {
      event.preventDefault();
      return false;
    }

    // we have to store that dragging started
    if (isDraggable && isEditable && !isDragging && isClickEvent) {
      const dragHandle = target.closest('[data-drag-handle]');
      const isValidDragHandle = dragHandle && (this.dom === dragHandle || this.dom.contains(dragHandle));
      if (isValidDragHandle) {
        this.isDragging = true;

        document.addEventListener(
          'dragend',
          () => {
            this.isDragging = false;
          },
          { once: true },
        );
        document.addEventListener(
          'drop',
          () => {
            this.isDragging = false;
          },
          { once: true },
        );
        document.addEventListener(
          'mouseup',
          () => {
            this.isDragging = false;
          },
          { once: true },
        );
      }
    }

    // these events are handled by prosemirror
    if (isDragging || isDropEvent || isCopyEvent || isPasteEvent || isCutEvent || (isClickEvent && isSelectable)) {
      return false;
    }

    return true;
  }

  ignoreMutation(mutation) {
    if (!this.dom || !this.contentDOM) return true;

    if (this.node.isLeaf || this.node.isAtom) return true;

    if (mutation.type === 'selection') return false;

    if (this.contentDOM === mutation.target && mutation.type === 'attributes') return true;

    if (this.contentDOM.contains(mutation.target)) return false;

    return true;
  }

  destroy() {
    this.dom.remove();
    this.contentDOM?.remove();
  }

  updateAttributes(attrs) {
    const pos = this.getPos();

    if (typeof pos !== 'number') {
      return;
    }

    return this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        ...attrs,
      }),
    );
  }

  updateHTMLAttributes() {
    const { extensionService } = this.editor;
    const { attributes } = extensionService;
    const extensionAttrs = attributes.filter((i) => i.type === this.node.type.name);
    this.htmlAttributes = Attribute.getAttributesToRender(this.node, extensionAttrs);
  }

  createDragHandle() {
    const dragHandle = document.createElement('span');
    dragHandle.classList.add('sd-structured-content-draggable');
    dragHandle.draggable = true;
    dragHandle.contentEditable = 'false';
    dragHandle.dataset.dragHandle = '';
    const textElement = document.createElement('span');
    textElement.textContent = this.node.attrs.alias || 'Structured content';
    dragHandle.append(textElement);
    return dragHandle;
  }

  isContentLocked() {
    const lockMode = this.node.attrs.lockMode;
    return lockMode === 'contentLocked' || lockMode === 'sdtContentLocked';
  }

  isSdtLocked() {
    const lockMode = this.node.attrs.lockMode;
    return lockMode === 'sdtLocked' || lockMode === 'sdtContentLocked';
  }

  updateContentEditability() {
    // Note: We intentionally do NOT set contentEditable='false' for locked content.
    // This allows cursor movement and selection within locked nodes.
    // The lock plugin (structured-content-lock-plugin.js) handles blocking actual edits
    // via handleKeyDown, handleTextInput, and filterTransaction.
    // We only add CSS classes for visual feedback.
    if (this.dom) {
      this.dom.classList.toggle('sd-structured-content--content-locked', this.isContentLocked());
      this.dom.classList.toggle('sd-structured-content--sdt-locked', this.isSdtLocked());
    }
  }

  onDragStart(event) {
    const { view } = this.editor;
    const target = event.target;

    // get the drag handle element
    // `closest` is not available for text nodes so we may have to use its parent
    const dragHandle =
      target.nodeType === 3
        ? target.parentElement?.closest('[data-drag-handle]')
        : target.closest('[data-drag-handle]');

    if (!this.dom || this.contentDOM?.contains(target) || !dragHandle) {
      return;
    }

    let x = 0;
    let y = 0;

    // calculate offset for drag element if we use a different drag handle element
    if (this.dom !== dragHandle) {
      const domBox = this.dom.getBoundingClientRect();
      const handleBox = dragHandle.getBoundingClientRect();

      const offsetX = event.offsetX ?? event.nativeEvent?.offsetX;
      const offsetY = event.offsetY ?? event.nativeEvent?.offsetY;

      x = handleBox.x - domBox.x + offsetX;
      y = handleBox.y - domBox.y + offsetY;
    }

    event.dataTransfer?.setDragImage(this.dom, x, y);

    const pos = this.getPos();

    if (typeof pos !== 'number') {
      return;
    }

    // we need to tell ProseMirror that we want to move the whole node
    // so we create a NodeSelection
    const selection = NodeSelection.create(view.state.doc, pos);
    const transaction = view.state.tr.setSelection(selection);

    view.dispatch(transaction);
  }
}
