import type { Editor } from '../../core/Editor.js';
import { getBodySectPrFromEditor, type SectionProjection } from './sections-resolver.js';
import type { XmlElement } from './sections-xml.js';
import type { Node as ProseMirrorNode } from 'prosemirror-model';

function readParagraphSectPr(node: ProseMirrorNode): XmlElement | null {
  const attrs = (node.attrs ?? {}) as {
    paragraphProperties?: {
      sectPr?: unknown;
    };
  };
  const sectPr = attrs.paragraphProperties?.sectPr;
  return sectPr && typeof sectPr === 'object' ? (sectPr as XmlElement) : null;
}

/** Read the raw sectPr XML element for a given section projection. */
export function readTargetSectPr(editor: Editor, projection: SectionProjection): XmlElement | null {
  if (projection.target.kind === 'paragraph') {
    return readParagraphSectPr(projection.target.node);
  }
  return getBodySectPrFromEditor(editor);
}
