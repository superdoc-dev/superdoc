/**
 * Maps display alignment (UI-facing physical left/right/center/justify) to
 * stored OOXML paragraph justification, honoring RTL paragraph direction.
 *
 * @param {'left' | 'center' | 'right' | 'justify'} alignment
 * @param {boolean} isRtl
 * @returns {'left' | 'center' | 'right' | 'both'}
 */
export function mapDisplayAlignmentToStoredJustification(alignment, isRtl) {
  if (alignment === 'justify') return 'both';
  if (!isRtl) return alignment;
  if (alignment === 'left') return 'right';
  if (alignment === 'right') return 'left';
  return alignment;
}

/**
 * Maps stored OOXML paragraph justification to display alignment, honoring
 * RTL paragraph direction. When justification is absent, returns the
 * visual default by direction.
 *
 * @param {string | null | undefined} justification
 * @param {boolean} isRtl
 * @returns {'left' | 'center' | 'right' | 'justify'}
 */
export function mapStoredJustificationToDisplayAlignment(justification, isRtl) {
  if (!justification) return isRtl ? 'right' : 'left';
  if (justification === 'both') return 'justify';
  if (!isRtl) return /** @type {'left' | 'center' | 'right' | 'justify'} */ (justification);
  if (justification === 'left') return 'right';
  if (justification === 'right') return 'left';
  return /** @type {'left' | 'center' | 'right' | 'justify'} */ (justification);
}
