/**
 * SDT Helper Utilities
 *
 * Provides type guards and helper functions for working with SDT (Structured Document Tag) metadata
 * in the DOM painter. These utilities ensure type-safe access to SDT properties and reduce code
 * duplication across rendering logic.
 */

import type { SdtMetadata, StructuredContentLockMode } from '@superdoc/contracts';

/**
 * Type guard for StructuredContentMetadata.
 */
export function isStructuredContentMetadata(sdt: SdtMetadata | null | undefined): sdt is {
  type: 'structuredContent';
  scope: 'inline' | 'block';
  alias?: string | null;
  lockMode?: StructuredContentLockMode;
} {
  return (
    sdt !== null && sdt !== undefined && typeof sdt === 'object' && 'type' in sdt && sdt.type === 'structuredContent'
  );
}

/**
 * Type guard for DocumentSectionMetadata.
 */
export function isDocumentSectionMetadata(
  sdt: SdtMetadata | null | undefined,
): sdt is { type: 'documentSection'; title?: string | null } {
  return (
    sdt !== null && sdt !== undefined && typeof sdt === 'object' && 'type' in sdt && sdt.type === 'documentSection'
  );
}

/**
 * SDT container styling configuration returned by applySdtContainerStyling.
 */
export type SdtContainerConfig = {
  /** CSS class name to add to the container element */
  className: string;
  /** Label/tooltip text to display */
  labelText: string;
  /** Label element class name */
  labelClassName: string;
  /** Whether this is the start of the SDT container (for multi-fragment SDTs) */
  isStart: boolean;
  /** Whether this is the end of the SDT container (for multi-fragment SDTs) */
  isEnd: boolean;
} | null;

/**
 * Determines SDT container styling configuration based on metadata.
 *
 * Analyzes the SDT metadata and returns configuration for applying visual styling
 * to block-level SDT containers (document sections and structured content blocks).
 * This function centralizes the logic for determining container appearance,
 * eliminating duplication between paragraph and table rendering.
 *
 * **Supported SDT Types:**
 * - `documentSection`: Gray bordered container with hover tooltip showing title
 * - `structuredContent` (block scope): Blue bordered container with label showing alias
 * - `structuredContent` (inline scope): Returns null (not a block container)
 * - Other types: Returns null (no container styling)
 *
 * **Container Continuation:**
 * For SDTs that span multiple fragments (pages), the `isStart` and `isEnd` flags
 * control border radius and border visibility:
 * - Start fragment: Top borders and top border radius
 * - Middle fragments: No top/bottom borders or radius
 * - End fragment: Bottom borders and bottom border radius
 *
 * @param sdt - The SDT metadata from block.attrs?.sdt
 * @returns Configuration object with styling details, or null if no container styling needed
 *
 * @example
 * ```typescript
 * const config = getSdtContainerConfig(block.attrs?.sdt);
 * if (config) {
 *   container.classList.add(config.className);
 *   container.dataset.sdtContainerStart = String(config.isStart);
 *   container.dataset.sdtContainerEnd = String(config.isEnd);
 *   // Create label element...
 * }
 * ```
 */
export function getSdtContainerConfig(sdt: SdtMetadata | null | undefined): SdtContainerConfig {
  if (isDocumentSectionMetadata(sdt)) {
    return {
      className: 'superdoc-document-section',
      labelText: sdt.title ?? 'Document section',
      labelClassName: 'superdoc-document-section__tooltip',
      isStart: true,
      isEnd: true,
    };
  }

  if (isStructuredContentMetadata(sdt) && sdt.scope === 'block') {
    return {
      className: 'superdoc-structured-content-block',
      labelText: sdt.alias ?? 'Structured content',
      labelClassName: 'superdoc-structured-content__label',
      isStart: true,
      isEnd: true,
    };
  }

  return null;
}

/**
 * Returns the SDT metadata for container styling, preferring `sdt` over `containerSdt`.
 */
export function getSdtContainerMetadata(
  sdt?: SdtMetadata | null,
  containerSdt?: SdtMetadata | null,
): SdtMetadata | null {
  if (getSdtContainerConfig(sdt)) return sdt ?? null;
  if (getSdtContainerConfig(containerSdt)) return containerSdt ?? null;
  return null;
}

/**
 * Returns a stable key for grouping consecutive fragments in the same SDT container.
 */
export function getSdtContainerKey(sdt?: SdtMetadata | null, containerSdt?: SdtMetadata | null): string | null {
  const metadata = getSdtContainerMetadata(sdt, containerSdt);
  if (!metadata) return null;

  if (metadata.type === 'structuredContent') {
    if (metadata.scope !== 'block') return null;
    if (!metadata.id) {
      return null;
    }
    return `structuredContent:${metadata.id}`;
  }

  if (metadata.type === 'documentSection') {
    const sectionId = metadata.id ?? metadata.sdBlockId;
    if (!sectionId) {
      return null;
    }
    return `documentSection:${sectionId}`;
  }

  return null;
}

/**
 * Options for SDT container boundary overrides.
 *
 * When multiple consecutive fragments share the same SDT container metadata,
 * use these options to control which fragments show start/end styling.
 */
