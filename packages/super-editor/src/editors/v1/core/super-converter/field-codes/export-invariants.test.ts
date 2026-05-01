/**
 * Negative export assertions — release-safety net per the OOXML round-trip
 * review. None of these claim positive correctness; they assert that the
 * export pipeline cannot produce known-bad outputs that earlier review
 * passes flagged as risk surface for this PR:
 *
 *   1. No element exports `fieldInstance="[object Object]"`.
 *      A FieldInstance is a JS object stored on PM attrs and intermediate
 *      OOXML elements; if it leaks into final OOXML attributes, the XML
 *      serializer writes the JS toString.
 *
 *   2. No internal `sd:*` carrier element names leak into final OOXML.
 *      Word and other consumers do not understand `sd:rawField`,
 *      `sd:sequenceField`, etc. These are PM-side carriers; export must
 *      lower them to `w:fldChar` / `w:fldSimple` envelopes.
 *
 *   3. Unsupported unedited fields preserve their original OOXML subtree
 *      via passthrough (rawField translator decision rule).
 *
 *   4. Block-spanning unsupported fields are NOT wrapped in an inline-only
 *      sd:rawField at the import boundary.
 */

import { describe, expect, it } from 'vitest';
import { defaultNodeListHandler } from '../v2/importer/docxImporter.js';
import { preProcessNodesForFldChar } from './preProcessNodesForFldChar.js';
import { exportSchemaToJson } from '../exporter.js';

type AnyNode = {
  type?: string;
  name?: string;
  attrs?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  content?: AnyNode[];
  elements?: AnyNode[];
};

function importBody(elements: unknown[]): AnyNode[] {
  const { processedNodes } = preProcessNodesForFldChar(elements as never[], {});
  const nodeListHandler = defaultNodeListHandler();
  const result = nodeListHandler.handler({
    nodes: processedNodes,
    docx: {},
    converter: {},
    insideTrackChange: undefined,
    numbering: undefined,
    translatedNumbering: undefined,
    translatedLinkedStyles: undefined,
    editor: undefined,
    filename: undefined,
    parentStyleId: undefined,
    lists: undefined,
    inlineDocumentFonts: undefined,
    path: [],
  });
  return (result ?? []) as AnyNode[];
}

function exportPmNodes(pmNodes: AnyNode[]): AnyNode[] {
  const out: AnyNode[] = [];
  for (const n of pmNodes) {
    const exported = exportSchemaToJson({ node: n });
    if (Array.isArray(exported)) out.push(...(exported as AnyNode[]));
    else if (exported) out.push(exported as AnyNode);
  }
  return out;
}

function walkOoxml(node: AnyNode | null | undefined, visit: (n: AnyNode) => void): void {
  if (!node || typeof node !== 'object') return;
  visit(node);
  if (Array.isArray(node.elements)) for (const c of node.elements) walkOoxml(c, visit);
}

function findFirstByType(node: AnyNode, type: string): AnyNode | null {
  if (!node) return null;
  if (node.type === type) return node;
  if (Array.isArray(node.content)) {
    for (const c of node.content) {
      const hit = findFirstByType(c, type);
      if (hit) return hit;
    }
  }
  return null;
}

const fldChar = (kind: 'begin' | 'separate' | 'end', extra?: Record<string, string>) => ({
  name: 'w:r',
  elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': kind, ...(extra ?? {}) } }],
});
const instrText = (text: string) => ({
  name: 'w:r',
  elements: [{ name: 'w:instrText', elements: [{ type: 'text', text }] }],
});
const resultText = (text: string) => ({
  name: 'w:r',
  elements: [{ name: 'w:t', elements: [{ type: 'text', text }] }],
});

