/**
 * Runtime dispatch table for the invoke API.
 *
 * Maps every OperationId to a function that delegates to the corresponding
 * direct method on DocumentApi. Built once per createDocumentApi call.
 */

import type { OperationId } from '../contract/types.js';
import type { DocumentApi } from '../index.js';

type DispatchHandler = (input: unknown, options?: unknown) => unknown;

export type DispatchTable = Record<OperationId, DispatchHandler>;

/**
 * Builds a dispatch table that maps every OperationId to the corresponding
 * direct method call on the given DocumentApi instance.
 *
 * Each entry delegates to the direct method — no parallel execution path.
 */
export function buildDispatchTable(api: DocumentApi): DispatchTable {
  return {
    // --- Singleton reads ---
    find: (input, options) =>
      api.find(input as Parameters<typeof api.find>[0], options as Parameters<typeof api.find>[1]),
    getNode: (input) => api.getNode(input as Parameters<typeof api.getNode>[0]),
    getNodeById: (input) => api.getNodeById(input as Parameters<typeof api.getNodeById>[0]),
    getText: (input) => api.getText(input as Parameters<typeof api.getText>[0]),
    info: (input) => api.info(input as Parameters<typeof api.info>[0]),

    // --- Singleton mutations ---
    insert: (input, options) =>
      api.insert(input as Parameters<typeof api.insert>[0], options as Parameters<typeof api.insert>[1]),
    replace: (input, options) =>
      api.replace(input as Parameters<typeof api.replace>[0], options as Parameters<typeof api.replace>[1]),
    delete: (input, options) =>
      api.delete(input as Parameters<typeof api.delete>[0], options as Parameters<typeof api.delete>[1]),

    // --- format.* ---
    'format.bold': (input, options) =>
      api.format.bold(input as Parameters<typeof api.format.bold>[0], options as Parameters<typeof api.format.bold>[1]),

    // --- create.* ---
    'create.paragraph': (input, options) =>
      api.create.paragraph(
        input as Parameters<typeof api.create.paragraph>[0],
        options as Parameters<typeof api.create.paragraph>[1],
      ),

    // --- lists.* ---
    'lists.list': (input) => api.lists.list(input as Parameters<typeof api.lists.list>[0]),
    'lists.get': (input) => api.lists.get(input as Parameters<typeof api.lists.get>[0]),
    'lists.insert': (input, options) =>
      api.lists.insert(
        input as Parameters<typeof api.lists.insert>[0],
        options as Parameters<typeof api.lists.insert>[1],
      ),
    'lists.setType': (input, options) =>
      api.lists.setType(
        input as Parameters<typeof api.lists.setType>[0],
        options as Parameters<typeof api.lists.setType>[1],
      ),
    'lists.indent': (input, options) =>
      api.lists.indent(
        input as Parameters<typeof api.lists.indent>[0],
        options as Parameters<typeof api.lists.indent>[1],
      ),
    'lists.outdent': (input, options) =>
      api.lists.outdent(
        input as Parameters<typeof api.lists.outdent>[0],
        options as Parameters<typeof api.lists.outdent>[1],
      ),
    'lists.restart': (input, options) =>
      api.lists.restart(
        input as Parameters<typeof api.lists.restart>[0],
        options as Parameters<typeof api.lists.restart>[1],
      ),
    'lists.exit': (input, options) =>
      api.lists.exit(input as Parameters<typeof api.lists.exit>[0], options as Parameters<typeof api.lists.exit>[1]),

    // --- comments.* ---
    'comments.add': (input) => api.comments.add(input as Parameters<typeof api.comments.add>[0]),
    'comments.edit': (input) => api.comments.edit(input as Parameters<typeof api.comments.edit>[0]),
    'comments.reply': (input) => api.comments.reply(input as Parameters<typeof api.comments.reply>[0]),
    'comments.move': (input) => api.comments.move(input as Parameters<typeof api.comments.move>[0]),
    'comments.resolve': (input) => api.comments.resolve(input as Parameters<typeof api.comments.resolve>[0]),
    'comments.remove': (input) => api.comments.remove(input as Parameters<typeof api.comments.remove>[0]),
    'comments.setInternal': (input) =>
      api.comments.setInternal(input as Parameters<typeof api.comments.setInternal>[0]),
    'comments.setActive': (input) => api.comments.setActive(input as Parameters<typeof api.comments.setActive>[0]),
    'comments.goTo': (input) => api.comments.goTo(input as Parameters<typeof api.comments.goTo>[0]),
    'comments.get': (input) => api.comments.get(input as Parameters<typeof api.comments.get>[0]),
    'comments.list': (input) => api.comments.list(input as Parameters<typeof api.comments.list>[0]),

    // --- trackChanges.* ---
    'trackChanges.list': (input) => api.trackChanges.list(input as Parameters<typeof api.trackChanges.list>[0]),
    'trackChanges.get': (input) => api.trackChanges.get(input as Parameters<typeof api.trackChanges.get>[0]),
    'trackChanges.accept': (input) => api.trackChanges.accept(input as Parameters<typeof api.trackChanges.accept>[0]),
    'trackChanges.reject': (input) => api.trackChanges.reject(input as Parameters<typeof api.trackChanges.reject>[0]),
    'trackChanges.acceptAll': (input) =>
      api.trackChanges.acceptAll(input as Parameters<typeof api.trackChanges.acceptAll>[0]),
    'trackChanges.rejectAll': (input) =>
      api.trackChanges.rejectAll(input as Parameters<typeof api.trackChanges.rejectAll>[0]),

    // --- capabilities ---
    'capabilities.get': () => api.capabilities(),
  };
}