export type SdtBoundaryOptions = {
  /** Override isStart - true for first fragment in SDT group */
  isStart?: boolean;
  /** Override isEnd - true for last fragment in SDT group */
  isEnd?: boolean;
  /** Optional width override for the SDT container element */
  widthOverride?: number;
  /** Optional padding bottom override for filling gaps between fragments */
  paddingBottomOverride?: number;
  /** Whether to show the label (overrides isStart check if provided) */
  showLabel?: boolean;
};

/**
 * Applies SDT container styling to a DOM element.
 *
 * This helper function encapsulates all logic for applying block-level SDT container
 * styling, including CSS classes, data attributes, overflow settings, and label/tooltip
 * elements. It eliminates code duplication between paragraph fragment rendering and
 * table fragment rendering.
 *
 * **Container SDT Fallback:**
 * If the primary `sdt` parameter is null/undefined or doesn't match a container type,
 * the function will check the `containerSdt` parameter as a fallback. This supports
 * paragraphs inside document sections where the paragraph itself doesn't have `sdt`
 * but inherits container styling from its parent section.
 *
 * **Visual Effects Applied:**
 * - Container CSS class for border and background styling
 * - Data attributes for continuation detection (`data-sdt-container-start/end`)
 * - Overflow visible to allow labels to appear above content
 * - Label/tooltip element created and appended to container when isStart=true
 * - Padding bottom applied if paddingBottomOverride is provided (for filling gaps)
 *
 * **Label Element Structure:**
 * ```html
 * <div class="superdoc-document-section__tooltip">
 *   <span>Section Title</span>
 * </div>
 * ```
 *
 * **Non-Destructive:**
 * This function only adds classes and elements; it does not remove existing styling.
 * It's safe to call multiple times or alongside other styling logic.
 *
 * @param doc - Document object for creating DOM elements
 * @param container - The container element to style (typically a fragment div)
 * @param sdt - The primary SDT metadata from block.attrs?.sdt
 * @param containerSdt - Optional fallback SDT metadata from block.attrs?.containerSdt
 * @param boundaryOptions - Optional overrides for start/end styling in multi-fragment containers
 *
 * @example
 * ```typescript
 * const container = doc.createElement('div');
 * container.classList.add(CLASS_NAMES.fragment);
 * applySdtContainerStyling(doc, container, block.attrs?.sdt, block.attrs?.containerSdt);
 * // Container now has SDT styling if applicable
 * ```
 */
export function applySdtContainerStyling(
  doc: Document,
  container: HTMLElement,
  sdt: SdtMetadata | null | undefined,
  containerSdt?: SdtMetadata | null | undefined,
  boundaryOptions?: SdtBoundaryOptions,
): void {
  let config = getSdtContainerConfig(sdt);
  if (!config && containerSdt) {
    config = getSdtContainerConfig(containerSdt);
  }
  if (!config) return;

  const isStart = boundaryOptions?.isStart ?? config.isStart;
  const isEnd = boundaryOptions?.isEnd ?? config.isEnd;

  container.classList.add(config.className);
  container.dataset.sdtContainerStart = String(isStart);
  container.dataset.sdtContainerEnd = String(isEnd);
  container.style.overflow = 'visible'; // Allow label to show above

  if (isStructuredContentMetadata(sdt)) {
    container.dataset.lockMode = sdt.lockMode || 'unlocked';
  } else if (isStructuredContentMetadata(containerSdt)) {
    container.dataset.lockMode = containerSdt.lockMode || 'unlocked';
  }

  if (boundaryOptions?.widthOverride != null) {
    container.style.width = `${boundaryOptions.widthOverride}px`;
  }

  if (boundaryOptions?.paddingBottomOverride != null && boundaryOptions.paddingBottomOverride > 0) {
    container.style.paddingBottom = `${boundaryOptions.paddingBottomOverride}px`;
  }

  const shouldShowLabel = boundaryOptions?.showLabel ?? isStart;

  if (shouldShowLabel) {
    const labelEl = doc.createElement('div');
    labelEl.className = config.labelClassName;
    const labelText = doc.createElement('span');
    labelText.textContent = config.labelText;
    labelEl.appendChild(labelText);
    container.appendChild(labelEl);
  }
}

/**
 * Checks whether a fragment element needs rebuilding due to SDT boundary changes.
 *
 * Handles two cases:
 * 1. Element was in an SDT but no longer is (stale attributes need removal)
 * 2. Element's start/end boundary flags don't match expected values
 */
export function shouldRebuildForSdtBoundary(element: HTMLElement, boundary: SdtBoundaryOptions | undefined): boolean {
  if (!boundary) {
    // Rebuild if element has stale SDT container attributes that should be removed
    return element.dataset.sdtContainerStart !== undefined;
  }
  const startAttr = element.dataset.sdtContainerStart;
  const endAttr = element.dataset.sdtContainerEnd;
  const expectedStart = String(boundary.isStart ?? true);
  const expectedEnd = String(boundary.isEnd ?? true);
  if (startAttr === undefined || endAttr === undefined) {
    return true;
  }
  return startAttr !== expectedStart || endAttr !== expectedEnd;
}
