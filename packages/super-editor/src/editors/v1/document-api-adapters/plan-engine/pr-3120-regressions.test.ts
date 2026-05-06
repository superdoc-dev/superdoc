import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { PlanReceipt } from '@superdoc/document-api';

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: vi.fn((_editor: Editor, handler: () => boolean): PlanReceipt => {
    const applied = handler();
    return {
      success: true,
      revision: { before: '0', after: '0' },
      steps: [
        {
          stepId: 'step-1',
          op: 'domain.command',
          effect: applied ? 'changed' : 'noop',
          matchCount: applied ? 1 : 0,
          data: { domain: 'command', commandDispatched: applied },
        },
      ],
      timing: { totalMs: 0 },
    };
  }),
}));

import {
  applyTocPatch,
  serializeTocInstruction,
  parseTocInstruction,
} from '../../core/super-converter/field-references/shared/toc-switches.js';
import { tocUpdateWrapper } from './toc-wrappers.js';

type NodeOptions = {
  attrs?: Record<string, unknown>;
  text?: string;
  isInline?: boolean;
  isBlock?: boolean;
  isLeaf?: boolean;
  inlineContent?: boolean;
  nodeSize?: number;
  marks?: Array<{ type: string | { name: string } }>;
};

function createNode(typeName: string, children: ProseMirrorNode[] = [], options: NodeOptions = {}): ProseMirrorNode {
  const attrs = options.attrs ?? {};
  const text = options.text ?? '';
  const isText = typeName === 'text';
  const isInline = options.isInline ?? isText;
  const isBlock = options.isBlock ?? !isInline;
  const marks = (options.marks ?? []).map((m) => {
    const name = typeof m.type === 'string' ? m.type : m.type.name;
    return { type: { name } };
  });
  const node: any = {
    type: { name: typeName, isInline, isBlock, isText },
    attrs,
    text,
    isText,
    isBlock,
    isInline,
    isLeaf: options.isLeaf ?? (isText || children.length === 0),
    inlineContent: options.inlineContent ?? false,
    nodeSize: options.nodeSize ?? (isText ? text.length : 1),
    childCount: children.length,
    children,
    marks,
    forEach(cb: (child: ProseMirrorNode, offset: number, index: number) => void) {
      let off = 0;
      children.forEach((c, i) => {
        cb(c, off, i);
        off += (c as any).nodeSize ?? 1;
      });
    },
    descendants(cb: (n: ProseMirrorNode, pos: number, parent: ProseMirrorNode | null) => boolean | void) {
      const walk = (n: any, pos: number, parent: any) => {
        const r = cb(n, pos, parent);
        if (r === false) return;
        let off = pos + (n.isText ? 0 : 1);
        (n.children ?? []).forEach((c: any) => {
          walk(c, off, n);
          off += c.nodeSize ?? 1;
        });
      };
      (children ?? []).forEach((c: any, i: number) => {
        walk(c, i, node);
      });
    },
    toJSON() {
      const out: any = { type: typeName };
      if (Object.keys(attrs).length > 0) out.attrs = attrs;
      if (isText && text) out.text = text;
      if (marks.length > 0) {
        out.marks = marks.map((m: any) => ({ type: m.type.name }));
      }
      if (children.length > 0) {
        out.content = children.map((c: any) => c.toJSON());
      }
      return out;
    },
    nodeAt() {
      return null;
    },
    cut() {
      return node;
    },
    resolve() {
      return null;
    },
  };
  // expose firstChild / lastChild
  Object.defineProperty(node, 'firstChild', { get: () => children[0] ?? null });
  Object.defineProperty(node, 'lastChild', { get: () => children[children.length - 1] ?? null });
  return node as ProseMirrorNode;
}

