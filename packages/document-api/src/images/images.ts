import type { MutationOptions } from '../types/index.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  CreateImageInput,
  CreateImageResult,
  ImagesListInput,
  ImagesListResult,
  ImagesGetInput,
  ImageSummary,
  ImagesDeleteInput,
  ImagesMutationResult,
  MoveImageInput,
  ConvertToInlineInput,
  ConvertToFloatingInput,
  SetSizeInput,
  SetWrapTypeInput,
  SetWrapSideInput,
  SetWrapDistancesInput,
  SetPositionInput,
  SetAnchorOptionsInput,
  SetZOrderInput,
} from './images.types.js';
import { isUnsignedInt32, Z_ORDER_RELATIVE_HEIGHT_MAX, Z_ORDER_RELATIVE_HEIGHT_MIN } from './z-order.js';

// ---------------------------------------------------------------------------
// Valid value sets
// ---------------------------------------------------------------------------

const VALID_WRAP_TYPES = new Set(['Inline', 'None', 'Square', 'Tight', 'Through', 'TopAndBottom']);
const VALID_WRAP_SIDES = new Set(['bothSides', 'left', 'right', 'largest']);
const VALID_IMAGE_SIZE_UNITS = new Set(['px', 'pt', 'twip']);

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface ImagesAdapter {
  list(input: ImagesListInput): ImagesListResult;
  get(input: ImagesGetInput): ImageSummary;
  delete(input: ImagesDeleteInput, options?: MutationOptions): ImagesMutationResult;
  move(input: MoveImageInput, options?: MutationOptions): ImagesMutationResult;
  convertToInline(input: ConvertToInlineInput, options?: MutationOptions): ImagesMutationResult;
  convertToFloating(input: ConvertToFloatingInput, options?: MutationOptions): ImagesMutationResult;
  setSize(input: SetSizeInput, options?: MutationOptions): ImagesMutationResult;
  setWrapType(input: SetWrapTypeInput, options?: MutationOptions): ImagesMutationResult;
  setWrapSide(input: SetWrapSideInput, options?: MutationOptions): ImagesMutationResult;
  setWrapDistances(input: SetWrapDistancesInput, options?: MutationOptions): ImagesMutationResult;
  setPosition(input: SetPositionInput, options?: MutationOptions): ImagesMutationResult;
  setAnchorOptions(input: SetAnchorOptionsInput, options?: MutationOptions): ImagesMutationResult;
  setZOrder(input: SetZOrderInput, options?: MutationOptions): ImagesMutationResult;
}

export type ImagesApi = ImagesAdapter;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${field} must be a non-empty string.`, { field });
  }
}

function requireImageId(input: { imageId?: unknown }): void {
  requireString(input?.imageId, 'imageId');
}

function requireFinitePositiveNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${field} must be a finite positive number.`, {
      field,
      value,
    });
  }
}

function requireUnsignedInt32(value: unknown, field: string): asserts value is number {
  if (!isUnsignedInt32(value)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `${field} must be an unsigned 32-bit integer (${Z_ORDER_RELATIVE_HEIGHT_MIN}..${Z_ORDER_RELATIVE_HEIGHT_MAX}).`,
      {
        field,
        value,
        minimum: Z_ORDER_RELATIVE_HEIGHT_MIN,
        maximum: Z_ORDER_RELATIVE_HEIGHT_MAX,
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Execute functions
// ---------------------------------------------------------------------------

export function executeImagesList(adapter: ImagesAdapter, input: ImagesListInput): ImagesListResult {
  return adapter.list(input ?? {});
}

export function executeImagesGet(adapter: ImagesAdapter, input: ImagesGetInput): ImageSummary {
  requireImageId(input);
  return adapter.get(input);
}

export function executeImagesDelete(
  adapter: ImagesAdapter,
  input: ImagesDeleteInput,
  options?: MutationOptions,
): ImagesMutationResult {
  requireImageId(input);
  return adapter.delete(input, options);
}

export function executeImagesMove(
  adapter: ImagesAdapter,
  input: MoveImageInput,
  options?: MutationOptions,
): ImagesMutationResult {
  requireImageId(input);
  if (!input.to) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'images.move requires a "to" location.', { field: 'to' });
  }
  return adapter.move(input, options);
}

export function executeImagesConvertToInline(
  adapter: ImagesAdapter,
  input: ConvertToInlineInput,
  options?: MutationOptions,
): ImagesMutationResult {
  requireImageId(input);
  return adapter.convertToInline(input, options);
}

export function executeImagesConvertToFloating(
  adapter: ImagesAdapter,
  input: ConvertToFloatingInput,
  options?: MutationOptions,
): ImagesMutationResult {
  requireImageId(input);
  return adapter.convertToFloating(input, options);
}

export function executeImagesSetSize(
  adapter: ImagesAdapter,
  input: SetSizeInput,
  options?: MutationOptions,
): ImagesMutationResult {
  requireImageId(input);
  if (!input.size || typeof input.size !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'images.setSize requires a "size" object.', {
      field: 'size',
    });
  }

  requireFinitePositiveNumber(input.size.width, 'size.width');
  requireFinitePositiveNumber(input.size.height, 'size.height');

  if (input.size.unit !== undefined && !VALID_IMAGE_SIZE_UNITS.has(input.size.unit)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'size.unit must be one of: px, pt, twip.', {
      field: 'size.unit',
      allowed: [...VALID_IMAGE_SIZE_UNITS],
    });
  }

  return adapter.setSize(input, options);
}

