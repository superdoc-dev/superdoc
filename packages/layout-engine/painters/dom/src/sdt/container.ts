import type { SdtMetadata, StructuredContentMetadata } from '@superdoc/contracts';
export {
  getSdtContainerKey,
  getSdtContainerKeyForBlock,
  getSdtContainerMetadata,
  hasExplicitSdtContainerKey,
} from '@superdoc/contracts';
import { getSdtContainerKey, getSdtContainerMetadata } from '@superdoc/contracts';
import { DOM_CLASS_NAMES } from '../constants.js';

export type SdtContainerConfig = {
  className: string;
  labelText: string;
  labelClassName: string;
  isStart: boolean;
  isEnd: boolean;
} | null;

export type SdtBoundaryOptions = {
  isStart?: boolean;
  isEnd?: boolean;
  widthOverride?: number;
  paddingBottomOverride?: number;
  showLabel?: boolean;
};

export type SdtAncestorOptions = {
  ancestorContainerKey?: string | null;
  ancestorContainerSdt?: SdtMetadata | null;
  ancestorContainerKeys?: readonly (string | null | undefined)[];
  ancestorContainerSdts?: readonly (SdtMetadata | null | undefined)[];
};

export function isStructuredContentMetadata(sdt: SdtMetadata | null | undefined): sdt is StructuredContentMetadata {
  return (
    sdt !== null && sdt !== undefined && typeof sdt === 'object' && 'type' in sdt && sdt.type === 'structuredContent'
  );
}

export function isDocumentSectionMetadata(
  sdt: SdtMetadata | null | undefined,
): sdt is { type: 'documentSection'; title?: string | null } {
  return (
    sdt !== null && sdt !== undefined && typeof sdt === 'object' && 'type' in sdt && sdt.type === 'documentSection'
  );
}

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
      labelClassName: `${DOM_CLASS_NAMES.BLOCK_SDT_LABEL} superdoc-structured-content-block__label`,
      isStart: true,
      isEnd: true,
    };
  }

  return null;
}

export function shouldRenderSdtContainerChrome(
  sdt?: SdtMetadata | null,
  containerSdt?: SdtMetadata | null,
  options?: SdtAncestorOptions,
): boolean {
  const metadata = getSdtContainerMetadata(sdt, containerSdt);
  if (!metadata) return false;
  if (isStructuredContentMetadata(metadata) && metadata.appearance === 'hidden') {
    return false;
  }

  const containerKey = getSdtContainerKey(sdt, containerSdt);
  const ancestorKeys = [options?.ancestorContainerKey, ...(options?.ancestorContainerKeys ?? [])];
  if (containerKey && ancestorKeys.includes(containerKey)) {
    return false;
  }

  const ancestorSdts = [options?.ancestorContainerSdt, ...(options?.ancestorContainerSdts ?? [])];
  if (ancestorSdts.includes(metadata)) {
    return false;
  }

  return true;
}

export function getSdtSiblingBoundaries(
  containerKeys: readonly (string | null)[],
): Array<SdtBoundaryOptions | undefined> {
  return containerKeys.map((key, index): SdtBoundaryOptions | undefined => {
    if (!key) return undefined;
    const prev = index > 0 ? containerKeys[index - 1] : null;
    const next = index < containerKeys.length - 1 ? containerKeys[index + 1] : null;
    return { isStart: key !== prev, isEnd: key !== next };
  });
}

export function applySdtContainerChrome(
  doc: Document,
  container: HTMLElement,
  sdt: SdtMetadata | null | undefined,
  containerSdt?: SdtMetadata | null | undefined,
  boundaryOptions?: SdtBoundaryOptions,
  options?: SdtAncestorOptions,
): boolean {
  if (!shouldRenderSdtContainerChrome(sdt, containerSdt, options)) return false;

  const metadata = getSdtContainerMetadata(sdt, containerSdt);
  const config = getSdtContainerConfig(metadata);
  if (!config) return false;

  const isStart = boundaryOptions?.isStart ?? config.isStart;
  const isEnd = boundaryOptions?.isEnd ?? config.isEnd;

  container.classList.add(config.className);
  container.dataset.sdtContainerStart = String(isStart);
  container.dataset.sdtContainerEnd = String(isEnd);
  container.style.overflow = 'visible';

  if (isStructuredContentMetadata(metadata)) {
    container.dataset.lockMode = metadata.lockMode || 'unlocked';
  }

  if (boundaryOptions?.widthOverride != null) {
    container.style.width = `${boundaryOptions.widthOverride}px`;
  }

  if (boundaryOptions?.paddingBottomOverride != null && boundaryOptions.paddingBottomOverride > 0) {
    container.style.paddingBottom = `${boundaryOptions.paddingBottomOverride}px`;
    container.style.setProperty('--sd-sdt-chrome-bottom-extension', `${boundaryOptions.paddingBottomOverride}px`);
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

  return true;
}

export function shouldRebuildForSdtBoundary(element: HTMLElement, boundary: SdtBoundaryOptions | undefined): boolean {
  if (!boundary) {
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
