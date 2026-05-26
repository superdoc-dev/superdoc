import type { SdtMetadata } from '@superdoc/contracts';

const SDT_DATASET_KEYS = [
  'sdtType',
  'sdtId',
  'sdtFieldId',
  'sdtFieldType',
  'sdtFieldVariant',
  'sdtFieldVisibility',
  'sdtFieldHidden',
  'sdtFieldLocked',
  'sdtScope',
  'sdtTag',
  'sdtAlias',
  'lockMode',
  'sdtSectionTitle',
  'sdtSectionType',
  'sdtSectionLocked',
  'sdtDocpartGallery',
  'sdtDocpartId',
  'sdtDocpartInstruction',
] as const;

const setDatasetString = (el: HTMLElement, key: string, value: string | null | undefined): void => {
  if (value) {
    el.dataset[key] = value;
  }
};

const setDatasetBoolean = (el: HTMLElement, key: string, value: boolean | null | undefined): void => {
  if (value != null) {
    el.dataset[key] = String(value);
  }
};

export const clearSdtDataset = (el: HTMLElement): void => {
  SDT_DATASET_KEYS.forEach((key) => {
    delete el.dataset[key];
  });
};

export const applySdtDataset = (el: HTMLElement | null, metadata?: SdtMetadata | null): void => {
  if (!el?.dataset) return;
  clearSdtDataset(el);
  if (!metadata) return;

  el.dataset.sdtType = metadata.type;

  if ('id' in metadata && metadata.id != null) {
    el.dataset.sdtId = String(metadata.id);
  }

  if (metadata.type === 'fieldAnnotation') {
    setDatasetString(el, 'sdtFieldId', metadata.fieldId);
    setDatasetString(el, 'sdtFieldType', metadata.fieldType);
    setDatasetString(el, 'sdtFieldVariant', metadata.variant);
    setDatasetString(el, 'sdtFieldVisibility', metadata.visibility);
    setDatasetBoolean(el, 'sdtFieldHidden', metadata.hidden);
    setDatasetBoolean(el, 'sdtFieldLocked', metadata.isLocked);
  } else if (metadata.type === 'structuredContent') {
    setDatasetString(el, 'sdtScope', metadata.scope);
    setDatasetString(el, 'sdtTag', metadata.tag);
    setDatasetString(el, 'sdtAlias', metadata.alias);
    // Always set lockMode so CSS can target all structured-content SDTs uniformly.
    setDatasetString(el, 'lockMode', metadata.lockMode || 'unlocked');
  } else if (metadata.type === 'documentSection') {
    setDatasetString(el, 'sdtSectionTitle', metadata.title);
    setDatasetString(el, 'sdtSectionType', metadata.sectionType);
    setDatasetBoolean(el, 'sdtSectionLocked', metadata.isLocked);
  } else if (metadata.type === 'docPartObject') {
    setDatasetString(el, 'sdtDocpartGallery', metadata.gallery);
    setDatasetString(el, 'sdtDocpartId', metadata.uniqueId);
    setDatasetString(el, 'sdtDocpartInstruction', metadata.instruction);
  }
};

export const applyContainerSdtDataset = (el: HTMLElement | null, metadata?: SdtMetadata | null): void => {
  if (!el?.dataset) return;
  if (!metadata) return;

  el.dataset.sdtContainerType = metadata.type;

  if ('id' in metadata && metadata.id != null) {
    el.dataset.sdtContainerId = String(metadata.id);
  }

  if (metadata.type === 'documentSection') {
    setDatasetString(el, 'sdtContainerSectionTitle', metadata.title);
    setDatasetString(el, 'sdtContainerSectionType', metadata.sectionType);
    setDatasetBoolean(el, 'sdtContainerSectionLocked', metadata.isLocked);
  }
};

export const getSdtMetadataId = (metadata: SdtMetadata | null | undefined): string => {
  if (!metadata) return '';
  if ('id' in metadata && metadata.id != null) {
    return String(metadata.id);
  }
  return '';
};

export const getSdtMetadataLockMode = (metadata: SdtMetadata | null | undefined): string => {
  if (!metadata) return '';
  return metadata.type === 'structuredContent' ? (metadata.lockMode ?? '') : '';
};

export const getSdtMetadataVersion = (metadata: SdtMetadata | null | undefined): string => {
  if (!metadata) return '';
  return [metadata.type, getSdtMetadataLockMode(metadata), getSdtMetadataId(metadata)].join(':');
};