export function executeImagesSetWrapType(
  adapter: ImagesAdapter,
  input: SetWrapTypeInput,
  options?: MutationOptions,
): ImagesMutationResult {
  requireImageId(input);
  if (!VALID_WRAP_TYPES.has(input.type)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `Invalid wrap type: "${input.type}".`, {
      field: 'type',
      allowed: [...VALID_WRAP_TYPES],
    });
  }
  return adapter.setWrapType(input, options);
}

export function executeImagesSetWrapSide(
  adapter: ImagesAdapter,
  input: SetWrapSideInput,
  options?: MutationOptions,
): ImagesMutationResult {
  requireImageId(input);
  if (!VALID_WRAP_SIDES.has(input.side)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `Invalid wrap side: "${input.side}".`, {
      field: 'side',
      allowed: [...VALID_WRAP_SIDES],
    });
  }
  return adapter.setWrapSide(input, options);
}

export function executeImagesSetWrapDistances(
  adapter: ImagesAdapter,
  input: SetWrapDistancesInput,
  options?: MutationOptions,
): ImagesMutationResult {
  requireImageId(input);
  if (!input.distances || typeof input.distances !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'images.setWrapDistances requires a "distances" object.', {
      field: 'distances',
    });
  }
  return adapter.setWrapDistances(input, options);
}

export function executeImagesSetPosition(
  adapter: ImagesAdapter,
  input: SetPositionInput,
  options?: MutationOptions,
): ImagesMutationResult {
  requireImageId(input);
  if (!input.position || typeof input.position !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'images.setPosition requires a "position" object.', {
      field: 'position',
    });
  }
  return adapter.setPosition(input, options);
}

export function executeImagesSetAnchorOptions(
  adapter: ImagesAdapter,
  input: SetAnchorOptionsInput,
  options?: MutationOptions,
): ImagesMutationResult {
  requireImageId(input);
  if (!input.options || typeof input.options !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'images.setAnchorOptions requires an "options" object.', {
      field: 'options',
    });
  }
  return adapter.setAnchorOptions(input, options);
}

export function executeImagesSetZOrder(
  adapter: ImagesAdapter,
  input: SetZOrderInput,
  options?: MutationOptions,
): ImagesMutationResult {
  requireImageId(input);
  if (!input.zOrder || typeof input.zOrder !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'images.setZOrder requires a "zOrder" object.', {
      field: 'zOrder',
    });
  }
  requireUnsignedInt32(input.zOrder.relativeHeight, 'zOrder.relativeHeight');
  return adapter.setZOrder(input, options);
}

// ---------------------------------------------------------------------------
// Create image execute (lives here alongside images domain)
// ---------------------------------------------------------------------------

export interface CreateImageAdapter {
  image(input: CreateImageInput, options?: MutationOptions): CreateImageResult;
}

export function executeCreateImage(
  adapter: CreateImageAdapter,
  input: CreateImageInput,
  options?: MutationOptions,
): CreateImageResult {
  requireString(input?.src, 'src');
  return adapter.image(input, options);
}
