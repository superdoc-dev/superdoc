import type { DirectiveBinding } from 'vue';
interface ClickOutsideElement extends HTMLElement {
  __clickOutsideHandler?: (event: MouseEvent) => void;
}
type ClickOutsideHandler = (event: MouseEvent) => void;
declare const _default: {
  mounted(el: ClickOutsideElement, binding: DirectiveBinding<ClickOutsideHandler>): void;
  unmounted(el: ClickOutsideElement): void;
};
export default _default;
