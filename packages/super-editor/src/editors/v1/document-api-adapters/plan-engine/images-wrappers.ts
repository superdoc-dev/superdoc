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
  ScaleInput,
  SetLockAspectRatioInput,
  RotateInput,
  FlipInput,
  CropInput,
  ResetCropInput,
  ReplaceSourceInput,
  SetAltTextInput,
  SetDecorativeInput,
  SetNameInput,
  SetHyperlinkInput,
  InsertCaptionInput,
  UpdateCaptionInput,
  RemoveCaptionInput,
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
import { executeDomainCommand, resolveWriteStoryRuntime, disposeEphemeralWriteRuntime } from './plan-wrappers.js';
import { resolveCreateAnchor } from './create-insertion.js';
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

function parseCropFromClipPath(clipPath: string | undefined | null) {
  if (!clipPath) return null;
  const match = clipPath.match(/^inset\(\s*([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s*\)$/);
  if (!match) return null;
  return {
    top: parseFloat(match[1]),
    right: parseFloat(match[2]),
    bottom: parseFloat(match[3]),
    left: parseFloat(match[4]),
  };
}

function buildTransformInfo(td: Record<string, unknown> | undefined) {
  if (!td) return null;
  if (!td.rotation && !td.verticalFlip && !td.horizontalFlip) return null;
  return {
    rotation: (td.rotation as number) ?? undefined,
    verticalFlip: (td.verticalFlip as boolean) ?? undefined,
    horizontalFlip: (td.horizontalFlip as boolean) ?? undefined,
  };
}

function hasCaptionSibling(editor: Editor, imagePos: number): boolean {
  try {
    return findCaptionParagraph(editor, imagePos) !== null;
  } catch {
    return false;
  }
}

function buildImageSummary(editor: Editor, candidate: ImageCandidate): ImageSummary {
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
      name: attrs.alt ?? undefined,
      description: attrs.title ?? undefined,
      transform: buildTransformInfo(attrs.transformData),
      crop: parseCropFromClipPath(attrs.clipPath),
      lockAspectRatio: attrs.lockAspectRatio ?? true,
      decorative: attrs.decorative ?? false,
      hyperlink: attrs.hyperlink ?? null,
      hasCaption: hasCaptionSibling(editor, candidate.pos),
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
      return resolveCreateAnchor(editor, location.target, location.kind).pos;
    case 'inParagraph': {
      // Pre-flight nodeType validation via resolveCreateAnchor, then compute inline offset
      const { pos } = resolveCreateAnchor(editor, location.target, 'before');
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
  const items = allImages.slice(offset, offset + limit).map((c) => buildImageSummary(editor, c));
  return { total: allImages.length, items };
}

export function imagesGetWrapper(editor: Editor, input: ImagesGetInput): ImageSummary {
  const image = findImageById(editor, input.imageId);
  return buildImageSummary(editor, image);
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

  const runtime = resolveWriteStoryRuntime(editor, input.in);
  const storyEditor = runtime.editor;

  try {
    if (typeof storyEditor.commands.setImage !== 'function') {
      throw new DocumentApiAdapterError(
        'CAPABILITY_UNAVAILABLE',
        'create.image requires the image extension (setImage command).',
      );
    }

    // -- Resolve image dimensions -----------------------------------------------
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

    // -- Assign unique drawing ID -----------------------------------------------
    const drawingId = generateUniqueDocPrId(storyEditor);

    const sdImageId = uuidv4();
    const insertPos = input.at ? resolveImageInsertPosition(storyEditor, input.at) : null;

    if (options?.dryRun) {
      return {
        success: true,
        image: { kind: 'inline', nodeType: 'image', nodeId: sdImageId, placement: 'inline' },
      };
    }

    const receipt = executeDomainCommand(storyEditor, () => {
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
        return Boolean(storyEditor.commands.insertContentAt(insertPos, { type: 'image', attrs }));
      }

      // No location specified — insert at current selection via setImage.
      return Boolean(storyEditor.commands.setImage(attrs));
    });

    const commandSucceeded = receipt.steps[0]?.effect === 'changed';
    if (!commandSucceeded) {
      return { success: false, failure: { code: 'INVALID_TARGET', message: 'Image could not be created.' } };
    }

    if (runtime.commit) runtime.commit(editor);
    return {
      success: true,
      image: { kind: 'inline', nodeType: 'image', nodeId: sdImageId, placement: 'inline' },
    };
  } finally {
    disposeEphemeralWriteRuntime(runtime);
  }
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

// ===========================================================================
// SD-2100: Geometry
// ===========================================================================

export function imagesScaleWrapper(editor: Editor, input: ScaleInput, options?: MutationOptions): ImagesMutationResult {
  rejectTrackedMode('images.scale', options);

  const image = findImageById(editor, input.imageId);
  const currentSize = image.node.attrs.size;
  if (!isFinitePositive(currentSize?.width) || !isFinitePositive(currentSize?.height)) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Image has no explicit size; use setSize first.');
  }

  const newSize = {
    width: Math.max(1, Math.round(currentSize.width * input.factor)),
    height: Math.max(1, Math.round(currentSize.height * input.factor)),
  };

  if (newSize.width === currentSize.width && newSize.height === currentSize.height) {
    return buildNoOpResult('Scale produced no size change.');
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, size: newSize });
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Scale produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

export function imagesSetLockAspectRatioWrapper(
  editor: Editor,
  input: SetLockAspectRatioInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setLockAspectRatio', options);

  const image = findImageById(editor, input.imageId);
  if ((image.node.attrs.lockAspectRatio ?? true) === input.locked) {
    return buildNoOpResult(`lockAspectRatio is already ${input.locked}.`);
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, lockAspectRatio: input.locked });
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Set lock aspect ratio produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

export function imagesRotateWrapper(
  editor: Editor,
  input: RotateInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.rotate', options);

  const image = findImageById(editor, input.imageId);
  const currentRotation = image.node.attrs.transformData?.rotation ?? 0;
  if (currentRotation === input.angle) {
    return buildNoOpResult(`Rotation is already ${input.angle} degrees.`);
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      transformData: { ...(node.attrs.transformData ?? {}), rotation: input.angle },
    });
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Rotate produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

export function imagesFlipWrapper(editor: Editor, input: FlipInput, options?: MutationOptions): ImagesMutationResult {
  rejectTrackedMode('images.flip', options);

  const image = findImageById(editor, input.imageId);
  const current = image.node.attrs.transformData ?? {};
  const targetH = input.horizontal ?? current.horizontalFlip ?? false;
  const targetV = input.vertical ?? current.verticalFlip ?? false;

  if (targetH === (current.horizontalFlip ?? false) && targetV === (current.verticalFlip ?? false)) {
    return buildNoOpResult('Flip state is already as requested.');
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      transformData: { ...(node.attrs.transformData ?? {}), horizontalFlip: targetH, verticalFlip: targetV },
    });
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Flip produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

/** Convert crop percentages (0–100) to CSS `inset(top% right% bottom% left%)`. */
function cropToClipPath(crop: CropInput['crop']): string {
  const { top = 0, right = 0, bottom = 0, left = 0 } = crop;
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
}

/** Build a raw OOXML `a:srcRect` element. OOXML uses 0–100,000 scale. */
function cropToRawSrcRect(crop: CropInput['crop']) {
  const { top = 0, right = 0, bottom = 0, left = 0 } = crop;
  return {
    name: 'a:srcRect',
    attributes: {
      l: String(Math.round(left * 1000)),
      t: String(Math.round(top * 1000)),
      r: String(Math.round(right * 1000)),
      b: String(Math.round(bottom * 1000)),
    },
  };
}

export function imagesCropWrapper(editor: Editor, input: CropInput, options?: MutationOptions): ImagesMutationResult {
  rejectTrackedMode('images.crop', options);

  const image = findImageById(editor, input.imageId);
  const newClipPath = cropToClipPath(input.crop);

  if (image.node.attrs.clipPath === newClipPath) {
    return buildNoOpResult('Crop values are already as requested.');
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      clipPath: newClipPath,
      rawSrcRect: cropToRawSrcRect(input.crop),
    });
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Crop produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

export function imagesResetCropWrapper(
  editor: Editor,
  input: ResetCropInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.resetCrop', options);

  const image = findImageById(editor, input.imageId);
  if (!image.node.attrs.clipPath) {
    return buildNoOpResult('Image has no crop to reset.');
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, clipPath: null, rawSrcRect: null, shouldCover: false });
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Reset crop produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

// ===========================================================================
// SD-2100: Content replacement
// ===========================================================================

export function imagesReplaceSourceWrapper(
  editor: Editor,
  input: ReplaceSourceInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.replaceSource', options);

  const isDataUri = input.src.startsWith('data:');
  const isInternalPath = input.src.startsWith('word/media/');
  if (!isDataUri && !isInternalPath) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      'External URLs are not supported in V1; provide a data URI or internal media path.',
    );
  }

  const image = findImageById(editor, input.imageId);

  const newAttrs: Record<string, unknown> = {
    ...image.node.attrs,
    src: input.src,
    rId: null,
    originalSrc: null,
    originalExtension: null,
    clipPath: null,
    rawSrcRect: null,
    shouldCover: false,
  };

  if (input.resetSize) {
    if (!isDataUri) {
      throw new DocumentApiAdapterError(
        'INVALID_INPUT',
        'Cannot determine intrinsic dimensions from internal path; set size explicitly via setSize after replacement.',
      );
    }
    const dims = readImageDimensionsFromDataUri(input.src);
    if (!dims) {
      throw new DocumentApiAdapterError('INVALID_INPUT', 'Could not determine intrinsic dimensions from data URI.');
    }
    newAttrs.size = { width: dims.width, height: dims.height };
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, newAttrs);
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Replace source produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

// ===========================================================================
// SD-2100: Semantic metadata
// ===========================================================================

export function imagesSetAltTextWrapper(
  editor: Editor,
  input: SetAltTextInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setAltText', options);

  const image = findImageById(editor, input.imageId);
  if (image.node.attrs.title === input.description && !image.node.attrs.decorative) {
    return buildNoOpResult('Alt text is already as requested.');
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    // Setting alt text clears decorative flag (Word behavior)
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, title: input.description, decorative: false });
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Set alt text produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

export function imagesSetDecorativeWrapper(
  editor: Editor,
  input: SetDecorativeInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setDecorative', options);

  const image = findImageById(editor, input.imageId);
  if ((image.node.attrs.decorative ?? false) === input.decorative) {
    return buildNoOpResult(`Decorative is already ${input.decorative}.`);
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    // Decorative images have no alt text (Word behavior)
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      decorative: input.decorative,
      title: input.decorative ? '' : node.attrs.title,
    });
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Set decorative produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

export function imagesSetNameWrapper(
  editor: Editor,
  input: SetNameInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setName', options);

  const image = findImageById(editor, input.imageId);
  if (image.node.attrs.alt === input.name) {
    return buildNoOpResult('Name is already as requested.');
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt: input.name });
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Set name produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

export function imagesSetHyperlinkWrapper(
  editor: Editor,
  input: SetHyperlinkInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.setHyperlink', options);

  const image = findImageById(editor, input.imageId);
  const newValue = input.url === null ? null : { url: input.url, ...(input.tooltip ? { tooltip: input.tooltip } : {}) };
  const current = image.node.attrs.hyperlink ?? null;

  if (
    (current === null && newValue === null) ||
    (current !== null && newValue !== null && current.url === newValue.url && current.tooltip === newValue.tooltip)
  ) {
    return buildNoOpResult('Hyperlink is already as requested.');
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const { pos, node } = image;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, hyperlink: newValue });
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Set hyperlink produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

// ===========================================================================
// SD-2100: Caption lifecycle
// ===========================================================================

function findContainingParagraph(editor: Editor, imagePos: number) {
  const $pos = editor.state.doc.resolve(imagePos);
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== 'paragraph') continue;
    return {
      depth,
      pos: $pos.before(depth),
      node,
    };
  }

  throw new DocumentApiAdapterError('INVALID_TARGET', 'Caption operations require the image to be inside a paragraph.');
}

