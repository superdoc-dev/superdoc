import { describe, it, expect, afterEach } from 'vitest';
import * as Y from 'yjs';
import { encodeEnvelopeToYjs, decodeYjsToEnvelope, readEnvelopeVersion } from './json-crdt.js';
import type { PartEnvelope } from './types.js';

/**
 * Helper: encode an envelope and integrate it into a Y.Doc so Yjs types are
 * properly initialized, then decode and return the result.
 */
function roundTrip(envelope: PartEnvelope): PartEnvelope | null {
  const ydoc = new Y.Doc();
  const map = ydoc.getMap('test');
  map.set('entry', encodeEnvelopeToYjs(envelope));
  const decoded = decodeYjsToEnvelope(map.get('entry') as Y.Map<unknown>);
  ydoc.destroy();
  return decoded;
}

describe('json-crdt', () => {
  describe('encodeEnvelopeToYjs / decodeYjsToEnvelope round-trip', () => {
    it('round-trips a simple envelope', () => {
      const envelope: PartEnvelope = {
        v: 3,
        clientId: 42,
        data: { type: 'element', name: 'w:styles', elements: [] },
      };

      const decoded = roundTrip(envelope);
      expect(decoded).toEqual(envelope);
    });

    it('preserves nested objects and arrays', () => {
      const data = {
        type: 'element',
        name: 'w:numbering',
        elements: [
          { type: 'element', name: 'w:abstractNum', attributes: { 'w:abstractNumId': '0' } },
          { type: 'element', name: 'w:num', attributes: { 'w:numId': '1' } },
        ],
      };

      const envelope: PartEnvelope = { v: 1, clientId: 100, data };
      expect(roundTrip(envelope)).toEqual(envelope);
    });

    it('preserves scalar types', () => {
      const data = {
        str: 'hello',
        num: 42,
        bool: true,
        nil: null,
      };

      const envelope: PartEnvelope = { v: 1, clientId: 1, data };
      expect(roundTrip(envelope)!.data).toEqual(data);
    });

    it('preserves unknown/arbitrary properties (no data loss)', () => {
      const data = {
        type: 'element',
        name: 'w:hdr',
        customProp: 'preserved',
        elements: [{ name: 'unknown:node', type: 'element', attrs: { foo: 'bar' } }],
      };

      const envelope: PartEnvelope = { v: 5, clientId: 99, data };
      expect(roundTrip(envelope)).toEqual(envelope);
    });
  });

  describe('decodeYjsToEnvelope', () => {
    it('returns null for missing v', () => {
      const yMap = new Y.Map<unknown>();
      yMap.set('clientId', 1);
      yMap.set('data', {});

      expect(decodeYjsToEnvelope(yMap)).toBeNull();
    });

    it('returns null for missing clientId', () => {
      const yMap = new Y.Map<unknown>();
      yMap.set('v', 1);
      yMap.set('data', {});

      expect(decodeYjsToEnvelope(yMap)).toBeNull();
    });

    it('returns null for non-number v', () => {
      const yMap = new Y.Map<unknown>();
      yMap.set('v', 'not a number');
      yMap.set('clientId', 1);
      yMap.set('data', {});

      expect(decodeYjsToEnvelope(yMap)).toBeNull();
    });
  });

  describe('readEnvelopeVersion', () => {
    it('reads version from an existing entry', () => {
      const ydoc = new Y.Doc();
      const partsMap = ydoc.getMap('parts');

      const envelope = encodeEnvelopeToYjs({ v: 7, clientId: 1, data: {} });
      partsMap.set('word/styles.xml', envelope);

      expect(readEnvelopeVersion(partsMap as Y.Map<unknown>, 'word/styles.xml')).toBe(7);
    });

    it('returns 0 for missing entry', () => {
      const ydoc = new Y.Doc();
      const partsMap = ydoc.getMap('parts');

      expect(readEnvelopeVersion(partsMap as Y.Map<unknown>, 'word/styles.xml')).toBe(0);
    });

    it('returns 0 for non-YMap entry', () => {
      const ydoc = new Y.Doc();
      const partsMap = ydoc.getMap('parts');
      partsMap.set('word/styles.xml', 'not a map');

      expect(readEnvelopeVersion(partsMap as Y.Map<unknown>, 'word/styles.xml')).toBe(0);
    });
  });
});
