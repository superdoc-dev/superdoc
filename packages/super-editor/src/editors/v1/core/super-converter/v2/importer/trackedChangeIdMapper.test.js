import { describe, expect, it } from 'vitest';
import { buildTrackedChangeIdMap } from './trackedChangeIdMapper.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function trackedChange(name, id, author = 'Alice', date = '2024-01-01T00:00:00Z', children = []) {
  return {
    name,
    attributes: { 'w:id': id, 'w:author': author, 'w:date': date },
    elements: children,
  };
}

function wordDelete(id, text, author = 'Alice', date = '2024-01-01T00:00:00Z') {
  return trackedChange('w:del', id, author, date, [
    {
      name: 'w:r',
      elements: [{ name: 'w:delText', elements: [{ text }] }],
    },
  ]);
}

function wordInsert(id, text, author = 'Alice', date = '2024-01-01T00:00:00Z') {
  return trackedChange('w:ins', id, author, date, [
    {
      name: 'w:r',
      elements: [{ name: 'w:t', elements: [{ text }] }],
    },
  ]);
}

function paragraph(...children) {
  return { name: 'w:p', elements: children };
}

function createDocx(...bodyChildren) {
  return {
    'word/document.xml': {
      elements: [{ name: 'w:document', elements: bodyChildren }],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildTrackedChangeIdMap', () => {
  it('returns an empty map when document.xml is missing', () => {
    expect(buildTrackedChangeIdMap({})).toEqual(new Map());
  });

  it('returns an empty map when the body has no elements', () => {
    const docx = { 'word/document.xml': { elements: [{ name: 'w:document' }] } };
    expect(buildTrackedChangeIdMap(docx)).toEqual(new Map());
  });

  it('assigns a unique UUID to each standalone tracked change', () => {
    const docx = createDocx(paragraph(trackedChange('w:del', '1')), paragraph(trackedChange('w:ins', '2')));

    const idMap = buildTrackedChangeIdMap(docx);

    expect(idMap.size).toBe(2);
    expect(idMap.get('1')).toBeTruthy();
    expect(idMap.get('2')).toBeTruthy();
    expect(idMap.get('1')).not.toBe(idMap.get('2'));
  });

  describe('replacement pairing', () => {
    it('maps adjacent w:del + w:ins with same author/date to the same UUID', () => {
      const docx = createDocx(
        paragraph(
          trackedChange('w:del', '10', 'Alice', '2024-01-01T00:00:00Z'),
          trackedChange('w:ins', '11', 'Alice', '2024-01-01T00:00:00Z'),
        ),
      );

      const idMap = buildTrackedChangeIdMap(docx);

      expect(idMap.size).toBe(2);
      expect(idMap.get('10')).toBe(idMap.get('11'));
    });

    it('maps adjacent w:ins + w:del with same author/date to the same UUID', () => {
      const docx = createDocx(
        paragraph(
          trackedChange('w:ins', '20', 'Bob', '2024-06-15T12:00:00Z'),
          trackedChange('w:del', '21', 'Bob', '2024-06-15T12:00:00Z'),
        ),
      );

      const idMap = buildTrackedChangeIdMap(docx);

      expect(idMap.get('20')).toBe(idMap.get('21'));
    });

    it('does NOT pair adjacent changes of the same type', () => {
      const docx = createDocx(
        paragraph(
          trackedChange('w:del', '30', 'Alice', '2024-01-01T00:00:00Z'),
          trackedChange('w:del', '31', 'Alice', '2024-01-01T00:00:00Z'),
        ),
      );

      const idMap = buildTrackedChangeIdMap(docx);

      expect(idMap.get('30')).not.toBe(idMap.get('31'));
    });

    it('does NOT pair changes with different authors', () => {
      const docx = createDocx(
        paragraph(
          trackedChange('w:del', '40', 'Alice', '2024-01-01T00:00:00Z'),
          trackedChange('w:ins', '41', 'Bob', '2024-01-01T00:00:00Z'),
        ),
      );

      const idMap = buildTrackedChangeIdMap(docx);

      expect(idMap.get('40')).not.toBe(idMap.get('41'));
    });

    it('does NOT pair changes with different dates', () => {
      const docx = createDocx(
        paragraph(
          trackedChange('w:del', '50', 'Alice', '2024-01-01T00:00:00Z'),
          trackedChange('w:ins', '51', 'Alice', '2024-06-15T12:00:00Z'),
        ),
      );

      const idMap = buildTrackedChangeIdMap(docx);

      expect(idMap.get('50')).not.toBe(idMap.get('51'));
    });
  });

  it('resets pairing at paragraph boundaries', () => {
    const docx = createDocx(
      paragraph(trackedChange('w:del', '60', 'Alice', '2024-01-01T00:00:00Z')),
      paragraph(trackedChange('w:ins', '61', 'Alice', '2024-01-01T00:00:00Z')),
    );

    const idMap = buildTrackedChangeIdMap(docx);

    expect(idMap.get('60')).not.toBe(idMap.get('61'));
  });

  it('preserves pairing across non-content markers (comment/bookmark ranges)', () => {
    const docx = createDocx(
      paragraph(
        trackedChange('w:del', '70', 'Alice', '2024-01-01T00:00:00Z'),
        { name: 'w:commentRangeEnd', attributes: { 'w:id': '99' } },
        { name: 'w:bookmarkEnd', attributes: { 'w:id': '100' } },
        trackedChange('w:ins', '71', 'Alice', '2024-01-01T00:00:00Z'),
      ),
    );

    const idMap = buildTrackedChangeIdMap(docx);

    // Range markers carry no content and don't break replacement pairing.
    expect(idMap.get('70')).toBe(idMap.get('71'));
  });

  it('does NOT pair changes separated by a content run', () => {
    const docx = createDocx(
      paragraph(
        trackedChange('w:del', '72', 'Alice', '2024-01-01T00:00:00Z'),
        { name: 'w:r', elements: [{ name: 'w:t', elements: [{ text: 'live text' }] }] },
        trackedChange('w:ins', '73', 'Alice', '2024-01-01T00:00:00Z'),
      ),
    );

    const idMap = buildTrackedChangeIdMap(docx);

    // A content run between tracked changes means they are separate revisions.
    expect(idMap.get('72')).not.toBe(idMap.get('73'));
  });

  it('assigns UUIDs to nested tracked changes independently', () => {
    const inner = trackedChange('w:ins', '81', 'Alice', '2024-01-01T00:00:00Z');
    const outer = trackedChange('w:del', '80', 'Alice', '2024-01-01T00:00:00Z', [inner]);

    const docx = createDocx(paragraph(outer));
    const idMap = buildTrackedChangeIdMap(docx);

    expect(idMap.size).toBe(2);
    expect(idMap.get('80')).toBeTruthy();
    expect(idMap.get('81')).toBeTruthy();
    expect(idMap.get('80')).not.toBe(idMap.get('81'));
  });

  it('consumes only one pair per replacement', () => {
    // del(A) + ins(B) pair together; del(C) stands alone.
    const docx = createDocx(
      paragraph(
        trackedChange('w:del', '90', 'Alice', '2024-01-01T00:00:00Z'),
        trackedChange('w:ins', '91', 'Alice', '2024-01-01T00:00:00Z'),
        trackedChange('w:del', '92', 'Alice', '2024-01-01T00:00:00Z'),
      ),
    );

    const idMap = buildTrackedChangeIdMap(docx);

    expect(idMap.get('90')).toBe(idMap.get('91'));
    expect(idMap.get('92')).not.toBe(idMap.get('90'));
  });

  it('preserves earlier mapping when a w:id is reused later in the document', () => {
    // del(1) + ins(2) pair, then del(1) appears again in a later paragraph.
    // The second occurrence of id "1" must keep the UUID from the first
    // occurrence, not overwrite it with a fresh one.
    const docx = createDocx(
      paragraph(
        trackedChange('w:del', '1', 'Alice', '2024-01-01T00:00:00Z'),
        trackedChange('w:ins', '2', 'Alice', '2024-01-01T00:00:00Z'),
      ),
      paragraph(trackedChange('w:del', '1', 'Alice', '2024-01-01T00:00:00Z')),
    );

    const idMap = buildTrackedChangeIdMap(docx);

    // The pair is intact: both map to the same internal id.
    expect(idMap.get('1')).toBe(idMap.get('2'));
  });

  it('preserves earlier mapping when a reused w:id appears as the second half of a later pair', () => {
    // del(1) + ins(2) pair first. Then del(3) + ins(2) would try to pair,
    // but id "2" is already mapped — it must keep its original UUID so the
    // first replacement stays intact.
    const docx = createDocx(
      paragraph(
        trackedChange('w:del', '1', 'Alice', '2024-01-01T00:00:00Z'),
        trackedChange('w:ins', '2', 'Alice', '2024-01-01T00:00:00Z'),
      ),
      paragraph(
        trackedChange('w:del', '3', 'Alice', '2024-01-01T00:00:00Z'),
        trackedChange('w:ins', '2', 'Alice', '2024-01-01T00:00:00Z'),
      ),
    );

    const idMap = buildTrackedChangeIdMap(docx);

    // Original pair is preserved.
    expect(idMap.get('1')).toBe(idMap.get('2'));
    // id "3" must NOT have overwritten id "2" onto a different UUID.
    expect(idMap.get('3')).not.toBe(idMap.get('1'));
  });

  it('pairs real Word-shaped replacement siblings with run children', () => {
    const docx = createDocx(paragraph(wordDelete('0', 'test '), wordInsert('1', 'abc ')));

    const idMap = buildTrackedChangeIdMap(docx);

    expect(idMap.get('0')).toBe(idMap.get('1'));
  });
});