/** Find the caption paragraph immediately following the image's containing paragraph. */
function findCaptionParagraph(editor: Editor, imagePos: number) {
  const paragraph = findContainingParagraph(editor, imagePos);
  const afterParagraphPos = paragraph.pos + paragraph.node.nodeSize;

  if (afterParagraphPos >= editor.state.doc.content.size) return null;

  const nextNode = editor.state.doc.nodeAt(afterParagraphPos);
  if (!nextNode || nextNode.type.name !== 'paragraph') return null;

  const styleId = nextNode.attrs?.paragraphProperties?.styleId ?? nextNode.attrs?.styleId;
  if (styleId !== 'Caption') return null;

  return { pos: afterParagraphPos, node: nextNode };
}

/** Verify the image is the sole inline content of its immediate parent container. */
function requireSoleImageInParagraph(editor: Editor, imagePos: number): void {
  const $pos = editor.state.doc.resolve(imagePos);
  const parentDepth = $pos.depth - 1;
  if (parentDepth < 0) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      'Caption operations require the image to be inside a paragraph.',
    );
  }
  const parentNode = $pos.node(parentDepth + 1);
  let inlineContentCount = 0;
  parentNode.forEach((child) => {
    if (child.isInline) inlineContentCount++;
  });
  if (inlineContentCount !== 1) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      'Caption operations require the image to be the sole content of its paragraph.',
    );
  }
}

