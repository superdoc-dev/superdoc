import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { ReplaceStep, ReplaceAroundStep } from 'prosemirror-transform';
import { base64ToFile, getBase64FileMeta } from './handleBase64';
import { urlToFile, validateUrlAccessibility } from './handleUrl';
import { checkAndProcessImage, uploadAndInsertImage } from './startImageUpload';
import { buildMediaPath, ensureUniqueFileName } from './fileNameUtils.js';
import { addImageRelationship } from '@extensions/image/imageHelpers/startImageUpload.js';
const key = new PluginKey('ImageRegistration');

/**
 * Determines whether an image node still needs to go through the registration flow.
 *
 * Images are considered already registered (returns false) if:
 * - src starts with 'word/media' (already in DOCX media folder)
 * - src is a data URI with an rId (already has a relationship ID for export)
 *
 * @param {import('prosemirror-model').Node} node
 * @returns {boolean}
 */
export const needsImageRegistration = (node) => {
  if (!node || node.type?.name !== 'image') return false;

  const src = node.attrs?.src;
  if (typeof src !== 'string' || src.length === 0) return false;

  // Already registered in DOCX media folder
  if (src.startsWith('word/media')) return false;

  // Data URI with rId means it was converted (e.g., EMF→SVG) but already has export metadata
  if (src.startsWith('data:') && node.attrs?.rId) return false;

  return true;
};

export const ImageRegistrationPlugin = ({ editor }) => {
  const { view } = editor;
  return new Plugin({
    key,
    state: {
      init() {
        return { set: DecorationSet.empty };
      },

      apply(tr, { set }) {
        // For reference.
        // let diffStart = tr.doc.content.findDiffStart(oldState.doc.content);
        // let diffEnd = oldState.doc.content.findDiffEnd(tr.doc.content);
        // let map = diffEnd && diffStart
        //   ? new StepMap([diffStart, diffEnd.a - diffStart, diffEnd.b - diffStart])
        //   : new StepMap([0, 0, 0]);
        // let pmMapping = new Mapping([map]);
        // let set = value.map(pmMapping, tr.doc);
        ///
        const meta = tr.getMeta(key);
        // If meta is set, it overrides the default behavior.
        if (meta) {
          set = meta.set;
          return { set };
        }
        // Adjust decoration positions to changes made by the transaction
        set = set.map(tr.mapping, tr.doc);

        return { set };
      },
    },
    appendTransaction: (trs, _oldState, state) => {
      let foundImages = [];
      if (!trs.some((tr) => tr.docChanged)) return null;

      trs.forEach((tr) => {
        if (tr.docChanged) {
          // Check if there are any images in the incoming transaction. If so, we need to register them.
          tr.steps.forEach((step, index) => {
            const stepMap = step.getMap();
            foundImages = foundImages.map(({ node, pos, id }) => {
              const mappedPos = stepMap.map(pos, -1);
              return { node, pos: mappedPos, id };
            });
            if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
              // Check for new images.
              (tr.docs[index + 1] || tr.doc).nodesBetween(
                stepMap.map(step.from, -1),
                stepMap.map(step.to, 1),
                (node, pos) => {
                  if (node.type.name === 'image' && needsImageRegistration(node)) {
                    // Node contains an image that is not yet registered.
                    const id = {};
                    foundImages.push({ node, pos, id });
                  } else {
                    return true;
                  }
                },
              );
            }
          });
        }
      });

      if (!foundImages || foundImages.length === 0) {
        return null;
      }

      // NODE PATH
      if (editor.options.isHeadless) {
        return handleNodePath(foundImages, editor, state);
      }

      // BROWSER PATH
      return handleBrowserPath(foundImages, editor, view, state);
    },
    props: {
      decorations(state) {
        let { set } = key.getState(state);
        return set;
      },
    },
  });
};

