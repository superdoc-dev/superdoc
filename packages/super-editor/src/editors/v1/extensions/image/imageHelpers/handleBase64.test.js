import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('uses shared url-validation helpers directly instead of converter helpers', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/editors/v1/extensions/image/imageHelpers/handleBase64.js'),
      'utf8',
    );

    expect(source).toContain("from '@superdoc/url-validation'");
    expect(source).not.toContain("from '@converter/helpers/mediaHelpers.js'");
  });

  it('falls back to Buffer decoding when atob is unavailable', () => {
    // Ensure atob is not defined so Buffer path is used
    vi.stubGlobal('atob', undefined);

    const payload = 'buffer-only-payload';
    const base64 = base64ForPayload(payload, 'image/jpeg');

    const file = base64ToFile(base64);

    expect(file.type).toBe('image/jpeg');
    expect(file.name).toMatch(/^image-\d+\.jpg$/);
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

  it('normalizes svg+xml data URI filenames to .svg', () => {
    vi.stubGlobal('atob', (encoded) => Buffer.from(encoded, 'base64').toString('binary'));

    const payload = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" />';
    const base64 = base64ForPayload(payload, 'image/svg+xml');

    const { filename, mimeType } = getBase64FileMeta(base64);
    const file = base64ToFile(base64);

    expect(mimeType).toBe('image/svg+xml');
    expect(filename).toBe(file.name);
    expect(file.name).toMatch(/^image-\d+\.svg$/);
    expect(file.type).toBe('image/svg+xml');
  });

  it('normalizes svg+xml MIME casing for filenames', () => {
    vi.stubGlobal('atob', (encoded) => Buffer.from(encoded, 'base64').toString('binary'));

    const payload = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" />';
    const base64 = base64ForPayload(payload, 'Image/SVG+XML');

    const { filename, mimeType } = getBase64FileMeta(base64);
    const file = base64ToFile(base64);

    expect(mimeType).toBe('Image/SVG+XML');
    expect(filename).toBe(file.name);
    expect(file.name).toMatch(/^image-\d+\.svg$/);
    expect(file.type).toBe('image/svg+xml');
  });

  it('handles non-base64 svg data URI filenames', async () => {
    const payload = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" />';
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(payload)}`;

    const { filename, mimeType } = getBase64FileMeta(dataUri);
    const file = base64ToFile(dataUri);

    expect(mimeType).toBe('image/svg+xml');
    expect(filename).toBe(file.name);
    expect(file.name).toMatch(/^image-\d+\.svg$/);
    expect(file.type).toBe('image/svg+xml');
    await expect(file.text()).resolves.toBe(payload);
  });

  it('returns null when non-base64 payload percent decoding fails', () => {
    const dataUri = 'data:image/svg+xml,%';

    const file = base64ToFile(dataUri);

    expect(file).toBeNull();
  });

  it('returns null for data URIs without a payload separator', () => {
    const file = base64ToFile('data:image/svg+xml');

    expect(file).toBeNull();
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