export function imagesInsertCaptionWrapper(
  editor: Editor,
  input: InsertCaptionInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.insertCaption', options);

  const image = findImageById(editor, input.imageId);
  requireSoleImageInParagraph(editor, image.pos);

  const existing = findCaptionParagraph(editor, image.pos);
  if (existing) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Image already has a caption; use updateCaption.');
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const currentImage = findImageById(editor, input.imageId);
    const paragraph = findContainingParagraph(editor, currentImage.pos);
    const afterParagraphPos = paragraph.pos + paragraph.node.nodeSize;

    const tr = editor.state.tr;
    const captionPara = editor.state.schema.nodes.paragraph.create(
      { paragraphProperties: { styleId: 'Caption' } },
      editor.state.schema.text(input.text),
    );
    tr.insert(afterParagraphPos, captionPara);
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Insert caption produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

export function imagesUpdateCaptionWrapper(
  editor: Editor,
  input: UpdateCaptionInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.updateCaption', options);

  const image = findImageById(editor, input.imageId);
  requireSoleImageInParagraph(editor, image.pos);

  const caption = findCaptionParagraph(editor, image.pos);
  if (!caption) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'No caption paragraph found; use insertCaption first.');
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const tr = editor.state.tr;
    const textStart = caption.pos + 1;
    const textEnd = caption.pos + caption.node.nodeSize - 1;
    tr.replaceWith(textStart, textEnd, editor.state.schema.text(input.text));
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Update caption produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}

export function imagesRemoveCaptionWrapper(
  editor: Editor,
  input: RemoveCaptionInput,
  options?: MutationOptions,
): ImagesMutationResult {
  rejectTrackedMode('images.removeCaption', options);

  const image = findImageById(editor, input.imageId);
  requireSoleImageInParagraph(editor, image.pos);

  const caption = findCaptionParagraph(editor, image.pos);
  if (!caption) {
    return buildNoOpResult('No caption to remove.');
  }

  if (options?.dryRun) return buildSuccessResult(image);

  const receipt = executeDomainCommand(editor, () => {
    const tr = editor.state.tr;
    tr.delete(caption.pos, caption.pos + caption.node.nodeSize);
    if (!tr.docChanged) return false;
    editor.dispatch(tr);
    return true;
  });

  if (receipt.steps[0]?.effect !== 'changed') return buildNoOpResult('Remove caption produced no change.');
  return buildSuccessResult(findImageById(editor, input.imageId));
}
