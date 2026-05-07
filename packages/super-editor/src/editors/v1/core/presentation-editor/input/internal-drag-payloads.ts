// @todo: Eventually some of these utility helpers should be extracted
// to a more general package/file for use across multiple editor implementations
// I want to avoid scope creep in these initial changes
export const INTERNAL_OBJECT_MIME_TYPE = 'application/x-superdoc-internal-object';

export type InternalDragSourceKind = 'structuredContent' | 'existingImage';

export type StructuredContentDragPayload = {
  kind: 'structuredContent';
  nodeType: 'structuredContent' | 'structuredContentBlock';
  sdtId: string;
  label: string;
  sourceStart: number;
  sourceEnd: number;
  lockMode: string;
};

export type ExistingImageDragPayload = {
  kind: 'existingImage';
  imageKind: 'inline' | 'block';
  nodeType: string;
  sourceStart: number;
  sourceEnd: number;
  blockId?: string;
  label: string;
};

export type InternalObjectDragPayload = StructuredContentDragPayload | ExistingImageDragPayload;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseInternalObjectDragPayload(event: DragEvent): InternalObjectDragPayload | null {
  const raw = event.dataTransfer?.getData(INTERNAL_OBJECT_MIME_TYPE);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStructuredContentPayload(parsed) || isExistingImagePayload(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function buildStructuredContentDragPayload(sourceElement: HTMLElement): StructuredContentDragPayload | null {
  const dataset = sourceElement.dataset;
  const sdtId = readString(dataset.sdtId);
  const sourceStart = readNumber(dataset.pmStart);
  const sourceEnd = readNumber(dataset.pmEnd);
  if (!sdtId || sourceStart == null || sourceEnd == null) return null;

  return {
    kind: 'structuredContent',
    nodeType: dataset.nodeType === 'structuredContentBlock' ? 'structuredContentBlock' : 'structuredContent',
    sdtId,
    label: readString(dataset.displayLabel) ?? sourceElement.textContent?.trim() ?? 'Structured content',
    sourceStart,
    sourceEnd,
    lockMode: readString(dataset.lockMode) ?? 'unlocked',
  };
}

export function buildExistingImageDragPayload(sourceElement: HTMLElement): ExistingImageDragPayload | null {
  const dataset = sourceElement.dataset;
  const sourceStart = readNumber(dataset.pmStart);
  const sourceEnd = readNumber(dataset.pmEnd);
  if (sourceStart == null || sourceEnd == null) return null;

  return {
    kind: 'existingImage',
    imageKind: dataset.imageKind === 'block' ? 'block' : 'inline',
    nodeType: dataset.nodeType ?? 'image',
    sourceStart,
    sourceEnd,
    blockId:
      readString(dataset.blockId) ??
      readString(sourceElement.getAttribute('data-block-id')) ??
      readString(sourceElement.getAttribute('data-sd-block-id')) ??
      undefined,
    label: readString(dataset.displayLabel) ?? sourceElement.getAttribute('aria-label') ?? 'Image',
  };
}

export function buildInternalObjectDragPayload(sourceElement: HTMLElement): InternalObjectDragPayload | null {
  const sourceKind = sourceElement.dataset.dragSourceKind;
  if (sourceKind === 'structuredContent') {
    return buildStructuredContentDragPayload(sourceElement);
  }
  if (sourceKind === 'existingImage') {
    return buildExistingImageDragPayload(sourceElement);
  }
  return null;
}

export function hasInternalObjectDragPayload(event: DragEvent): boolean {
  return parseInternalObjectDragPayload(event) !== null;
}

function isStructuredContentPayload(value: unknown): value is StructuredContentDragPayload {
  if (!isObject(value)) return false;

  return (
    value.kind === 'structuredContent' &&
    (value.nodeType === 'structuredContent' || value.nodeType === 'structuredContentBlock') &&
    typeof value.sdtId === 'string' &&
    typeof value.label === 'string' &&
    isFiniteNumber(value.sourceStart) &&
    isFiniteNumber(value.sourceEnd) &&
    typeof value.lockMode === 'string'
  );
}

function isExistingImagePayload(value: unknown): value is ExistingImageDragPayload {
  if (!isObject(value)) return false;

  return (
    value.kind === 'existingImage' &&
    (value.imageKind === 'inline' || value.imageKind === 'block') &&
    typeof value.nodeType === 'string' &&
    isFiniteNumber(value.sourceStart) &&
    isFiniteNumber(value.sourceEnd) &&
    typeof value.label === 'string' &&
    (value.blockId === undefined || typeof value.blockId === 'string')
  );
}
