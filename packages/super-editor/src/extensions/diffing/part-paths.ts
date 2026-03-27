const DOCUMENT_RELS_PATH = 'word/_rels/document.xml.rels';

export function toRelsPathForPart(partPath: string): string | null {
  if (partPath === DOCUMENT_RELS_PATH || partPath.endsWith('.rels')) {
    return null;
  }

  const lastSlash = partPath.lastIndexOf('/');
  if (lastSlash < 0 || lastSlash === partPath.length - 1) {
    return null;
  }

  const directory = partPath.slice(0, lastSlash);
  const fileName = partPath.slice(lastSlash + 1);
  return `${directory}/_rels/${fileName}.rels`;
}
