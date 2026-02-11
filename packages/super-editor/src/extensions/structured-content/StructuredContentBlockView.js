import { Attribute } from '@core/index';
import { updateDOMAttributes } from '@core/helpers/updateDOMAttributes';
import { StructuredContentViewBase } from './StructuredContentViewBase';
import { structuredContentBlockClass, structuredContentBlockInnerClass } from './structured-content-block';

export class StructuredContentBlockView extends StructuredContentViewBase {
  constructor(props) {
    super(props);
  }

  mount() {
    this.buildView();
  }

  get contentDOM() {
    const contentElement = this.dom?.querySelector(`.${structuredContentBlockInnerClass}`);
    return contentElement || null;
  }

  createElement() {
    const element = document.createElement('div');
    element.classList.add(structuredContentBlockClass);
    element.setAttribute('data-structured-content-block', '');

    const contentElement = document.createElement('div');
    contentElement.classList.add(structuredContentBlockInnerClass);

    element.append(contentElement);

    const domAttrs = Attribute.mergeAttributes(this.htmlAttributes);
    updateDOMAttributes(element, { ...domAttrs });

    return { element, contentElement };
  }

  buildView() {
    const { element } = this.createElement();
    const dragHandle = this.createDragHandle();
    element.prepend(dragHandle);
    element.addEventListener('dragstart', (e) => this.onDragStart(e));
    this.root = element;
    this.updateContentEditability();
  }

  updateView() {
    const domAttrs = Attribute.mergeAttributes(this.htmlAttributes);
    updateDOMAttributes(this.dom, { ...domAttrs });
    this.updateContentEditability();
  }

  update(node, decorations, innerDecorations) {
    const result = super.update(node, decorations, innerDecorations);
    if (!result) return false;
    this.updateView();
    return true;
  }
}
