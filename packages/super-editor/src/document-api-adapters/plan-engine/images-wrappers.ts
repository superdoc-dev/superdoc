/**
 * Plan-engine wrappers for all images.* operations.
 *
 * All image attribute mutations use `tr.setNodeMarkup` at the resolved image
 * position — no dedicated editor commands exist for size, position, anchor options, or z-order.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  MutationOptions,
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
  ImageAddress,
  ImageWrapType,
  ImageCreateLocation,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import {
  collectImages,
  findImageById,
  requireFloatingPlacement,
  type ImageCandidate,
} from '../helpers/image-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { resolveBlockInsertionPos } from './create-insertion.js';
import { readImageDimensionsFromDataUri } from '../../core/super-converter/image-dimensions.js';
import { generateUniqueDocPrId } from '../../extensions/image/imageHelpers/startImageUpload.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ALLOWED_WRAP_ATTRS: Record<string, readonly string[]> = {
  None: ['behindDoc'],
  Square: ['wrapText', 'distTop', 'distBottom', 'distLeft', 'distRight'],
  Through: ['wrapText', 'distTop', 'distBottom', 'distLeft', 'distRight', 'polygon'],
  Tight: ['wrapText', 'distTop', 'distBottom', 'distLeft', 'distRight', 'polygon'],
  TopAndBottom: ['distTop', 'distBottom'],
  Inline: [],
};

const WRAP_TYPES_SUPPORTING_SIDE = new Set<string>(['Square', 'Tight', 'Through']);
const WRAP_TYPES_SUPPORTING_DISTANCES = new Set<string>(['Square', 'Tight', 'Through', 'TopAndBottom']);
const RELATIVE_HEIGHT_MIN = 0;
const RELATIVE_HEIGHT_MAX = 4_294_967_295;

function buildImageAddress(candidate: ImageCandidate): ImageAddress {
  return {
    kind: 'inline',
    nodeType: 'image',
    nodeId: candidate.sdImageId,
    placement: candidate.placement,
  };
}

function buildSuccessResult(candidate: ImageCandidate): ImagesMutationResult {
  return { success: true, image: buildImageAddress(candidate) };
}

function buildNoOpResult(message: string): ImagesMutationResult {
  return { success: false, failure: { code: 'NO_OP', message } };
}

function buildImageSummary(candidate: ImageCandidate): ImageSummary {
  const attrs = candidate.node.attrs;
  return {
    sdImageId: candidate.sdImageId,
    address: buildImageAddress(candidate),
    properties: {
      src: attrs.src ?? undefined,
      alt: attrs.alt ?? undefined,
      size: attrs.size ?? undefined,
      placement: candidate.placement,
      wrap: {
        type: (attrs.wrap?.type as ImageWrapType) ?? 'Inline',
        attrs: attrs.wrap?.attrs ?? undefined,
      },
      anchorData: attrs.anchorData ?? null,
      marginOffset: attrs.marginOffset ?? null,
      relativeHeight: attrs.relativeHeight ?? null,
    },
  };
}

function isUnsignedInt32(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= RELATIVE_HEIGHT_MIN && value <= RELATIVE_HEIGHT_MAX
  );
}

/**
 * Resolve an ImageCreateLocation to a numeric ProseMirror position.
 *
 * Reuses the same block-index infrastructure as create.paragraph / create.heading
 * so that `before` / `after` / `inParagraph` semantics are consistent.
 */
function resolveImageInsertPosition(editor: Editor, location: ImageCreateLocation): number {
  switch (location.kind) {
    case 'documentStart':
      return 0;
    case 'documentEnd':
      return editor.state.doc.content.size;
    case 'before':
    case 'after':
      return resolveBlockInsertionPos(editor, location.target.nodeId, location.kind);
    case 'inParagraph': {
      const pos = resolveBlockInsertionPos(editor, location.target.nodeId, 'before');
      // pos points to the start of the paragraph node; +1 enters the inline content.
      // Add any caller-supplied character offset within the paragraph text.
      return pos + 1 + (location.offset ?? 0);
    }
    default: {
      const _exhaustive: never = location;
      throw new DocumentApiAdapterError(
        'INVALID_TARGET',
        `Unknown image location kind: "${(location as { kind: string }).kind}".`,
      );
    }
  }
}

/** Strip wrap.attrs to only the keys allowed for the given wrap type. */
function filterWrapAttrs(type: string, attrs: Record<string, unknown>): Record<string, unknown> {
  const allowed = ALLOWED_WRAP_ATTRS[type] ?? [];
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in attrs) result[key] = attrs[key];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export function imagesListWrapper(editor: Editor, input: ImagesListInput): ImagesListResult {
  const allImages = collectImages(editor.state.doc);
  const offset = input.offset ?? 0;
  const limit = input.limit ?? allImages.length;
  const items = allImages.slice(offset, offset + limit).map(buildImageSummary);
  return { total: allImages.length, items };
}