describe('export invariants — DOCX fidelity safety net', () => {
  describe('no fieldInstance JS object leaks into XML attributes', () => {
    it('rawField passthrough: exported subtree carries no fieldInstance attr', () => {
      const body = [
        {
          name: 'w:p',
          elements: [
            fldChar('begin'),
            instrText('CUSTOMFIELD foo'),
            fldChar('separate'),
            resultText('value'),
            fldChar('end'),
          ],
        },
      ];
      const pm = importBody(body);
      const rawField = findFirstByType(pm[0], 'rawField');
      expect(rawField).toBeTruthy();

      const exported = exportPmNodes([rawField!]);
      walkOoxml({ name: 'wrap', elements: exported as AnyNode[] }, (n) => {
        if (n.attributes && Object.prototype.hasOwnProperty.call(n.attributes, 'fieldInstance')) {
          throw new Error(`fieldInstance attribute leaked into exported OOXML on element ${n.name}`);
        }
      });
    });

    it('typed field nodes (page-number, sequenceField, ...) export with no fieldInstance attr', () => {
      const families: Array<[string, () => AnyNode[]]> = [
        [
          'PAGE',
          () => [
            {
              name: 'w:p',
              elements: [fldChar('begin'), instrText('PAGE'), fldChar('separate'), resultText('5'), fldChar('end')],
            },
          ],
        ],
        [
          'NUMPAGES',
          () => [
            {
              name: 'w:p',
              elements: [
                fldChar('begin'),
                instrText('NUMPAGES'),
                fldChar('separate'),
                resultText('10'),
                fldChar('end'),
              ],
            },
          ],
        ],
        [
          'SEQ',
          () => [
            {
              name: 'w:p',
              elements: [
                fldChar('begin'),
                instrText('SEQ Figure \\* ARABIC'),
                fldChar('separate'),
                resultText('1'),
                fldChar('end'),
              ],
            },
          ],
        ],
        [
          'REF',
          () => [
            {
              name: 'w:p',
              elements: [
                fldChar('begin'),
                instrText('REF _Ref123 \\h'),
                fldChar('separate'),
                resultText('See section 1'),
                fldChar('end'),
              ],
            },
          ],
        ],
      ];
      for (const [family, build] of families) {
        const pm = importBody(build());
        const exported = exportPmNodes(pm);
        walkOoxml({ name: 'wrap', elements: exported as AnyNode[] }, (n) => {
          if (n.attributes && Object.prototype.hasOwnProperty.call(n.attributes, 'fieldInstance')) {
            throw new Error(`${family}: fieldInstance attribute leaked into exported OOXML on element ${n.name}`);
          }
        });
      }
    });
  });

  describe('no internal sd:* carrier names leak into final OOXML', () => {
    it('rawField export emits w:fldChar / w:r / w:t — never sd:rawField', () => {
      const body = [
        {
          name: 'w:p',
          elements: [
            fldChar('begin'),
            instrText('CUSTOMFIELD foo'),
            fldChar('separate'),
            resultText('value'),
            fldChar('end'),
          ],
        },
      ];
      const pm = importBody(body);
      const rawField = findFirstByType(pm[0], 'rawField');
      expect(rawField).toBeTruthy();

      const exported = exportPmNodes([rawField!]);
      walkOoxml({ name: 'wrap', elements: exported as AnyNode[] }, (n) => {
        if (typeof n.name === 'string' && n.name.startsWith('sd:')) {
          throw new Error(`internal carrier ${n.name} leaked into exported OOXML`);
        }
      });
    });

    it('typed family export (sequenceField) emits w:fldChar — never sd:sequenceField', () => {
      const body = [
        {
          name: 'w:p',
          elements: [
            fldChar('begin'),
            instrText('SEQ Figure \\* ARABIC'),
            fldChar('separate'),
            resultText('1'),
            fldChar('end'),
          ],
        },
      ];
      const pm = importBody(body);
      const exported = exportPmNodes(pm);
      walkOoxml({ name: 'wrap', elements: exported as AnyNode[] }, (n) => {
        if (typeof n.name === 'string' && n.name.startsWith('sd:')) {
          throw new Error(`internal carrier ${n.name} leaked into exported OOXML`);
        }
      });
    });
  });

  describe('passthrough invariant: unsupported unedited fields preserve original XML', () => {
    it('unedited rawField exports the original w:fldChar trio verbatim', () => {
      const original = [
        fldChar('begin'),
        instrText('CUSTOMFIELD foo'),
        fldChar('separate'),
        resultText('value'),
        fldChar('end'),
      ];
      const body = [{ name: 'w:p', elements: original }];
      const pm = importBody(body);
      const rawField = findFirstByType(pm[0], 'rawField');
      expect(rawField).toBeTruthy();

      const exported = exportPmNodes([rawField!]);
      // The export should be the same shape as the original begin / instr /
      // separate / result / end runs. We don't assert byte-equality (the
      // serializer may differ in attribute ordering / whitespace) — we
      // assert each fldCharType is present and instruction text matches.
      const fldChars: string[] = [];
      let instrTextSeen = '';
      walkOoxml({ name: 'wrap', elements: exported as AnyNode[] }, (n) => {
        if (n.name === 'w:fldChar' && n.attributes) {
          fldChars.push(String(n.attributes['w:fldCharType'] ?? ''));
        }
        if (n.name === 'w:instrText' && Array.isArray(n.elements)) {
          const txt = (n.elements[0] as { text?: string } | undefined)?.text;
          if (typeof txt === 'string') instrTextSeen += txt;
        }
      });
      expect(fldChars).toEqual(['begin', 'separate', 'end']);
      expect(instrTextSeen).toContain('CUSTOMFIELD foo');
    });
  });

  describe('block-spanning unsupported fields stay block-level (not wrapped in inline rawField)', () => {
    it('unsupported field with w:p in result content is NOT wrapped in sd:rawField at import', () => {
      const body = [
        {
          name: 'w:p',
          elements: [
            fldChar('begin'),
            instrText('IF \\* MERGEFORMAT'),
            fldChar('separate'),
            {
              name: 'w:p',
              elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'first' }] }] }],
            },
            {
              name: 'w:p',
              elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'second' }] }] }],
            },
            fldChar('end'),
          ],
        },
      ];
      // Pre-PM: assert preProcessNodesForFldChar's output does NOT wrap
      // block-spanning unsupported fields in sd:rawField.
      const { processedNodes } = preProcessNodesForFldChar(body as never[], {});
      walkOoxml({ name: 'wrap', elements: processedNodes as AnyNode[] }, (n) => {
        if (n.name === 'sd:rawField') {
          throw new Error('block-spanning unsupported field should not be wrapped in inline sd:rawField');
        }
      });
      // The original w:p block-level runs survive in the output stream.
      const pCount = (function count(nodes: AnyNode[]): number {
        let total = 0;
        for (const n of nodes) {
          if (n.name === 'w:p') total++;
          if (Array.isArray(n.elements)) total += count(n.elements as AnyNode[]);
        }
        return total;
      })(processedNodes as AnyNode[]);
      expect(pCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('dirty / locked flags survive the round-trip through rawField', () => {
    it('imported dirty/locked flags export back onto the begin fldChar', () => {
      const body = [
        {
          name: 'w:p',
          elements: [
            fldChar('begin', { 'w:dirty': '1', 'w:fldLock': '1' }),
            instrText('CUSTOMFIELD foo'),
            fldChar('separate'),
            resultText('value'),
            fldChar('end'),
          ],
        },
      ];
      const pm = importBody(body);
      const rawField = findFirstByType(pm[0], 'rawField');
      expect(rawField?.attrs?.fieldInstance).toMatchObject({ dirty: true, locked: true });
      const exported = exportPmNodes([rawField!]);
      let beginAttrs: Record<string, unknown> | undefined;
      walkOoxml({ name: 'wrap', elements: exported as AnyNode[] }, (n) => {
        if (n.name === 'w:fldChar' && n.attributes && n.attributes['w:fldCharType'] === 'begin') {
          beginAttrs = n.attributes as Record<string, unknown>;
        }
      });
      // Passthrough re-emits the captured original begin fldChar verbatim,
      // so the dirty/locked attrs should still be on it.
      expect(beginAttrs?.['w:dirty']).toBe('1');
      expect(beginAttrs?.['w:fldLock']).toBe('1');
    });
  });
});
