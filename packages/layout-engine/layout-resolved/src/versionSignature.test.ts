import { describe, expect, it } from 'vitest';
import { sourceAnchorSignature } from './versionSignature.js';
import type { SourceAnchor } from '@superdoc/contracts';

describe('sourceAnchorSignature', () => {
  it('is stable for equivalent source anchors with different object key order', () => {
    const anchorA: SourceAnchor = {
      sourceNodeId: 'srcnode_1',
      occurrenceId: 'occ_1',
      schemaQNames: [{ qName: 'w:p', namespaceUri: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main' }],
      sourceRef: {
        partUri: 'word/document.xml',
        xpathLikePath: '/w:document[1]/w:body[1]/w:p[1]',
      },
      anchorConfidence: 'high',
    };
    const anchorB: SourceAnchor = {
      anchorConfidence: 'high',
      sourceRef: {
        xpathLikePath: '/w:document[1]/w:body[1]/w:p[1]',
        partUri: 'word/document.xml',
      },
      schemaQNames: [{ namespaceUri: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', qName: 'w:p' }],
      occurrenceId: 'occ_1',
      sourceNodeId: 'srcnode_1',
    };

    expect(sourceAnchorSignature(anchorA)).toBe(sourceAnchorSignature(anchorB));
  });
});