export function imagesGetWrapper(editor: Editor, input: ImagesGetInput): ImageSummary {
  const image = findImageById(editor, input.imageId);
  return buildImageSummary(image);
}

// ---------------------------------------------------------------------------
// Create image
// ---------------------------------------------------------------------------

export function createImageWrapper(
  editor: Editor,
  input: CreateImageInput,
  options?: MutationOptions,
): CreateImageResult {
  rejectTrackedMode('create.image', options);

  if (typeof editor.commands.setImage !== 'function') {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'create.image requires the image extension (setImage command).',
    );
  }

  // -- Resolve image dimensions -------------------------------------------------
  let resolvedSize = input.size;

  if (isFinitePositive(resolvedSize?.width) && isFinitePositive(resolvedSize?.height)) {
    // Caller provided valid dimensions — use as-is.
  } else if (input.src?.startsWith('data:')) {
    const dims = readImageDimensionsFromDataUri(input.src);
    if (dims) {
      resolvedSize = dims;
    } else {
      return {
        success: false,
        failure: {
          code: 'INVALID_INPUT',
          message:
            'Image dimensions could not be determined. Provide explicit size.width and size.height, or use a data URI with a supported format (PNG, JPEG, GIF, BMP, WEBP).',
        },
      };
    }
  } else {
    return {
      success: false,
      failure: {
        code: 'INVALID_INPUT',
        message:
          'Image dimensions are required. Provide size.width and size.height (finite positive numbers), or use a data URI src so dimensions can be inferred.',
      },
    };
  }

  // -- Assign unique drawing ID -------------------------------------------------
  const drawingId = generateUniqueDocPrId(editor);

  const sdImageId = uuidv4();
  const insertPos = input.at ? resolveImageInsertPosition(editor, input.at) : null;

  if (options?.dryRun) {
    return {
      success: true,
      image: { kind: 'inline', nodeType: 'image', nodeId: sdImageId, placement: 'inline' },
    };
  }

  const receipt = executeDomainCommand(editor, () => {
    const attrs = {
      src: input.src,
      alt: input.alt,
      title: input.title,
      size: resolvedSize,
      sdImageId,
      id: drawingId,
    };

    if (insertPos !== null) {
      // Targeted insertion — insert at the resolved position.
      return Boolean(editor.commands.insertContentAt(insertPos, { type: 'image', attrs }));
    }

    // No location specified — insert at current selection via setImage.
    return Boolean(editor.commands.setImage(attrs));
  });

  const commandSucceeded = receipt.steps[0]?.effect === 'changed';
  if (!commandSucceeded) {
    return { success: false, failure: { code: 'INVALID_TARGET', message: 'Image could not be created.' } };
  }

  return {
    success: true,
    image: { kind: 'inline', nodeType: 'image', nodeId: sdImageId, placement: 'inline' },
  };
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// ---------------------------------------------------------------------------
// Delete image
// ---------------------------------------------------------------------------

export function imagesDeleteWrapper(
  editor: Editor,
  input: ImagesDeleteInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.delete', options);

  const image = findImageById(editor, input.imageId);

  if (options?.dryRun) {
    return buildSuccessResult(image);
  }

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.delete(pos, pos + node.nodeSize);
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) {
    return buildNoOpResult('Image deletion produced no change.');
  }

  return buildSuccessResult(image);
}

// ---------------------------------------------------------------------------
// Move image
// ---------------------------------------------------------------------------

export function imagesMoveWrapper(
  editor: Editor,
  input: MoveImageInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.move', options);

  const image = findImageById(editor, input.imageId);

  // Resolve target position BEFORE the mutation (and before dry-run bail-out)
  // so that invalid destinations are caught even in dry-run mode.
  const targetPos = resolveImageInsertPosition(editor, input.to);

  if (options?.dryRun) {
    return buildSuccessResult(image);
  }

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const attrs = { ...node.attrs };
    const tr = editor.state.tr;

    // Delete the source image first.
    tr.delete(pos, pos + node.nodeSize);

    // Map the pre-resolved target through the delete mapping so it remains
    // accurate after the deletion step shifts positions.
    const mappedPos = tr.mapping.map(targetPos);

    const imageNode = editor.state.schema.nodes.image.create(attrs);
    tr.insert(mappedPos, imageNode);

    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) {
    return { success: false, failure: { code: 'INVALID_TARGET', message: 'Image move produced no change.' } };
  }

  // Re-resolve after move
  const updated = findImageById(editor, input.imageId);
  return buildSuccessResult(updated);
}

// ---------------------------------------------------------------------------
// Convert placement
// ---------------------------------------------------------------------------