const derivePreferredFileName = (src) => {
  if (typeof src !== 'string' || src.length === 0) {
    return 'image.jpg';
  }

  if (src.startsWith('data:')) {
    return getBase64FileMeta(src).filename;
  }

  const lastSegment = src.split('/').pop() ?? '';
  const trimmed = lastSegment.split(/[?#]/)[0];
  if (!trimmed) return 'image.jpg';

  // Preserve extension when present; otherwise add a default image extension.
  if (!trimmed.includes('.')) {
    return `${trimmed}.jpg`;
  }

  return trimmed;
};

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseSizeFromImageUrl = (src) => {
  if (typeof src !== 'string' || src.length === 0 || !src.startsWith('http')) {
    return null;
  }

  try {
    const url = new URL(src);
    const width =
      parsePositiveInt(url.searchParams.get('width')) ??
      parsePositiveInt(url.searchParams.get('w')) ??
      parsePositiveInt(url.searchParams.get('imgw'));
    const height =
      parsePositiveInt(url.searchParams.get('height')) ??
      parsePositiveInt(url.searchParams.get('h')) ??
      parsePositiveInt(url.searchParams.get('imgh'));

    if (width && height) {
      return { width, height };
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const last = parsePositiveInt(segments.at(-1));
    const secondLast = parsePositiveInt(segments.at(-2));
    if (secondLast && last) {
      return { width: secondLast, height: last };
    }

    const compact = segments.at(-1)?.match(/^(\d{1,5})x(\d{1,5})$/i);
    if (compact) {
      const compactWidth = parsePositiveInt(compact[1]);
      const compactHeight = parsePositiveInt(compact[2]);
      if (compactWidth && compactHeight) {
        return { width: compactWidth, height: compactHeight };
      }
    }
  } catch {
    return null;
  }

  return null;
};

const hasFinitePositiveSize = (size) =>
  Number.isFinite(size?.width) && size.width > 0 && Number.isFinite(size?.height) && size.height > 0;

/**
 * Handles the node path for image registration.
 *
 * @param {Array} foundImages - Array of found image nodes with their positions and IDs.
 * @param {Object} editor - The editor instance.
 * @param {import('prosemirror-state').EditorState} state - The current editor state.
 * @returns {import('prosemirror-state').Transaction} - The updated transaction with image nodes updated with registered paths and IDs.
 */
export const handleNodePath = (foundImages, editor, state) => {
  const { tr } = state;
  const mediaStore = editor.storage.image.media ?? {};

  if (!editor.storage.image.media) {
    editor.storage.image.media = mediaStore;
  }

  const existingFileNames = new Set(Object.keys(mediaStore).map((key) => key.split('/').pop()));

  foundImages.forEach(({ node, pos }) => {
    const { src } = node.attrs;
    const preferredFileName = derivePreferredFileName(src);
    const uniqueFileName = ensureUniqueFileName(preferredFileName, existingFileNames);
    existingFileNames.add(uniqueFileName);

    const mediaPath = buildMediaPath(uniqueFileName);
    mediaStore[mediaPath] = src;

    // Sync image data to Y.Doc media map so other collab clients can access it.
    // We write directly to the Y.Doc map instead of using editor.commands because
    // this runs inside appendTransaction where commands don't dispatch properly.
    if (editor.options.ydoc) {
      const mediaMap = editor.options.ydoc.getMap('media');
      mediaMap.set(mediaPath, src);
    }

    const path = mediaPath.startsWith('word/') ? mediaPath.slice(5) : mediaPath;
    const rId = addImageRelationship({ editor, path });
    const inferredSize = hasFinitePositiveSize(node.attrs?.size) ? null : parseSizeFromImageUrl(src);

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      ...(inferredSize ? { size: inferredSize } : {}),
      src: mediaPath,
      rId,
    });
  });

  return tr;
};

/**
 * Handles the browser path for image registration.
 *
 * @param {Array} foundImages - Array of found image nodes with their positions and IDs.
 * @param {Object} editor - The editor instance.
 * @param {import('prosemirror-view').EditorView} view - The editor view instance.
 * @param {import('prosemirror-state').EditorState} state - The current editor state.
 * @returns {import('prosemirror-state').Transaction} - The updated transaction with image nodes replaced by placeholders and registration process initiated.
 */
const handleBrowserPath = (foundImages, editor, view, state) => {
  // Register the images. (async process).
  registerImages(foundImages, editor, view);

  // Remove all the images that were found. These will eventually be replaced by the updated images.
  const tr = state.tr;

  // We need to delete the image nodes and replace them with decorations. This will change their positions.

  // Get the current decoration set
  let { set } = key.getState(state);

  // Add decorations for the images first at their current positions
  foundImages
    .slice()
    .sort((a, b) => a.pos - b.pos)
    .forEach(({ pos, id }) => {
      let deco = Decoration.widget(pos, () => document.createElement('placeholder'), {
        side: -1,
        id,
      });
      set = set.add(tr.doc, [deco]);
    });

  // Then delete the image nodes (highest position first to avoid position shifting issues)
  foundImages
    .slice()
    .sort((a, b) => b.pos - a.pos)
    .forEach(({ node, pos }) => {
      tr.delete(pos, pos + node.nodeSize);
    });
  // Map the decoration set through the transaction to adjust positions
  set = set.map(tr.mapping, tr.doc);

  // Set the updated decoration set in the transaction metadata
  tr.setMeta(key, { set });
  return tr;
};

export const findPlaceholder = (state, id) => {
  let { set } = key.getState(state);
  let found = set?.find(null, null, (spec) => spec.id === id);
  return found?.length ? found[0].from : null;
};

export const removeImagePlaceholder = (state, tr, id) => {
  let { set } = key.getState(state);
  set = set.map(tr.mapping, tr.doc);
  set = set.remove(set.find(null, null, (spec) => spec.id == id));
  return tr.setMeta(key, { set, type: 'remove' });
};

export const addImagePlaceholder = (state, tr, id, pos) => {
  let { set } = key.getState(state);
  set = set.map(tr.mapping, tr.doc);
  let deco = Decoration.widget(pos, () => document.createElement('placeholder'), {
    id,
  });
  set = set.add(tr.doc, [deco]);
  return tr.setMeta(key, { set, type: 'add' });
};

export const getImageRegistrationMetaType = (tr) => {
  const meta = tr.getMeta(key);
  if (meta && meta.type) {
    return meta.type;
  }
  return null;
};

const registerImages = async (foundImages, editor, view) => {
  foundImages.forEach(async (image) => {
    const src = image.node.attrs.src;
    const id = image.id;
    let file = null;

    if (src.startsWith('http')) {
      // First check if the URL is accessible without CORS issues
      const isAccessible = await validateUrlAccessibility(src);

      if (isAccessible) {
        // Download image first, create fileobject, then proceed with registration.
        file = await urlToFile(src);
      } else {
        console.warn(`Image URL ${src} is not accessible due to CORS or other restrictions. Using original URL.`);
        // Fallback: Remove the placeholder.
        const tr = view.state.tr;
        removeImagePlaceholder(view.state, tr, id);
        view.dispatch(tr);
        return;
      }
    } else if (src.startsWith('data:')) {
      file = base64ToFile(src);
    } else {
      console.error(`Unsupported image source: ${src}`);
    }

    if (!file) {
      // If file conversion failed, remove the placeholder to avoid stuck UI
      const tr = view.state.tr;
      removeImagePlaceholder(view.state, tr, id);
      view.dispatch(tr);
      return;
    }

    try {
      const process = await checkAndProcessImage({
        getMaxContentSize: () => editor.getMaxContentSize(),
        file,
      });

      if (!process.file) {
        // Processing failed, remove placeholder
        const tr = view.state.tr;
        removeImagePlaceholder(view.state, tr, id);
        view.dispatch(tr);
        return;
      }

      await uploadAndInsertImage({ editor, view, file: process.file, size: process.size, id });
    } catch (error) {
      console.error(`Error processing image from ${src}:`, error);
      // Ensure placeholder is removed even on error
      const tr = view.state.tr;
      removeImagePlaceholder(view.state, tr, id);
      view.dispatch(tr);
    }
  });
};
