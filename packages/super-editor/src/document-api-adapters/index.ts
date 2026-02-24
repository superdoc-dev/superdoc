import type {
  DocumentApiAdapters,
  GetNodeByIdInput,
  GetTextInput,
  InfoInput,
  NodeAddress,
  Query,
} from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { getDocumentApiCapabilities } from './capabilities-adapter.js';
import { createCommentsWrapper } from './plan-engine/comments-wrappers.js';
import { createParagraphWrapper, createHeadingWrapper } from './plan-engine/create-wrappers.js';
import { findAdapter } from './find-adapter.js';
import {
  writeWrapper,
  formatBoldWrapper,
  formatItalicWrapper,
  formatUnderlineWrapper,
  formatStrikethroughWrapper,
} from './plan-engine/plan-wrappers.js';
import { getNodeAdapter, getNodeByIdAdapter } from './get-node-adapter.js';
import { getTextAdapter } from './get-text-adapter.js';
import { infoAdapter } from './info-adapter.js';
import {
  listsExitWrapper,
  listsGetWrapper,
  listsIndentWrapper,
  listsInsertWrapper,
  listsListWrapper,
  listsOutdentWrapper,
  listsRestartWrapper,
  listsSetTypeWrapper,
} from './plan-engine/lists-wrappers.js';
import {
  trackChangesAcceptWrapper,
  trackChangesAcceptAllWrapper,
  trackChangesGetWrapper,
  trackChangesListWrapper,
  trackChangesRejectWrapper,
  trackChangesRejectAllWrapper,
} from './plan-engine/track-changes-wrappers.js';
import { executePlan } from './plan-engine/executor.js';
import { previewPlan } from './plan-engine/preview.js';
import { queryMatchAdapter } from './plan-engine/query-match-adapter.js';
import { initRevision, trackRevisions } from './plan-engine/revision-tracker.js';
import { registerBuiltInExecutors } from './plan-engine/register-executors.js';

/**
 * Creates the full set of Document API adapters backed by the given editor instance.
 *
 * @param editor - The editor instance to bind adapters to.
 * @returns Adapter implementations for document query/mutation APIs.
 */
export function getDocumentApiAdapters(editor: Editor): DocumentApiAdapters {
  registerBuiltInExecutors();
  // Initialize revision tracking for this editor instance
  initRevision(editor);
  trackRevisions(editor);

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
    comments: createCommentsWrapper(editor),
    write: {
      write: (request, options) => writeWrapper(editor, request, options),
    },
    format: {
      bold: (input, options) => formatBoldWrapper(editor, input, options),
      italic: (input, options) => formatItalicWrapper(editor, input, options),
      underline: (input, options) => formatUnderlineWrapper(editor, input, options),
      strikethrough: (input, options) => formatStrikethroughWrapper(editor, input, options),
    },
    trackChanges: {
      list: (query) => trackChangesListWrapper(editor, query),
      get: (input) => trackChangesGetWrapper(editor, input),
      accept: (input, options) => trackChangesAcceptWrapper(editor, input, options),
      reject: (input, options) => trackChangesRejectWrapper(editor, input, options),
      acceptAll: (input, options) => trackChangesAcceptAllWrapper(editor, input, options),
      rejectAll: (input, options) => trackChangesRejectAllWrapper(editor, input, options),
    },
    create: {
      paragraph: (input, options) => createParagraphWrapper(editor, input, options),
      heading: (input, options) => createHeadingWrapper(editor, input, options),
    },
    lists: {
      list: (query) => listsListWrapper(editor, query),
      get: (input) => listsGetWrapper(editor, input),
      insert: (input, options) => listsInsertWrapper(editor, input, options),
      setType: (input, options) => listsSetTypeWrapper(editor, input, options),
      indent: (input, options) => listsIndentWrapper(editor, input, options),
      outdent: (input, options) => listsOutdentWrapper(editor, input, options),
      restart: (input, options) => listsRestartWrapper(editor, input, options),
      exit: (input, options) => listsExitWrapper(editor, input, options),
    },
    query: {
      match: (input) => queryMatchAdapter(editor, input),
    },
    mutations: {
      preview: (input) => previewPlan(editor, input),
      apply: (input) => executePlan(editor, input),
    },
  };
}