export function imagesConvertToInlineWrapper(
  editor: Editor,
  input: ConvertToInlineInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.convertToInline', options);

  const image = findImageById(editor, input.imageId);

  if (image.placement === 'inline') {
    return buildNoOpResult('Image is already inline.');
  }

  if (options?.dryRun) {
    return buildSuccessResult(image);
  }

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      isAnchor: false,
      wrap: { type: 'Inline' },
      anchorData: null,
      marginOffset: null,
      relativeHeight: null,
    });
    editor.dispatch(tr);
    return true;
  });

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) return buildNoOpResult('Convert to inline produced no change.');

  const updated = findImageById(editor, input.imageId);
  return buildSuccessResult(updated);
}

export function imagesConvertToFloatingWrapper(
  editor: Editor,
  input: ConvertToFloatingInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.convertToFloating', options);

  const image = findImageById(editor, input.imageId);

  if (image.placement === 'floating') {
    return buildNoOpResult('Image is already floating.');
  }

  if (options?.dryRun) {
    return buildSuccessResult(image);
  }

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      isAnchor: true,
      wrap: { type: 'Square', attrs: {} },
      anchorData: {
        hRelativeFrom: 'column',
        vRelativeFrom: 'paragraph',
      },
    });
    editor.dispatch(tr);
    return true;
  });

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) return buildNoOpResult('Convert to floating produced no change.');

  const updated = findImageById(editor, input.imageId);
  return buildSuccessResult(updated);
}

// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------

export function imagesSetSizeWrapper(
  editor: Editor,
  input: SetSizeInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setSize', options);

  if (!isFinitePositive(input.size?.width) || !isFinitePositive(input.size?.height)) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      'images.setSize requires size.width and size.height as finite positive numbers.',
    );
  }

  const image = findImageById(editor, input.imageId);
  const currentSize = image.node.attrs.size ?? {};
  const nextSize = {
    width: input.size.width,
    height: input.size.height,
    ...(input.size.unit !== undefined ? { unit: input.size.unit } : {}),
  };

  if (
    currentSize.width === nextSize.width &&
    currentSize.height === nextSize.height &&
    currentSize.unit === nextSize.unit
  ) {
    return buildNoOpResult(`Image size is already ${nextSize.width}x${nextSize.height}.`);
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      size: nextSize,
    });
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) return buildNoOpResult('Set image size produced no change.');

  const updated = findImageById(editor, input.imageId);
  return buildSuccessResult(updated);
}

// ---------------------------------------------------------------------------
// Wrap type
// ---------------------------------------------------------------------------

export function imagesSetWrapTypeWrapper(
  editor: Editor,
  input: SetWrapTypeInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setWrapType', options);

  const image = findImageById(editor, input.imageId);
  requireFloatingPlacement(image, 'images.setWrapType');

  const currentType = image.node.attrs.wrap?.type;
  if (currentType === input.type) {
    return buildNoOpResult(`Wrap type is already "${input.type}".`);
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    const existingAttrs = node.attrs.wrap?.attrs ?? {};
    const filteredAttrs = filterWrapAttrs(input.type, existingAttrs);
    const becomingInline = input.type === 'Inline';

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      wrap: { type: input.type, attrs: filteredAttrs },
      isAnchor: !becomingInline,
      // When transitioning to Inline, clear floating-only fields to stay
      // consistent with convertToInline and prevent stale anchor data.
      ...(becomingInline ? { anchorData: null, marginOffset: null, relativeHeight: null } : {}),
    });
    editor.dispatch(tr);
    return true;
  });

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) return buildNoOpResult('Set wrap type produced no change.');

  const updated = findImageById(editor, input.imageId);
  return buildSuccessResult(updated);
}

// ---------------------------------------------------------------------------
// Wrap side
// ---------------------------------------------------------------------------

export function imagesSetWrapSideWrapper(
  editor: Editor,
  input: SetWrapSideInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setWrapSide', options);

  const image = findImageById(editor, input.imageId);
  requireFloatingPlacement(image, 'images.setWrapSide');

  const currentWrapType = image.node.attrs.wrap?.type;
  if (!WRAP_TYPES_SUPPORTING_SIDE.has(currentWrapType)) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `images.setWrapSide is not valid for wrap type "${currentWrapType}".`,
      { wrapType: currentWrapType },
    );
  }

  const currentSide = image.node.attrs.wrap?.attrs?.wrapText;
  if (currentSide === input.side) {
    return buildNoOpResult(`Wrap side is already "${input.side}".`);
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      wrap: {
        ...node.attrs.wrap,
        attrs: { ...(node.attrs.wrap?.attrs ?? {}), wrapText: input.side },
      },
    });
    editor.dispatch(tr);
    return true;
  });

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) return buildNoOpResult('Set wrap side produced no change.');

  const updated = findImageById(editor, input.imageId);
  return buildSuccessResult(updated);
}

