import { describe, it, expect, afterEach, vi } from 'vitest';
import { base64ToFile, getBase64FileMeta } from './handleBase64.js';

const base64ForPayload = (payload, mime = 'image/png') =>
  `data:${mime};base64,${Buffer.from(payload).toString('base64')}`;

describe('handleBase64', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converts base64 data into a File with hashed filename using atob', () => {
    vi.stubGlobal('atob', (encoded) => Buffer.from(encoded, 'base64').toString('binary'));

    const payload = 'fake-image-payload';
    const base64 = base64ForPayload(payload, 'image/png');

    const file = base64ToFile(base64);

    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/png');
    expect(file.name).toMatch(/^image-\d+\.png$/);
    expect(file.size).toBe(Buffer.byteLength(payload));
  });

  it('falls back to Buffer decoding when atob is unavailable', () => {
    // Ensure atob is not defined so Buffer path is used
    vi.stubGlobal('atob', undefined);

    const payload = 'buffer-only-payload';
    const base64 = base64ForPayload(payload, 'image/jpeg');

    const file = base64ToFile(base64);

    expect(file.type).toBe('image/jpeg');
    expect(file.name).toMatch(/^image-\d+\.jpeg$/);
    expect(file.size).toBe(Buffer.byteLength(payload));
  });

  it('throws when neither atob nor Buffer are available', () => {
    const base64 = base64ForPayload('missing-decoders', 'image/png');

    vi.stubGlobal('atob', undefined);
    vi.stubGlobal('Buffer', undefined);

    expect(() => base64ToFile(base64)).toThrow('Unable to decode base64 payload in the current environment.');
  });

  it('returns matching metadata for base64 payloads', () => {
    vi.stubGlobal('atob', (encoded) => Buffer.from(encoded, 'base64').toString('binary'));

    const payload = 'another-fake-image';
    const base64 = base64ForPayload(payload, 'image/jpeg');

    const { filename, mimeType } = getBase64FileMeta(base64);
    const file = base64ToFile(base64);

    expect(mimeType).toBe('image/jpeg');
    expect(filename).toBe(file.name);
  });

  it('defaults metadata when mime data is missing', () => {
    vi.stubGlobal('atob', (encoded) => Buffer.from(encoded, 'base64').toString('binary'));

    const payload = 'no-mime-data';
    const base64 = `data:;base64,${Buffer.from(payload).toString('base64')}`;

    const { filename, mimeType } = getBase64FileMeta(base64);
    const file = base64ToFile(base64);

    expect(mimeType).toBe('application/octet-stream');
    expect(filename).toBe(file.name);
    expect(file.type).toBe('application/octet-stream');
  });
});
