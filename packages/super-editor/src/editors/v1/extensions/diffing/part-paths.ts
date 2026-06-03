import { getWordPartRelsPath } from '../../core/helpers/word-part-path.js';

const DOCUMENT_RELS_PATH = 'word/_rels/document.xml.rels';

export function toRelsPathForPart(partPath: string): string | null {
  if (partPath === DOCUMENT_RELS_PATH || partPath.endsWith('.rels')) {
    return null;
  }

  if (!partPath.includes('/') || partPath.endsWith('/')) {
    return null;
  }

  return getWordPartRelsPath(partPath);
}
