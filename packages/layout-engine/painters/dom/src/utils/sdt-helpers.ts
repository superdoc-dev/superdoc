/**
 * SDT Helper Utilities
 *
 * Provides type guards and helper functions for working with SDT (Structured Document Tag) metadata
 * in the DOM painter. These utilities ensure type-safe access to SDT properties and reduce code
 * duplication across rendering logic.
 */

import type { SdtMetadata } from '@superdoc/contracts';

/**
 * Type guard for StructuredContentMetadata with specific properties.
 *
 * Validates that the metadata object has the expected structure for structured content
 * and narrows the type to allow safe property access.
 *
 * @param sdt - The SDT metadata to check
 * @returns True if the metadata is a structured content object with valid properties
 *
 * @example
 * ```typescript
 * if (isStructuredContentMetadata(block.attrs?.sdt)) {
 *   console.log(sdt.alias); // Type-safe access
 * }
 * ```
 */
export function isStructuredContentMetadata(
  sdt: SdtMetadata | null | undefined,
): sdt is { type: 'structuredContent'; scope: 'inline' | 'block'; alias?: string | null } {
  return (
    sdt !== null && sdt !== undefined && typeof sdt === 'object' && 'type' in sdt && sdt.type === 'structuredContent'
  );
}

/**
 * Type guard for DocumentSectionMetadata with specific properties.
 *
 * Validates that the metadata object has the expected structure for document sections
 * and narrows the type to allow safe property access.
 *
 * @param sdt - The SDT metadata to check
 * @returns True if the metadata is a document section object with valid properties
 *
 * @example
 * ```typescript
 * if (isDocumentSectionMetadata(block.attrs?.sdt)) {
 *   console.log(sdt.title); // Type-safe access
 * }
 * ```
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
 * Return the SDT metadata that should drive container styling.
 *
 * Prefers the primary `sdt` when it resolves to a container type, otherwise
 * falls back to `containerSdt` (e.g., docPart paragraphs inside a documentSection).
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
 * Returns a stable key for a block-level SDT container, or null if unavailable.
 *
 * The key is used to detect consecutive fragments that belong to the same SDT.
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
  // Try primary sdt first, fall back to containerSdt
  let config = getSdtContainerConfig(sdt);
  if (!config && containerSdt) {
    config = getSdtContainerConfig(containerSdt);
  }
  if (!config) return;

  const isStart = boundaryOptions?.isStart ?? config.isStart;
  const isEnd = boundaryOptions?.isEnd ?? config.isEnd;

  // Apply container class and data attributes
  container.classList.add(config.className);
  container.dataset.sdtContainerStart = String(isStart);
  container.dataset.sdtContainerEnd = String(isEnd);
  container.style.overflow = 'visible'; // Allow label to show above

  if (boundaryOptions?.widthOverride != null) {
    container.style.width = `${boundaryOptions.widthOverride}px`;
  }

  // Only create label on the first fragment of a multi-fragment container
  if (isStart) {
    const labelEl = doc.createElement('div');
    labelEl.className = config.labelClassName;
    const labelText = doc.createElement('span');
    labelText.textContent = config.labelText;
    labelEl.appendChild(labelText);
    container.appendChild(labelEl);
  }
}
