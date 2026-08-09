import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createDownload, cleanName } from './export.js';

describe('createDownload', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalCreateElement = document.createElement;
  const originalAppendChild = document.body.appendChild;
  const originalRemoveChild = document.body.removeChild;
  let clickMock;

  beforeEach(() => {
    vi.useFakeTimers();
    clickMock = vi.fn();
    // Stub DOM APIs so createDownload can run without touching the real browser environment.
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    document.createElement = vi.fn(() => ({ href: '', download: '', click: clickMock }));
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    document.createElement = originalCreateElement;
    document.body.appendChild = originalAppendChild;
    document.body.removeChild = originalRemoveChild;
  });

  it('converts ArrayBuffer-like inputs into a Blob before downloading', () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;

    // ArrayBuffer should become a DOCX Blob so we can pipe the download through URL APIs.
    const blob = createDownload(buffer, 'Document', 'docx');

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const createdBlob = URL.createObjectURL.mock.calls[0][0];
    expect(createdBlob).toBeInstanceOf(Blob);
    expect(createdBlob.size).toBe(3);
    expect(createdBlob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(blob).toBe(createdBlob);
    expect(document.body.appendChild).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledTimes(1);

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('passes Blob inputs through unchanged', () => {
    const input = new Blob(['hello'], { type: 'text/plain' });
    const result = createDownload(input, 'notes', 'txt');

    expect(result).toBe(input);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const createdBlob = URL.createObjectURL.mock.calls[0][0];
    expect(createdBlob).toBe(input);
  });

  it('wraps string input with the correct mime type', () => {
    const result = createDownload('payload', 'data', 'json');

    expect(result).toBeInstanceOf(Blob);
    const createdBlob = URL.createObjectURL.mock.calls[0][0];
    expect(createdBlob.type).toBe('application/json');
    expect(createdBlob.size).toBe(result.size);
  });

  it('supports ArrayBufferView inputs by slicing the view', () => {
    const buffer = new ArrayBuffer(6);
    const view = new Uint8Array(buffer, 1, 4);
    view.set([10, 20, 30, 40]);

    const result = createDownload(view, 'snippet', 'txt');

    expect(result).toBeInstanceOf(Blob);
    const createdBlob = URL.createObjectURL.mock.calls[0][0];
    expect(createdBlob.size).toBe(4);
    expect(createdBlob.type).toBe('text/plain;charset=utf-8');
  });

  it('throws for nullish inputs', () => {
    expect(() => createDownload(null, 'invalid', 'docx')).toThrow(TypeError);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

describe('cleanName', () => {
  it('strips known export extensions', () => {
    expect(cleanName('Report.docx')).toBe('Report');
    expect(cleanName('contract.PDF')).toBe('contract');
  });

  it('leaves unrelated extensions unchanged', () => {
    expect(cleanName('spreadsheet.xlsx')).toBe('spreadsheet.xlsx');
    expect(cleanName('plain-text.txt')).toBe('plain-text.txt');
  });
});
