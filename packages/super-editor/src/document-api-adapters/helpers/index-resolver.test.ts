import { describe, expect, it, vi } from 'vitest';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { extractIndexEntryInfo, buildIndexEntryDiscoveryItem, type ResolvedIndexEntry } from './index-resolver.js';

function makeDoc(blockId = 'p-entry'): ProseMirrorNode {
  return {
    resolve: vi.fn(() => ({
      depth: 1,
      start: (depth: number) => (depth === 1 ? 1 : 0),
      node: (depth: number) => (depth === 1 ? { attrs: { sdBlockId: blockId } } : { attrs: {} }),
    })),
  } as unknown as ProseMirrorNode;
}

function makeResolvedIndexEntry(overrides: Partial<ResolvedIndexEntry> = {}): ResolvedIndexEntry {
  return {
    pos: 5,
    blockId: 'p-entry',
    instruction: 'XE "Alpha:Primary" \\b',
    node: {
      type: { name: 'indexEntry' },
      nodeSize: 2,
      attrs: {
        instructionTokens: ['Alpha'],
        subEntry: 'Primary',
        bold: true,
        italic: false,
      },
    } as unknown as ResolvedIndexEntry['node'],
    ...overrides,
  };
}

describe('index-resolver entry text extraction', () => {
  it('uses legacy string instruction tokens for primary text', () => {
    const doc = makeDoc();
    const resolved = makeResolvedIndexEntry();

    const info = extractIndexEntryInfo(doc, resolved);

    expect(info.text).toBe('Alpha');
    expect(info.subEntry).toBe('Primary');
  });

  it('parses full XE instruction token and strips subEntry suffix from primary text', () => {
    const doc = makeDoc();
    const resolved = makeResolvedIndexEntry({
      instruction: 'XE "Beta:Secondary" \\i',
      node: {
        type: { name: 'indexEntry' },
        nodeSize: 2,
        attrs: {
          instructionTokens: [{ type: 'text', text: 'XE "Beta:Secondary" \\i' }],
          subEntry: 'Secondary',
          bold: false,
          italic: true,
        },
      } as unknown as ResolvedIndexEntry['node'],
    });

    const info = extractIndexEntryInfo(doc, resolved);

    expect(info.text).toBe('Beta');
    expect(info.subEntry).toBe('Secondary');
  });

  it('falls back to parsing instruction when instructionTokens are absent', () => {
    const doc = makeDoc();
    const resolved = makeResolvedIndexEntry({
      instruction: 'XE "Gamma:Third" \\b \\f "T"',
      node: {
        type: { name: 'indexEntry' },
        nodeSize: 2,
        attrs: {
          instructionTokens: null,
          subEntry: 'Third',
          bold: true,
          italic: false,
        },
      } as unknown as ResolvedIndexEntry['node'],
    });

    const info = extractIndexEntryInfo(doc, resolved);

    expect(info.text).toBe('Gamma');
    expect(info.subEntry).toBe('Third');
  });

  it('applies the same primary text extraction in discovery items', () => {
    const doc = makeDoc();
    const resolved = makeResolvedIndexEntry({
      instruction: 'XE "Delta:Fourth"',
      node: {
        type: { name: 'indexEntry' },
        nodeSize: 2,
        attrs: {
          instructionTokens: null,
          subEntry: 'Fourth',
          bold: false,
          italic: false,
        },
      } as unknown as ResolvedIndexEntry['node'],
    });

    const item = buildIndexEntryDiscoveryItem(doc, resolved, 'rev-1');

    expect(item.text).toBe('Delta');
    expect(item.subEntry).toBe('Fourth');
  });
});
