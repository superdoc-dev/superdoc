import type {
  DocumentApiAdapters,
  GetNodeByIdInput,
  GetTextInput,
  InfoInput,
  NodeAddress,
  Query,
  TrackChangesAcceptAllInput,
  TrackChangesAcceptInput,
  TrackChangesGetInput,
  TrackChangesRejectAllInput,
  TrackChangesRejectInput,
} from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { getDocumentApiCapabilities } from './capabilities-adapter.js';
import { createCommentsAdapter } from './comments-adapter.js';
import { createParagraphAdapter, createHeadingAdapter } from './create-adapter.js';
import { findAdapter } from './find-adapter.js';
import {
  formatBoldAdapter,
  formatItalicAdapter,
  formatUnderlineAdapter,
  formatStrikethroughAdapter,
} from './format-adapter.js';
import { getNodeAdapter, getNodeByIdAdapter } from './get-node-adapter.js';
import { getTextAdapter } from './get-text-adapter.js';
import { infoAdapter } from './info-adapter.js';
import {
  listsExitAdapter,
  listsGetAdapter,
  listsIndentAdapter,
  listsInsertAdapter,
  listsListAdapter,
  listsOutdentAdapter,
  listsRestartAdapter,
  listsSetTypeAdapter,
} from './lists-adapter.js';
import {
  trackChangesAcceptAdapter,
  trackChangesAcceptAllAdapter,
  trackChangesGetAdapter,
  trackChangesListAdapter,
  trackChangesRejectAdapter,
  trackChangesRejectAllAdapter,
} from './track-changes-adapter.js';
import { writeAdapter } from './write-adapter.js';

/**
 * Creates the full set of Document API adapters backed by the given editor instance.
 *
 * @param editor - The editor instance to bind adapters to.
 * @returns Adapter implementations for document query/mutation APIs.
 */
export function getDocumentApiAdapters(editor: Editor): DocumentApiAdapters {
  return {
    find: {
      find: (query: Query) => findAdapter(editor, query),
    },
    getNode: {
      getNode: (address: NodeAddress) => getNodeAdapter(editor, address),
      getNodeById: (input: GetNodeByIdInput) => getNodeByIdAdapter(editor, input),
    },
    getText: {
      getText: (input: GetTextInput) => getTextAdapter(editor, input),
    },
    info: {
      info: (input: InfoInput) => infoAdapter(editor, input),
    },
    capabilities: {
      get: () => getDocumentApiCapabilities(editor),
    },
    // Factory pattern — comments has 11 methods; inline lambdas would be unwieldy.
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
      list: (query) => trackChangesListAdapter(editor, query),
      get: (input: TrackChangesGetInput) => trackChangesGetAdapter(editor, input),
      accept: (input: TrackChangesAcceptInput) => trackChangesAcceptAdapter(editor, input),
      reject: (input: TrackChangesRejectInput) => trackChangesRejectAdapter(editor, input),
      acceptAll: (input: TrackChangesAcceptAllInput) => trackChangesAcceptAllAdapter(editor, input),
      rejectAll: (input: TrackChangesRejectAllInput) => trackChangesRejectAllAdapter(editor, input),
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
