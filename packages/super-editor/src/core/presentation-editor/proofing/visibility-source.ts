/**
 * Visibility Source
 *
 * Interface for telling the proofing manager which pages are currently
 * mounted and visible. PresentationEditor implements this by reading
 * viewport and renderer state.
 */

/**
 * Adapter that provides visibility information to the proofing manager.
 * PresentationEditor creates a concrete implementation that reads
 * mounted page state from the renderer and viewport scroll position.
 */
export interface VisibilitySource {
  /**
   * Returns the page indices that are currently mounted and likely visible.
   * Returns null if visibility data is temporarily unavailable.
   */
  getVisiblePageIndices(): number[] | null;
}
