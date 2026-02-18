import type { DocumentApiAdapters } from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { findAdapter } from './find-adapter.js';
import { getNodeAdapter, getNodeByIdAdapter } from './get-node-adapter.js';
import { getTextAdapter } from './get-text-adapter.js';
import { infoAdapter } from './info-adapter.js';
import { getDocumentApiCapabilities } from './capabilities-adapter.js';
import { createCommentsAdapter } from './comments-adapter.js';
import { writeAdapter } from './write-adapter.js';
import {
  formatBoldAdapter,
  formatItalicAdapter,
  formatUnderlineAdapter,
  formatStrikethroughAdapter,
} from './format-adapter.js';
import {
  trackChangesListAdapter,
  trackChangesGetAdapter,
  trackChangesAcceptAdapter,
  trackChangesRejectAdapter,
  trackChangesAcceptAllAdapter,
  trackChangesRejectAllAdapter,
} from './track-changes-adapter.js';
import { createParagraphAdapter, createHeadingAdapter } from './create-adapter.js';
import {
  listsListAdapter,
  listsGetAdapter,
  listsInsertAdapter,
  listsSetTypeAdapter,
  listsIndentAdapter,
  listsOutdentAdapter,
  listsRestartAdapter,
  listsExitAdapter,
} from './lists-adapter.js';

/**
 * Assembles all document-api adapters for the given editor instance.
 *
 * @param editor - The editor instance to bind adapters to.
 * @returns A {@link DocumentApiAdapters} object ready to pass to `createDocumentApi()`.
 */
export function assembleDocumentApiAdapters(editor: Editor): DocumentApiAdapters {
  return {
    find: {
      find: (query) => findAdapter(editor, query),
    },
    getNode: {
      getNode: (address) => getNodeAdapter(editor, address),
      getNodeById: (input) => getNodeByIdAdapter(editor, input),
    },
    getText: {
      getText: (input) => getTextAdapter(editor, input),
    },
    info: {
      info: (input) => infoAdapter(editor, input),
    },
    capabilities: {
      get: () => getDocumentApiCapabilities(editor),
    },
    comments: createCommentsAdapter(editor),
    write: {
      write: (request, options) => writeAdapter(editor, request, options),
    },
    format: {
      bold: (input, options) => formatBoldAdapter(editor, input, options),
      italic: (input, options) => formatItalicAdapter(editor, input, options),
      underline: (input, options) => formatUnderlineAdapter(editor, input, options),
      strikethrough: (input, options) => formatStrikethroughAdapter(editor, input, options),
    },
    trackChanges: {
      list: (input) => trackChangesListAdapter(editor, input),
      get: (input) => trackChangesGetAdapter(editor, input),
      accept: (input) => trackChangesAcceptAdapter(editor, input),
      reject: (input) => trackChangesRejectAdapter(editor, input),
      acceptAll: (input) => trackChangesAcceptAllAdapter(editor, input),
      rejectAll: (input) => trackChangesRejectAllAdapter(editor, input),
    },
    create: {
      paragraph: (input, options) => createParagraphAdapter(editor, input, options),
      heading: (input, options) => createHeadingAdapter(editor, input, options),
    },
    lists: {
      list: (query) => listsListAdapter(editor, query),
      get: (input) => listsGetAdapter(editor, input),
      insert: (input, options) => listsInsertAdapter(editor, input, options),
      setType: (input, options) => listsSetTypeAdapter(editor, input, options),
      indent: (input, options) => listsIndentAdapter(editor, input, options),
      outdent: (input, options) => listsOutdentAdapter(editor, input, options),
      restart: (input, options) => listsRestartAdapter(editor, input, options),
      exit: (input, options) => listsExitAdapter(editor, input, options),
    },
  };
}
