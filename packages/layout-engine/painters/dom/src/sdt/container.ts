import type { FlowBlock, SdtMetadata, StructuredContentLockMode } from '@superdoc/contracts';

type SdtBlockCandidate = Pick<FlowBlock, 'kind'> & {
  attrs?: {
    sdt?: SdtMetadata | null;
    containerSdt?: SdtMetadata | null;
  } | null;
};

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
      labelClassName: 'superdoc-structured-content__label superdoc-structured-content-block__label',
      isStart: true,
      isEnd: true,
    };
  }

  return null;
}

export function getSdtContainerMetadata(
  sdt?: SdtMetadata | null,
  containerSdt?: SdtMetadata | null,
): SdtMetadata | null {
  if (getSdtContainerConfig(sdt)) return sdt ?? null;
  if (getSdtContainerConfig(containerSdt)) return containerSdt ?? null;
  return null;
}

export function getSdtContainerKey(sdt?: SdtMetadata | null, containerSdt?: SdtMetadata | null): string | null {
  const metadata = getSdtContainerMetadata(sdt, containerSdt);
  if (!metadata) return null;

  if (metadata.type === 'structuredContent') {
    if (metadata.scope !== 'block') return null;
    if (!metadata.id) return null;
    return `structuredContent:${metadata.id}`;
  }

  if (metadata.type === 'documentSection') {
    const sectionId = metadata.id ?? metadata.sdBlockId;
    if (!sectionId) return null;
    return `documentSection:${sectionId}`;
  }

  return null;
}

export function getSdtContainerKeyForBlock(block?: SdtBlockCandidate | null): string | null {
  if (!block || (block.kind !== 'paragraph' && block.kind !== 'table')) return null;
  return getSdtContainerKey(block.attrs?.sdt, block.attrs?.containerSdt);
}

export function shouldRenderSdtContainerChrome(
  sdt?: SdtMetadata | null,
  containerSdt?: SdtMetadata | null,
  options?: {
    ancestorContainerKey?: string | null;
    containerKey?: string | null;
  },
): boolean {
  const config = getSdtContainerConfig(sdt) ?? getSdtContainerConfig(containerSdt);
  if (!config) return false;

  const containerKey = options?.containerKey ?? getSdtContainerKey(sdt, containerSdt);
  return !(containerKey && options?.ancestorContainerKey && containerKey === options.ancestorContainerKey);
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
  options?: { ancestorContainerKey?: string | null; containerKey?: string | null },
): void {
  if (!shouldRenderSdtContainerChrome(sdt, containerSdt, options)) return;

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
  container.style.overflow = 'visible';

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
