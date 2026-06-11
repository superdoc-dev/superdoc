// Root marker unit tests.

import { describe, expect, it } from 'vitest';
import { RUNTIME_ROOT_ATTRIBUTE, markRuntimeRoot, readRuntimeRootId, unmarkRuntimeRoot } from './root-marker.js';

describe('editor-runtime root marker', () => {
  it('marks and reads a runtime id off a host element', () => {
    const root = document.createElement('div');
    markRuntimeRoot(root, 'runtime-1');
    expect(root.getAttribute(RUNTIME_ROOT_ATTRIBUTE)).toBe('runtime-1');
    expect(readRuntimeRootId(root)).toBe('runtime-1');
  });

  it('unmarks a runtime root', () => {
    const root = document.createElement('div');
    markRuntimeRoot(root, 'runtime-1');
    unmarkRuntimeRoot(root);
    expect(root.hasAttribute(RUNTIME_ROOT_ATTRIBUTE)).toBe(false);
    expect(readRuntimeRootId(root)).toBeNull();
  });

  it('reads the attribute off the given element only  -  it does not walk ancestors', () => {
    const root = document.createElement('div');
    markRuntimeRoot(root, 'runtime-1');
    const child = document.createElement('span');
    root.appendChild(child);
    // The child has no attribute of its own.
    expect(readRuntimeRootId(child)).toBeNull();
  });

  it('returns null for a null element', () => {
    expect(readRuntimeRootId(null)).toBeNull();
  });

  it('re-marking overwrites the previous id', () => {
    const root = document.createElement('div');
    markRuntimeRoot(root, 'runtime-1');
    markRuntimeRoot(root, 'runtime-2');
    expect(readRuntimeRootId(root)).toBe('runtime-2');
  });
});
