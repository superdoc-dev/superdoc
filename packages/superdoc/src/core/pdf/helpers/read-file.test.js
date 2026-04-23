import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileAsArrayBuffer } from './read-file.js';

describe('readFileAsArrayBuffer', () => {
  class FakeReader {
    constructor() {
      this.onload = null;
      this.onerror = null;
    }
    readAsDataURL() {
      this._invoke();
    }
  }

  const originalFileReader = globalThis.FileReader;

  beforeEach(() => {
    globalThis.FileReader = FakeReader;
  });

  afterEach(() => {
    globalThis.FileReader = originalFileReader;
  });

  it('resolves with the reader result on load', async () => {
    FakeReader.prototype._invoke = function () {
      queueMicrotask(() => this.onload({ target: { result: 'data:url' } }));
    };
    const blob = new Blob(['abc']);
    await expect(readFileAsArrayBuffer(blob)).resolves.toBe('data:url');
  });

  it('rejects when the reader emits an error', async () => {
    FakeReader.prototype._invoke = function () {
      queueMicrotask(() => this.onerror(new Error('bad read')));
    };
    const blob = new Blob(['abc']);
    await expect(readFileAsArrayBuffer(blob)).rejects.toThrow('bad read');
  });
});
