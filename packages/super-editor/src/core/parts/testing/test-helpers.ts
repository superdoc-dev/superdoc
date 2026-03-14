/**
 * Test factory helpers for the parts system.
 *
 * New tests written during migration phases should use these helpers.
 * Existing tests are migrated opportunistically.
 */

import type { PartId, PartDescriptor } from '../types.js';
import { registerPartDescriptor, clearPartDescriptors } from '../registry/part-registry.js';
import { clearInvalidationHandlers } from '../invalidation/part-invalidation-registry.js';

interface MockConverterOptions {
  convertedXml?: Record<string, unknown>;
  documentModified?: boolean;
  documentGuid?: string | null;
}

/** Creates a minimal mock editor with a converter suitable for parts system testing. */
export function createTestEditor(opts: MockConverterOptions = {}) {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  return {
    converter: {
      convertedXml: opts.convertedXml ?? {},
      documentModified: opts.documentModified ?? false,
      documentGuid: opts.documentGuid ?? 'test-guid',
      promoteToGuid() {
        this.documentGuid = 'promoted-guid';
        return this.documentGuid;
      },
    },
    options: {
      collaborationProvider: null,
      ydoc: null,
    },
    state: { tr: {} },
    view: undefined,
    on(name: string, fn: (...args: unknown[]) => void) {
      const list = listeners.get(name) ?? [];
      list.push(fn);
      listeners.set(name, list);
    },
    emit(name: string, ...args: unknown[]) {
      const list = listeners.get(name);
      if (list) {
        for (const fn of list) fn(...args);
      }
    },
    safeEmit(name: string, ...args: unknown[]): Error[] {
      const list = listeners.get(name);
      if (!list) return [];
      const errors: Error[] = [];
      for (const fn of list) {
        try {
          fn(...args);
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }
      }
      return errors;
    },
    off(name: string, fn?: (...args: unknown[]) => void) {
      if (!fn) {
        listeners.delete(name);
      } else {
        const list = listeners.get(name) ?? [];
        listeners.set(
          name,
          list.filter((f) => f !== fn),
        );
      }
    },
    /** Test-only: get all listeners for an event. */
    getListeners(name: string) {
      return listeners.get(name) ?? [];
    },
  };
}

/** Registers a part into the test editor's convertedXml. */
export function withPart(editor: ReturnType<typeof createTestEditor>, partId: PartId, data: unknown): void {
  editor.converter.convertedXml[partId] = data;
}

/** Registers a minimal part descriptor for testing. */
export function withDescriptor<TPart>(descriptor: PartDescriptor<TPart>): void {
  registerPartDescriptor(descriptor);
}

/** Cleans up all test registrations. Call in afterEach. */
export function cleanupParts(): void {
  clearPartDescriptors();
  clearInvalidationHandlers();
}

/**
 * Patch an existing mock editor to work with the parts system.
 *
 * Adds `convertedXml`, `documentModified`, `documentGuid`, and `safeEmit`
 * if missing. Also populates `convertedXml['word/numbering.xml']` from
 * the mock's `converter.numbering` if present.
 */
export function patchMockForParts(mockEditor: any): void {
  const converter = mockEditor.converter;
  if (!converter) return;

  if (!converter.convertedXml) converter.convertedXml = {};
  if (!('documentModified' in converter)) converter.documentModified = false;
  if (!('documentGuid' in converter)) converter.documentGuid = null;

  // Populate numbering XML from the live numbering model
  if (converter.numbering && !converter.convertedXml['word/numbering.xml']) {
    const abstracts = Object.values(converter.numbering.abstracts ?? {});
    const definitions = Object.values(converter.numbering.definitions ?? {});
    converter.convertedXml['word/numbering.xml'] = {
      elements: [{ type: 'element', name: 'w:numbering', elements: [...abstracts, ...definitions] }],
    };
  }

  if (!mockEditor.safeEmit) {
    mockEditor.safeEmit = (...args: any[]) => {
      try {
        mockEditor.emit?.(...args);
      } catch {
        // ignore in tests
      }
      return [];
    };
  }
}