describe('PR-3120 regression — finding 1: tabLeader: "none" must round-trip', () => {
  it('survives applyTocPatch → serialize → parse back to none', () => {
    // Start from a TOC with hyphen leader (so we have a separator to clear)
    const initial = parseTocInstruction('TOC \\o "1-3" \\p "-"');
    expect(initial.display.tabLeader).toBe('hyphen');
    expect(initial.display.separator).toBe('-');

    // User sets explicit no-leader
    const configured = applyTocPatch(initial, { tabLeader: 'none' });
    expect(configured.display.tabLeader).toBe('none');

    // Serialize → store on the node → reopen → parse back
    const serialized = serializeTocInstruction(configured);
    const reparsed = parseTocInstruction(serialized);

    // BUG: reparsed.display.tabLeader is undefined here, not 'none'.
    // The 'none' signal is lost because serializeTocInstruction skips \p when
    // separator is missing, and parseTocInstruction has no way to distinguish
    // "no \p" (default = dots) from "explicit none" without a marker.
    expect(reparsed.display.tabLeader).toBe('none');
  });

  it('configuring tabLeader: "none" on a default-leader TOC must not silently no-op', () => {
    // Start from the default TOC (no \p)
    const initial = parseTocInstruction('TOC \\o "1-3"');
    expect(initial.display.tabLeader).toBeUndefined();
    expect(initial.display.separator).toBeUndefined();

    const configured = applyTocPatch(initial, { tabLeader: 'none' });
    expect(configured.display.tabLeader).toBe('none');

    // BUG: serialization is identical to the original (both omit \p), so the
    // wrapper's areTocConfigsEqual will report NO_OP and the user's setting
    // never reaches the stored instruction.
    const initialSerialized = serializeTocInstruction(initial);
    const configuredSerialized = serializeTocInstruction(configured);
    expect(configuredSerialized).not.toBe(initialSerialized);
  });
});

describe('PR-3120 regression — finding 2: pageNumbers scanner must traverse run-wrapped page-number text', () => {
  // The mode:'all' rebuild produces paragraphs whose content is [run, run, run]
  // where the page-number text is *nested inside* the third run. The scanner
  // currently inspects only immediate paragraph children, so it misses the mark
  // and reports PAGE_NUMBERS_NOT_MATERIALIZED.

  it('finds tocPageNumber when the marked text is nested inside a run wrapper', () => {
    // Build a paragraph that mirrors the rebuild output:
    //   paragraph
    //     run  ← immediate child, no marks
    //       text "Heading 1"
    //     run  ← immediate child, no marks
    //       tab
    //     run  ← immediate child, no marks
    //       text "0" with marks=[{type:'tocPageNumber'}]
    const titleText = createNode('text', [], { text: 'Heading 1' });
    const titleRun = createNode('run', [titleText], {
      isInline: true,
      inlineContent: true,
    });
    const tabText = createNode('text', [], { text: '\t' });
    const tabRun = createNode('run', [tabText], {
      isInline: true,
      inlineContent: true,
    });
    const pageNumText = createNode('text', [], {
      text: '0',
      marks: [{ type: 'tocPageNumber' }],
    });
    const pageNumRun = createNode('run', [pageNumText], {
      isInline: true,
      inlineContent: true,
    });
    const entryParagraph = createNode('paragraph', [titleRun, tabRun, pageNumRun], {
      attrs: {
        sdBlockId: 'toc-entry-p1',
        paragraphProperties: { styleId: 'TOC1' },
        tocSourceId: 'h-1',
      },
      isBlock: true,
      inlineContent: true,
    });
    const tocNode = createNode('tableOfContents', [entryParagraph], {
      attrs: { sdBlockId: 'toc-1', instruction: 'TOC \\o "1-3" \\h \\z' },
      isBlock: true,
    });
    const heading = createNode('paragraph', [createNode('text', [], { text: 'Heading 1' })], {
      attrs: { sdBlockId: 'h-1', paragraphProperties: { styleId: 'Heading1' } },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [tocNode, heading], { isBlock: false });

    const editor = {
      state: { doc, schema: { nodes: { paragraph: { create: vi.fn() }, tableOfContents: {} } } },
      commands: {
        insertTableOfContentsAt: vi.fn(() => true),
        setTableOfContentsInstructionById: vi.fn(() => true),
        replaceTableOfContentsContentById: vi.fn(() => true),
        deleteTableOfContentsById: vi.fn(() => true),
      },
      schema: { marks: {} },
      options: {},
      storage: {
        tableOfContents: {
          pageMap: new Map([['h-1', 7]]),
          pageMapDoc: doc,
        },
      },
      on: () => {},
    } as unknown as Editor;

    const tocTarget = { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' } as const;
    const result = tocUpdateWrapper(editor, { target: tocTarget, mode: 'pageNumbers' }, { changeMode: 'direct' });

    // BUG: the scanner inspects only immediate paragraph children (run nodes,
    // which carry no marks here) and misses the nested tocPageNumber mark on
    // the text inside the third run. So it reports PAGE_NUMBERS_NOT_MATERIALIZED
    // even though the marks ARE in the entry, just one level deeper.
    expect(result.success).toBe(true);
  });
});
