import { describe, it, expect, vi } from 'vitest';
import { defaultNodeListHandler } from './docxImporter.js';
import { smartTagNodeEntityHandler } from './smartTagImporter.js';
import { registeredHandlers } from '../../v3/handlers/index.js';

const baseParams = () => ({
  docx: {},
  converter: {},
  editor: { extensionService: { extensions: [] } },
  nodeListHandler: { handler: vi.fn(() => []), handlerEntities: [] },
  path: [],
  extraParams: {},
  importTrackingContext: { addUnhandled: () => {} },
});

describe('smartTagNodeEntityHandler', () => {
  it('claims w:smartTag and emits a smartTag PM node (consumed: 1)', () => {
    const node = {
      name: 'w:smartTag',
      attributes: { 'w:element': 'country-region' },
      elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Brazil' }] }] }],
    };

    const result = smartTagNodeEntityHandler.handler({ ...baseParams(), nodes: [node] });

    expect(result.consumed).toBe(1);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].type).toBe('smartTag');
    expect(result.nodes[0].attrs.element).toBe('country-region');
  });

  it('refuses non-smartTag nodes (consumed: 0)', () => {
    const node = { name: 'w:r', elements: [] };
    const result = smartTagNodeEntityHandler.handler({ ...baseParams(), nodes: [node] });
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('is the only entity that claims w:smartTag in defaultNodeListHandler (passthrough refuses because w:smartTag is in v3 registeredHandlers)', () => {
    // Regression guard: cubic/codex flagged this v2 bridge as "redundant
    // duplicate of the v3 registration". It is not. passthroughNodeImporter
    // refuses any node present in registeredHandlers, so without this bridge
    // w:smartTag would silently fall off the end of the reducer chain.
    expect(registeredHandlers['w:smartTag']).toBeDefined();

    const { handlerEntities } = defaultNodeListHandler();
    const withoutBridge = handlerEntities.filter((e) => e.handlerName !== 'w:smartTagTranslator');
    const node = {
      name: 'w:smartTag',
      attributes: { 'w:element': 'country-region' },
      elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'X' }] }] }],
    };
    const params = {
      ...baseParams(),
      nodes: [node],
      nodeListHandler: { handler: () => [], handlerEntities: withoutBridge },
    };
    const result = withoutBridge.reduce((acc, h) => (acc.consumed > 0 ? acc : h.handler(params)), {
      nodes: [],
      consumed: 0,
    });
    expect(result.consumed).toBe(0);
    expect(result.nodes).toHaveLength(0);
  });
});
