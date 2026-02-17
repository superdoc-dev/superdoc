/**
 * Shared utilities for inset(top% right% bottom% left%) clip-path (e.g. from DOCX a:srcRect).
 * Used by both the layout-engine painters and super-editor image extension so the same
 * scale/translate math is applied everywhere.
 */

/** Result of parsing an inset() clip-path for scale/translate. */
export type InsetClipPathScale = {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
};

/**
 * Parses inset(top% right% bottom% left%) from a clipPath string and returns scale + translate
 * so the visible clipped portion fills the container and is aligned to top-left.
 *
 * @param clipPath - e.g. "inset(10% 20% 30% 40%)"
 * @returns Scale and translate values, or null if not a valid inset()
 */
export function parseInsetClipPathForScale(clipPath: string): InsetClipPathScale | null {
  const m = clipPath
    .trim()
    .match(
      /^inset\(\s*(\d+(?:\.\d+)?|\.\d+)%\s+(\d+(?:\.\d+)?|\.\d+)%\s+(\d+(?:\.\d+)?|\.\d+)%\s+(\d+(?:\.\d+)?|\.\d+)%\s*\)$/,
    );
  if (!m) return null;
  const top = Number(m[1]);
  const right = Number(m[2]);
  const bottom = Number(m[3]);
  const left = Number(m[4]);
  if (![top, right, bottom, left].every(Number.isFinite)) return null;
  const visibleW = 100 - left - right;
  const visibleH = 100 - top - bottom;
  if (visibleW <= 0 || visibleH <= 0) return null;
  const scaleX = 100 / visibleW;
  const scaleY = 100 / visibleH;
  const translateX = -left * scaleX;
  const translateY = -top * scaleY;
  return { scaleX, scaleY, translateX, translateY };
}

/**
 * Builds the CSS transform-origin and transform string from a parsed inset scale result.
 *
 * @param clipPath - e.g. "inset(10% 20% 30% 40%)"
 * @returns CSS fragment: "transform-origin: 0 0; transform: translate(...) scale(...);"
 */
export function formatInsetClipPathTransform(clipPath: string): string | undefined {
  const scale = parseInsetClipPathForScale(clipPath);
  if (!scale) return undefined;
  return `transform-origin: 0 0; transform: translate(${scale.translateX}%, ${scale.translateY}%) scale(${scale.scaleX}, ${scale.scaleY});`;
}
