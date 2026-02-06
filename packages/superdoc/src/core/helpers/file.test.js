import { describe, it, expect } from 'vitest';
import { extractBrowserFile, normalizeDocumentEntry } from './file.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('extractBrowserFile', () => {
  it('returns the same File instance when given a File', () => {
    const f = new File([new Blob(['abc'], { type: 'text/plain' })], 'note.txt', { type: 'text/plain' });
    const out = extractBrowserFile(f);
    expect(out).toBeInstanceOf(File);
    expect(out).toBe(f);
  });

  it('wraps a Blob into a File with default name', () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    const out = extractBrowserFile(blob);
    expect(out).toBeInstanceOf(File);
    expect(out.name).toBe('document');
    expect(out.type).toBe('application/pdf');
  });

  it('unwraps wrapper object via originFileObj', () => {
    const inner = new File([new Blob(['x'], { type: DOCX })], 'report.docx', { type: DOCX });
    const uploadFile = { uid: 'abc123', name: 'report.docx', originFileObj: inner };
    const out = extractBrowserFile(uploadFile);
    expect(out).toBe(inner);
  });

  it('unwraps objects using `file` or `raw` keys', () => {
    const inner = new File([new Blob(['x'], { type: DOCX })], 'a.docx', { type: DOCX });
    expect(extractBrowserFile({ file: inner })).toBe(inner);
    expect(extractBrowserFile({ raw: inner })).toBe(inner);
  });

  it('ignores uid and other extra props on File', () => {
    const rc = new File([new Blob(['x'], { type: DOCX })], 'b.docx', { type: DOCX });
    // simulate uploader adding uid
    // @ts-ignore
    rc.uid = 'rc-1';
    const out = extractBrowserFile(rc);
    expect(out).toBe(rc);
    expect(out.name).toBe('b.docx');
  });

  it('returns null for falsy inputs', () => {
    expect(extractBrowserFile(null)).toBeNull();
    expect(extractBrowserFile(undefined)).toBeNull();
  });
});

describe('normalizeDocumentEntry', () => {
  it('normalizes a plain File to document entry', () => {
    const f = new File([new Blob(['x'], { type: DOCX })], 'doc.docx', { type: DOCX });
    const out = normalizeDocumentEntry(f);
    expect(out).toMatchObject({
      name: 'doc.docx',
      type: DOCX,
    });
    // isNewFile is not set by normalizeDocumentEntry - the Editor determines this
    // automatically based on whether content was provided
    expect(out.isNewFile).toBeUndefined();
    expect(out.data).toBeInstanceOf(File);
    expect(out.data).toBe(f);
  });

  it('infers type from filename when file.type is empty', () => {
    const f = new File([new Blob(['x'], { type: '' })], 'report.docx', { type: '' });
    const out = normalizeDocumentEntry(f);
    expect(out.type).toBe(DOCX);
  });

  it('wraps Blob and sets default name', () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    const out = normalizeDocumentEntry(blob);
    expect(out.type).toBe('application/pdf');
    expect(out.data).toBeInstanceOf(File);
    expect(out.name).toBe('document');
  });

  it('normalizes wrapper with originFileObj into document entry', () => {
    const inner = new File([new Blob(['x'], { type: DOCX })], 'x.docx', { type: DOCX });
    const uploadFile = { uid: 'u1', originFileObj: inner };
    const out = normalizeDocumentEntry(uploadFile);
    expect(out.data).toBe(inner);
    expect(out.type).toBe(DOCX);
    expect(out.name).toBe('x.docx');
  });

  it('normalizes config objects with `data` wrapper', () => {
    const inner = new File([new Blob(['x'], { type: DOCX })], 'wrapped.docx', { type: DOCX });
    const cfg = { data: { originFileObj: inner }, name: 'prefer-this-name.docx' };
    const out = normalizeDocumentEntry(cfg);
    expect(out.data).toBe(inner);
    expect(out.name).toBe('prefer-this-name.docx');
    expect(out.type).toBe(DOCX);
  });

  it('passes through URL-based entries unchanged', () => {
    const cfg = { url: 'https://example.com/test.docx', type: 'docx', name: 'url.docx' };
    const out = normalizeDocumentEntry(cfg);
    expect(out).toBe(cfg);
  });
});
