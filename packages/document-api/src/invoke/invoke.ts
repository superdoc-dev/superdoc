/**
 * Runtime dispatch table for the invoke API.
 *
 * Maps every OperationId to a function that delegates to the corresponding
 * direct method on DocumentApi. Built once per createDocumentApi call.
 */

import type { OperationId } from '../contract/types.js';
import type { OperationRegistry } from '../contract/operation-registry.js';
import type { DocumentApi } from '../index.js';

// ---------------------------------------------------------------------------
// TypedDispatchTable — compile-time contract between registry and dispatch
// ---------------------------------------------------------------------------

type TypedDispatchHandler<K extends OperationId> = OperationRegistry[K]['options'] extends never
  ? (input: OperationRegistry[K]['input']) => OperationRegistry[K]['output']
  : (input: OperationRegistry[K]['input'], options?: OperationRegistry[K]['options']) => OperationRegistry[K]['output'];

export type TypedDispatchTable = {
  [K in OperationId]: TypedDispatchHandler<K>;
};

/**
 * Builds a dispatch table that maps every OperationId to the corresponding
 * direct method call on the given DocumentApi instance.
 *
 * Each entry delegates to the direct method — no parallel execution path.
 * The return type is {@link TypedDispatchTable}, which validates at compile
 * time that each handler conforms to the {@link OperationRegistry} contract.
 */
export function buildDispatchTable(api: DocumentApi): TypedDispatchTable {
  return {
    // --- Singleton reads ---
    find: (input, options) =>
      api.find(input as Parameters<typeof api.find>[0], options as Parameters<typeof api.find>[1]),
    getNode: (input) => api.getNode(input),
    getNodeById: (input) => api.getNodeById(input),
    getText: (input) => api.getText(input),
    info: (input) => api.info(input),

    // --- Singleton mutations ---
    insert: (input, options) => api.insert(input, options),
    replace: (input, options) => api.replace(input, options),
    delete: (input, options) => api.delete(input, options),

    // --- format.* ---
    'format.bold': (input, options) => api.format.bold(input, options),
    'format.italic': (input, options) => api.format.italic(input, options),
    'format.underline': (input, options) => api.format.underline(input, options),
    'format.strikethrough': (input, options) => api.format.strikethrough(input, options),

    // --- create.* ---
    'create.paragraph': (input, options) => api.create.paragraph(input, options),
    'create.heading': (input, options) => api.create.heading(input, options),

    // --- lists.* ---
    'lists.list': (input) => api.lists.list(input),
    'lists.get': (input) => api.lists.get(input),
    'lists.insert': (input, options) => api.lists.insert(input, options),
    'lists.setType': (input, options) => api.lists.setType(input, options),
    'lists.indent': (input, options) => api.lists.indent(input, options),
    'lists.outdent': (input, options) => api.lists.outdent(input, options),
    'lists.restart': (input, options) => api.lists.restart(input, options),
    'lists.exit': (input, options) => api.lists.exit(input, options),

    // --- comments.* ---
    'comments.add': (input) => api.comments.add(input),
    'comments.edit': (input) => api.comments.edit(input),
    'comments.reply': (input) => api.comments.reply(input),
    'comments.move': (input) => api.comments.move(input),
    'comments.resolve': (input) => api.comments.resolve(input),
    'comments.remove': (input) => api.comments.remove(input),
    'comments.setInternal': (input) => api.comments.setInternal(input),
    'comments.setActive': (input) => api.comments.setActive(input),
    'comments.goTo': (input) => api.comments.goTo(input),
    'comments.get': (input) => api.comments.get(input),
    'comments.list': (input) => api.comments.list(input),

    // --- trackChanges.* ---
    'trackChanges.list': (input) => api.trackChanges.list(input),
    'trackChanges.get': (input) => api.trackChanges.get(input),
    'trackChanges.accept': (input) => api.trackChanges.accept(input),
    'trackChanges.reject': (input) => api.trackChanges.reject(input),
    'trackChanges.acceptAll': (input) => api.trackChanges.acceptAll(input),
    'trackChanges.rejectAll': (input) => api.trackChanges.rejectAll(input),

    // --- capabilities ---
    'capabilities.get': () => api.capabilities(),
  };
}