// ---------------------------------------------------------------------------
// Wrap distances
// ---------------------------------------------------------------------------

export function imagesSetWrapDistancesWrapper(
  editor: Editor,
  input: SetWrapDistancesInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setWrapDistances', options);

  const image = findImageById(editor, input.imageId);
  requireFloatingPlacement(image, 'images.setWrapDistances');

  const currentWrapType = image.node.attrs.wrap?.type;
  if (!WRAP_TYPES_SUPPORTING_DISTANCES.has(currentWrapType)) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `images.setWrapDistances is not valid for wrap type "${currentWrapType}".`,
      { wrapType: currentWrapType },
    );
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    const currentAttrs = node.attrs.wrap?.attrs ?? {};
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      wrap: {
        ...node.attrs.wrap,
        attrs: { ...currentAttrs, ...input.distances },
      },
    });
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) return buildNoOpResult('Set wrap distances produced no change.');

  const updated = findImageById(editor, input.imageId);
  return buildSuccessResult(updated);
}

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

export function imagesSetPositionWrapper(
  editor: Editor,
  input: SetPositionInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setPosition', options);

  const image = findImageById(editor, input.imageId);
  requireFloatingPlacement(image, 'images.setPosition');

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    const { position } = input;

    const newAnchorData = {
      ...(node.attrs.anchorData ?? {}),
      ...(position.hRelativeFrom !== undefined ? { hRelativeFrom: position.hRelativeFrom } : {}),
      ...(position.vRelativeFrom !== undefined ? { vRelativeFrom: position.vRelativeFrom } : {}),
      ...(position.alignH !== undefined ? { alignH: position.alignH } : {}),
      ...(position.alignV !== undefined ? { alignV: position.alignV } : {}),
    };

    const newMarginOffset = position.marginOffset
      ? { ...(node.attrs.marginOffset ?? {}), ...position.marginOffset }
      : node.attrs.marginOffset;

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      anchorData: newAnchorData,
      marginOffset: newMarginOffset,
    });
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) return buildNoOpResult('Set position produced no change.');

  const updated = findImageById(editor, input.imageId);
  return buildSuccessResult(updated);
}

// ---------------------------------------------------------------------------
// Anchor options
// ---------------------------------------------------------------------------

export function imagesSetAnchorOptionsWrapper(
  editor: Editor,
  input: SetAnchorOptionsInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setAnchorOptions', options);

  const image = findImageById(editor, input.imageId);
  requireFloatingPlacement(image, 'images.setAnchorOptions');

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    const { options: anchorOpts } = input;

    const currentOrigAttrs = node.attrs.originalAttributes ?? {};
    const updatedOrigAttrs = {
      ...currentOrigAttrs,
      ...(anchorOpts.behindDoc !== undefined ? { behindDoc: anchorOpts.behindDoc ? '1' : '0' } : {}),
      ...(anchorOpts.allowOverlap !== undefined ? { allowOverlap: anchorOpts.allowOverlap ? '1' : '0' } : {}),
      ...(anchorOpts.layoutInCell !== undefined ? { layoutInCell: anchorOpts.layoutInCell ? '1' : '0' } : {}),
      ...(anchorOpts.lockAnchor !== undefined ? { locked: anchorOpts.lockAnchor ? '1' : '0' } : {}),
    };

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      originalAttributes: updatedOrigAttrs,
      ...(anchorOpts.simplePos !== undefined ? { simplePos: anchorOpts.simplePos } : {}),
    });
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) return buildNoOpResult('Set anchor options produced no change.');

  const updated = findImageById(editor, input.imageId);
  return buildSuccessResult(updated);
}

// ---------------------------------------------------------------------------
// Z-order
// ---------------------------------------------------------------------------

export function imagesSetZOrderWrapper(
  editor: Editor,
  input: SetZOrderInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setZOrder', options);

  if (!isUnsignedInt32(input.zOrder?.relativeHeight)) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      `images.setZOrder requires zOrder.relativeHeight as an unsigned 32-bit integer (${RELATIVE_HEIGHT_MIN}..${RELATIVE_HEIGHT_MAX}).`,
    );
  }

  const image = findImageById(editor, input.imageId);
  requireFloatingPlacement(image, 'images.setZOrder');

  const currentHeight = image.node.attrs.relativeHeight;
  if (currentHeight === input.zOrder.relativeHeight) {
    return buildNoOpResult(`relativeHeight is already ${input.zOrder.relativeHeight}.`);
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      relativeHeight: input.zOrder.relativeHeight,
    });
    editor.dispatch(tr);
    return true;
  });

  const changed = receipt.steps[0]?.effect === 'changed';
  if (!changed) return buildNoOpResult('Set z-order produced no change.');

  const updated = findImageById(editor, input.imageId);
  return buildSuccessResult(updated);
}
