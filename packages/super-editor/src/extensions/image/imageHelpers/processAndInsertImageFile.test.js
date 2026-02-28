import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processAndInsertImageFile } from './processAndInsertImageFile.js';
import * as startImageUpload from './startImageUpload.js';

describe('processAndInsertImageFile', () => {
  let checkAndProcessImageSpy;
  let replaceSelectionWithImagePlaceholderSpy;
  let uploadAndInsertImageSpy;

  const createTestFile = (name = 'test.png') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

  const mockParams = () => ({
    file: createTestFile(),
    editor: { options: {}, view: {} },
    view: { state: { tr: {} } },
    editorOptions: {},
    getMaxContentSize: () => ({ width: 800, height: 600 }),
  });

  beforeEach(() => {
    checkAndProcessImageSpy = vi.spyOn(startImageUpload, 'checkAndProcessImage');
    replaceSelectionWithImagePlaceholderSpy = vi.spyOn(startImageUpload, 'replaceSelectionWithImagePlaceholder');
    uploadAndInsertImageSpy = vi.spyOn(startImageUpload, 'uploadAndInsertImage');

    replaceSelectionWithImagePlaceholderSpy.mockImplementation(() => {});
    uploadAndInsertImageSpy.mockResolvedValue(undefined);
  });

  it('returns "success" when the full pipeline completes', async () => {
    const processedFile = createTestFile('processed.png');
    checkAndProcessImageSpy.mockResolvedValue({
      file: processedFile,
      size: { width: 100, height: 100 },
    });

    const params = mockParams();
    const result = await processAndInsertImageFile(params);

    expect(result).toBe('success');
    expect(checkAndProcessImageSpy).toHaveBeenCalledWith({
      file: params.file,
      getMaxContentSize: params.getMaxContentSize,
    });
    expect(replaceSelectionWithImagePlaceholderSpy).toHaveBeenCalledWith({
      view: params.view,
      editorOptions: params.editorOptions,
      id: expect.any(Object),
    });
    expect(uploadAndInsertImageSpy).toHaveBeenCalledWith({
      editor: params.editor,
      view: params.view,
      file: processedFile,
      size: { width: 100, height: 100 },
      id: expect.any(Object),
    });
  });

  it('returns "skipped" when checkAndProcessImage returns a null file', async () => {
    checkAndProcessImageSpy.mockResolvedValue({
      file: null,
      size: { width: 0, height: 0 },
    });

    const result = await processAndInsertImageFile(mockParams());

    expect(result).toBe('skipped');
    expect(replaceSelectionWithImagePlaceholderSpy).not.toHaveBeenCalled();
    expect(uploadAndInsertImageSpy).not.toHaveBeenCalled();
  });

  it('throws when checkAndProcessImage throws', async () => {
    checkAndProcessImageSpy.mockRejectedValue(new Error('processing failed'));

    await expect(processAndInsertImageFile(mockParams())).rejects.toThrow('processing failed');
  });

  it('throws when uploadAndInsertImage throws', async () => {
    checkAndProcessImageSpy.mockResolvedValue({
      file: createTestFile(),
      size: { width: 100, height: 100 },
    });
    uploadAndInsertImageSpy.mockRejectedValue(new Error('upload failed'));

    await expect(processAndInsertImageFile(mockParams())).rejects.toThrow('upload failed');
  });

  it('uses the same placeholder id for both replace and upload steps', async () => {
    const processedFile = createTestFile();
    checkAndProcessImageSpy.mockResolvedValue({
      file: processedFile,
      size: { width: 50, height: 50 },
    });

    await processAndInsertImageFile(mockParams());

    const replaceId = replaceSelectionWithImagePlaceholderSpy.mock.calls[0][0].id;
    const uploadId = uploadAndInsertImageSpy.mock.calls[0][0].id;
    expect(replaceId).toBe(uploadId);
  });
});
