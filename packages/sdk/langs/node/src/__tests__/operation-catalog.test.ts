import { describe, expect, test } from 'bun:test';
import { CONTRACT } from '../generated/contract.ts';
import {
  getOperationCatalogEntry,
  getOperationCatalogSummary,
  listMutatingOperations,
  OPERATION_CATALOG,
} from '../agent/operation-catalog.ts';

describe('operation catalog', () => {
  test('classifies every operation present in the generated contract', () => {
    const expectedIds = Object.keys(CONTRACT.operations).sort();
    const actualIds = OPERATION_CATALOG.map((entry) => entry.operationId).sort();
    expect(actualIds).toEqual(expectedIds);
  });

  test('every operation has a domain and verification hints', () => {
    for (const entry of OPERATION_CATALOG) {
      expect(typeof entry.domain).toBe('string');
      expect(entry.domain.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.verificationHints)).toBe(true);
      expect(entry.verificationHints.length).toBeGreaterThan(0);
    }
  });

  test('mutating operations are atomic and marked as write', () => {
    for (const entry of listMutatingOperations()) {
      expect(entry.mode).toBe('write');
      expect(entry.isMutating).toBe(true);
      // doc.mutations.apply is the only one whose atomicity is parameter-driven;
      // every other mutating op is contract-atomic.
      if (entry.operationId !== 'doc.mutations.apply') {
        expect(entry.atomic).toBe(true);
      }
    }
  });

  test('read operations are not marked atomic', () => {
    for (const entry of OPERATION_CATALOG) {
      if (entry.mode === 'read') {
        expect(entry.atomic).toBe(false);
      }
    }
  });

  test('no operation is uncategorized', () => {
    const summary = getOperationCatalogSummary();
    expect(summary.total).toBeGreaterThan(300);
    expect(summary.byDomain['document-write'] ?? 0).toBeLessThanOrEqual(40);
  });

  test('catalog can resolve by id', () => {
    const entry = getOperationCatalogEntry('doc.blocks.list');
    expect(entry).toBeDefined();
    expect(entry?.mode).toBe('read');
    expect(entry?.domain).toBe('blocks');
  });

  test('action eligibility excludes session and meta operations', () => {
    const open = getOperationCatalogEntry('doc.open');
    const close = getOperationCatalogEntry('doc.close');
    const describe = getOperationCatalogEntry('doc.describe');
    expect(open?.actionEligible).toBe(false);
    expect(close?.actionEligible).toBe(false);
    expect(describe?.actionEligible).toBe(false);
  });

  test('representative mutating operations are not misclassified as read', () => {
    const expectedWriteIds = [
      'doc.create.paragraph',
      'doc.create.heading',
      'doc.create.table',
      'doc.create.tableOfContents',
      'doc.tables.insertColumn',
      'doc.tables.insertRow',
      'doc.tables.setShading',
      'doc.format.color',
      'doc.format.fontSize',
      'doc.format.letterSpacing',
      'doc.trackChanges.decide',
    ];

    for (const operationId of expectedWriteIds) {
      const entry = getOperationCatalogEntry(operationId);
      expect(entry).toBeDefined();
      expect(entry?.mode).toBe('write');
      expect(entry?.isMutating).toBe(true);
    }
  });
});
