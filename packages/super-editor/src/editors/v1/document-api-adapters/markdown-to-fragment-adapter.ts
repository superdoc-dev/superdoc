/**
 * Markdown-to-SDFragment adapter — bridges the markdown parsing pipeline
 * with the SDM/1 projection layer.
 *
 * Flow: Markdown string → mdast → PM nodes → SDContentNode[]
 */

import type { Editor } from '../core/Editor.js';
import type {
  MarkdownToFragmentInput,
  SDMarkdownToFragmentResult,
  SDDiagnostic,
  SDContentNode,
} from '@superdoc/document-api';
import { markdownToPmFragment } from '../core/helpers/markdown/markdownToPmContent.js';
import { projectContentNode } from './helpers/sd-projection.js';
import type { MarkdownDiagnostic } from '../core/helpers/markdown/types.js';

/**
 * Converts a Markdown string into an SDM/1 fragment by parsing through the
 * ProseMirror pipeline and projecting the resulting nodes.
 */
export function markdownToFragmentAdapter(editor: Editor, input: MarkdownToFragmentInput): SDMarkdownToFragmentResult {
  const { fragment, diagnostics: mdDiagnostics } = markdownToPmFragment(input.markdown, editor);

  // Project each PM node to an SDContentNode
  const sdNodes: SDContentNode[] = [];
  for (let i = 0; i < fragment.childCount; i++) {
    sdNodes.push(projectContentNode(fragment.child(i)));
  }

  // Bridge markdown diagnostics to SDDiagnostic format
  const diagnostics = mdDiagnostics.map(bridgeDiagnostic);

  // Lossy if any diagnostics indicate unsupported constructs
  const lossy = diagnostics.some((d) => d.severity === 'warning' || d.severity === 'error');

  return {
    fragment: sdNodes.length === 1 ? sdNodes[0] : sdNodes,
    lossy,
    diagnostics,
  };
}

/** Maps a MarkdownDiagnostic to an SDDiagnostic. */
function bridgeDiagnostic(md: MarkdownDiagnostic): SDDiagnostic {
  return {
    code: `MD_${md.nodeType.toUpperCase()}`,
    severity: md.severity === 'error' ? 'error' : 'warning',
    message: md.message,
    ...(md.position ? { path: [`line:${md.position.line}`, `col:${md.position.column}`] } : {}),
  };
}
