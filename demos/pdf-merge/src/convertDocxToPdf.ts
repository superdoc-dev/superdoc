const CONVERT_ENDPOINT = 'https://api.superdoc.dev/v1/convert?from=docx';

export async function convertDocxToPdf(
  docxBuffer: ArrayBuffer,
  filename: string,
  apiKey: string
): Promise<ArrayBuffer> {
  const formData = new FormData();
  formData.append('file', new Blob([docxBuffer]), filename);

  const response = await fetch(CONVERT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Conversion failed: ${error.message || response.statusText}`);
  }

  return response.arrayBuffer();
}
