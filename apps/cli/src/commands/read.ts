import { closeDocument, getDocumentText, openDocument } from '../lib/editor';

export interface ReadResult {
  path: string;
  content: string;
}

/**
 * Read a document and output its text content
 */
export async function read(filePath: string): Promise<ReadResult> {
  const doc = await openDocument(filePath);

  try {
    const content = getDocumentText(doc);
    return { path: filePath, content };
  } finally {
    closeDocument(doc);
  }
}
