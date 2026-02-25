import type { DocumentApiAdapters } from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { findAdapter } from './find-adapter.js';
import { getNodeAdapter, getNodeByIdAdapter } from './get-node-adapter.js';
import { getTextAdapter } from './get-text-adapter.js';
import { infoAdapter } from './info-adapter.js';
import { getDocumentApiCapabilities } from './capabilities-adapter.js';
import { createCommentsWrapper } from './plan-engine/comments-wrappers.js';
import { writeWrapper, styleApplyWrapper } from './plan-engine/plan-wrappers.js';
import {
  trackChangesListWrapper,
  trackChangesGetWrapper,
  trackChangesAcceptWrapper,
  trackChangesRejectWrapper,
  trackChangesAcceptAllWrapper,
  trackChangesRejectAllWrapper,
} from './plan-engine/track-changes-wrappers.js';
import { createParagraphWrapper, createHeadingWrapper } from './plan-engine/create-wrappers.js';
import {
  listsListWrapper,
  listsGetWrapper,
  listsInsertWrapper,
  listsSetTypeWrapper,
  listsIndentWrapper,
  listsOutdentWrapper,
  listsRestartWrapper,
  listsExitWrapper,
} from './plan-engine/lists-wrappers.js';
import { executePlan } from './plan-engine/executor.js';
import { previewPlan } from './plan-engine/preview.js';
import { queryMatchAdapter } from './plan-engine/query-match-adapter.js';
import { initRevision, trackRevisions } from './plan-engine/revision-tracker.js';
import { registerBuiltInExecutors } from './plan-engine/register-executors.js';

/**
 * Assembles all document-api adapters for the given editor instance.
 *
 * @param editor - The editor instance to bind adapters to.
 * @returns A {@link DocumentApiAdapters} object ready to pass to `createDocumentApi()`.
 */
export function assembleDocumentApiAdapters(editor: Editor): DocumentApiAdapters {
  registerBuiltInExecutors();
  initRevision(editor);
  trackRevisions(editor);

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
    comments: createCommentsWrapper(editor),
    write: {
      write: (request, options) => writeWrapper(editor, request, options),
    },
    format: {
      apply: (input, options) => styleApplyWrapper(editor, input, options),
    },
    trackChanges: {
      list: (input) => trackChangesListWrapper(editor, input),
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
