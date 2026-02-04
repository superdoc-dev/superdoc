import { parseInsetClipPathForScale } from '@superdoc/contracts';

/**
 * Resolves a clip-path value to a trimmed non-empty string, or undefined if invalid.
 */
export function resolveClipPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Applies clip-path and optional scale/translate (for inset() srcRect) to an element.
 * When the clipPath is inset(top% right% bottom% left%), also sets transform so the
 * visible portion fills the element and is aligned to top-left.
 */
export function applyImageClipPath(el: HTMLElement, clipPath: unknown): void {
  const resolved = resolveClipPath(clipPath);
  if (resolved) {
    el.style.clipPath = resolved;
    const scale = parseInsetClipPathForScale(resolved);
    if (scale) {
      el.style.transformOrigin = '0 0';
      el.style.transform = `translate(${scale.translateX}%, ${scale.translateY}%) scale(${scale.scaleX}, ${scale.scaleY})`;
    }
  }
}
