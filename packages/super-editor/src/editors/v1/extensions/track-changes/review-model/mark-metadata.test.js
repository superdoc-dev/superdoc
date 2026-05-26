import { describe, expect, it } from 'vitest';
import {
  CanonicalChangeType,
  ChangeSubtype,
  SegmentSide,
  canonicalizeSourceIds,
  deterministicJson,
  normalizedAttrsEqual,
  readTrackedAttrs,
  serializeSourceIds,
  sideFromMarkName,
  subtypeFromChangeType,
} from './mark-metadata.js';
import { TrackDeleteMarkName, TrackFormatMarkName, TrackInsertMarkName } from '../constants.js';

describe('review-model/mark-metadata', () => {
  describe('deterministicJson', () => {
    it('produces stable output regardless of key order', () => {
      const a = deterministicJson({ b: 1, a: { z: 3, m: 2 } });
      const b = deterministicJson({ a: { m: 2, z: 3 }, b: 1 });
      expect(a).toBe(b);
      expect(a).toBe('{"a":{"m":2,"z":3},"b":1}');
    });
    it('preserves array order', () => {
      expect(deterministicJson([3, 1, 2])).toBe('[3,1,2]');
    });
    it('drops undefined and functions', () => {
      expect(deterministicJson({ a: undefined, b: () => 1, c: 2 })).toBe('{"c":2}');
    });
  });

  describe('canonicalizeSourceIds', () => {
    it('returns {} for nullish', () => {
      expect(canonicalizeSourceIds(null)).toEqual({});
      expect(canonicalizeSourceIds(undefined)).toEqual({});
    });
    it('parses JSON strings', () => {
      expect(canonicalizeSourceIds('{"wordIdInsert":"42"}')).toEqual({ wordIdInsert: '42' });
    });
    it('wraps non-JSON strings as { raw }', () => {
      expect(canonicalizeSourceIds('rsid-7')).toEqual({ raw: 'rsid-7' });
    });
    it('drops empty string and null entries', () => {
      expect(canonicalizeSourceIds({ wordIdInsert: '', wordIdDelete: null, rsid: 'rs1' })).toEqual({
        rsid: 'rs1',
      });
    });
  });

  describe('side and subtype derivation', () => {
    it('maps mark names to sides', () => {
      expect(sideFromMarkName(TrackInsertMarkName)).toBe(SegmentSide.Inserted);
      expect(sideFromMarkName(TrackDeleteMarkName)).toBe(SegmentSide.Deleted);
      expect(sideFromMarkName(TrackFormatMarkName)).toBe(SegmentSide.Formatting);
      expect(sideFromMarkName('other')).toBeNull();
    });
    it('maps change types to subtypes', () => {
      expect(subtypeFromChangeType(CanonicalChangeType.Insertion)).toBe(ChangeSubtype.TextInsertion);
      expect(subtypeFromChangeType(CanonicalChangeType.Deletion)).toBe(ChangeSubtype.TextDeletion);
      expect(subtypeFromChangeType(CanonicalChangeType.Replacement)).toBe(ChangeSubtype.TextReplacement);
      expect(subtypeFromChangeType(CanonicalChangeType.Formatting)).toBe(ChangeSubtype.RunFormatting);
      expect(subtypeFromChangeType('weird')).toBeNull();
    });
  });

  describe('readTrackedAttrs', () => {
    it('infers from legacy attrs', () => {
      const result = readTrackedAttrs({
        attrs: { id: 'c1', author: 'A', authorEmail: 'a@x' },
        type: { name: TrackInsertMarkName },
      });
      expect(result.id).toBe('c1');
      expect(result.changeType).toBe(CanonicalChangeType.Insertion);
      expect(result.subtype).toBe(ChangeSubtype.TextInsertion);
      expect(result.side).toBe(SegmentSide.Inserted);
      expect(result.revisionGroupId).toBe('c1');
      expect(result.splitFromId).toBe('');
      expect(result.hasReviewMetadata).toBe(false);
    });

    it('honors explicit overlap metadata', () => {
      const result = readTrackedAttrs(
        {
          attrs: {
            id: 'frag1',
            revisionGroupId: 'root1',
            splitFromId: 'root1',
            changeType: CanonicalChangeType.Replacement,
            replacementGroupId: 'rep1',
            replacementSideId: 'rep1#deleted',
            overlapParentId: 'parentA',
            sourceIds: { wordIdInsert: '99' },
            origin: 'word',
          },
          type: { name: TrackInsertMarkName },
        },
        TrackInsertMarkName,
      );
      expect(result.revisionGroupId).toBe('root1');
      expect(result.changeType).toBe(CanonicalChangeType.Replacement);
      expect(result.subtype).toBe(ChangeSubtype.TextReplacement);
      expect(result.replacementGroupId).toBe('rep1');
      expect(result.replacementSideId).toBe('rep1#deleted');
      expect(result.overlapParentId).toBe('parentA');
      expect(result.sourceIds).toEqual({ wordIdInsert: '99' });
      expect(result.hasReviewMetadata).toBe(true);
    });

    it('folds legacy sourceId into sourceIds under the mark-specific key', () => {
      const insert = readTrackedAttrs({ attrs: { id: 'c1', sourceId: '42' }, type: { name: TrackInsertMarkName } });
      expect(insert.sourceIds).toEqual({ wordIdInsert: '42' });

      const del = readTrackedAttrs({ attrs: { id: 'c1', sourceId: '7' }, type: { name: TrackDeleteMarkName } });
      expect(del.sourceIds).toEqual({ wordIdDelete: '7' });
    });
  });

  describe('normalizedAttrsEqual', () => {
    it('treats missing-vs-empty defaults as equal', () => {
      const legacy = readTrackedAttrs({ attrs: { id: 'c1' }, type: { name: TrackInsertMarkName } });
      const explicit = readTrackedAttrs({
        attrs: {
          id: 'c1',
          revisionGroupId: 'c1',
          splitFromId: '',
          changeType: CanonicalChangeType.Insertion,
          sourceIds: null,
        },
        type: { name: TrackInsertMarkName },
      });
      expect(normalizedAttrsEqual(legacy, explicit)).toBe(true);
    });

    it('distinguishes mark type / id', () => {
      const a = readTrackedAttrs({ attrs: { id: 'a' }, type: { name: TrackInsertMarkName } });
      const b = readTrackedAttrs({ attrs: { id: 'b' }, type: { name: TrackInsertMarkName } });
      expect(normalizedAttrsEqual(a, b)).toBe(false);
    });
  });

  describe('serializeSourceIds', () => {
    it('returns "" for empty source ids', () => {
      expect(serializeSourceIds({})).toBe('');
    });
    it('produces deterministic JSON', () => {
      expect(serializeSourceIds({ b: '2', a: '1' })).toBe('{"a":"1","b":"2"}');
    });
  });
});
