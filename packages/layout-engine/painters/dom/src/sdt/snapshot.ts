import { DOM_CLASS_NAMES } from '../constants.js';
import type { LayoutSourceIdentity } from '@superdoc/contracts';

export type PaintSnapshotStructuredContentBlockEntity = {
  element: HTMLElement;
  pageIndex: number;
  sdtId: string;
  pmStart?: number;
  pmEnd?: number;
  layoutSourceIdentity?: LayoutSourceIdentity;
};

export type PaintSnapshotStructuredContentInlineEntity = {
  element: HTMLElement;
  pageIndex: number;
  sdtId: string;
  pmStart?: number;
  pmEnd?: number;
  layoutSourceIdentity?: LayoutSourceIdentity;
};

export type SdtSnapshotEntities = {
  structuredContentBlocks: PaintSnapshotStructuredContentBlockEntity[];
  structuredContentInlines: PaintSnapshotStructuredContentInlineEntity[];
};

type CollectSdtSnapshotEntitiesOptions = {
  resolvePageIndex: (element: HTMLElement) => number | null;
  readDatasetNumber: (value: string | null | undefined) => number | null;
  readLayoutSourceIdentity?: (element: HTMLElement) => LayoutSourceIdentity | undefined;
  compactObject: <T extends Record<string, unknown>>(input: T) => T;
};

export const collectSdtSnapshotEntitiesFromDomRoot = (
  rootEl: HTMLElement,
  options: CollectSdtSnapshotEntitiesOptions,
): SdtSnapshotEntities => {
  const entities: SdtSnapshotEntities = {
    structuredContentBlocks: [],
    structuredContentInlines: [],
  };

  const blockSdtElements = Array.from(
    rootEl.querySelectorAll<HTMLElement>(`.${DOM_CLASS_NAMES.BLOCK_SDT}[data-sdt-id]`),
  );
  for (const element of blockSdtElements) {
    const pageIndex = options.resolvePageIndex(element);
    const sdtId = element.dataset.sdtId;
    if (pageIndex == null || !sdtId) continue;

    entities.structuredContentBlocks.push(
      options.compactObject({
        element,
        pageIndex,
        sdtId,
        pmStart: options.readDatasetNumber(element.dataset.pmStart),
        pmEnd: options.readDatasetNumber(element.dataset.pmEnd),
        layoutSourceIdentity: options.readLayoutSourceIdentity?.(element),
      }) as PaintSnapshotStructuredContentBlockEntity,
    );
  }

  const inlineSdtElements = Array.from(
    rootEl.querySelectorAll<HTMLElement>(`.${DOM_CLASS_NAMES.INLINE_SDT_WRAPPER}[data-sdt-id]`),
  );
  for (const element of inlineSdtElements) {
    const pageIndex = options.resolvePageIndex(element);
    const sdtId = element.dataset.sdtId;
    if (pageIndex == null || !sdtId) continue;

    entities.structuredContentInlines.push(
      options.compactObject({
        element,
        pageIndex,
        sdtId,
        pmStart: options.readDatasetNumber(element.dataset.pmStart),
        pmEnd: options.readDatasetNumber(element.dataset.pmEnd),
        layoutSourceIdentity: options.readLayoutSourceIdentity?.(element),
      }) as PaintSnapshotStructuredContentInlineEntity,
    );
  }

  return entities;
};
