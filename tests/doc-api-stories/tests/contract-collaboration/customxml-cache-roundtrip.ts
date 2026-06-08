/**
 * doc-api story: contract collaboration cache round-trip.
 *
 * This validates the runtime path the contract-collaboration prototype depends
 * on: a disposable cache written through `customXml.parts.create`, saved to a
 * real DOCX, reopened through SuperDoc, patched for the next turn, saved again,
 * and reopened again. The cache remains non-authoritative. Server-side ledger
 * state is still the source of truth.
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import type { SuperDocDocument } from '@superdoc-dev/sdk';
import { useStoryHarness } from '../harness';

const BASE_DOC = path.resolve(import.meta.dirname, '../../../../shared/common/data/blank.docx');
const CACHE_NAMESPACE = 'urn:superdoc:contract-collaboration:cache:1';
const CACHE_SCHEMA_REF = 'urn:superdoc:contract-collaboration:schema:1';
const SESSION_ID = 'cc-session-runtime-001';
const SERVER_REF = 'https://contracts.example.test/sessions/cc-session-runtime-001';
const HEAD_1 = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const HEAD_2 = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';

type UnknownRecord = Record<string, unknown>;

type CacheSummary = {
  id?: string;
  partName: string;
  propsPartName?: string;
  rootNamespace?: string;
  schemaRefs: string[];
};

type CacheInfo = CacheSummary & {
  content: string;
};

type CreatedCachePart = {
  id: string;
  partName: string;
  propsPartName: string;
};

function xmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function xmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function cacheXml(headHash: string, turnCount: number): string {
  const payload = JSON.stringify({
    headHash,
    sessionId: SESSION_ID,
    turnCount,
  });

  return [
    `<cc:contractSessionCache xmlns:cc="${xmlAttr(CACHE_NAMESPACE)}" version="0.1">`,
    `<cc:sessionId>${xmlText(SESSION_ID)}</cc:sessionId>`,
    `<cc:serverRef href="${xmlAttr(SERVER_REF)}" autoCall="false"/>`,
    `<cc:freshness headHash="${xmlAttr(headHash)}" turnCount="${turnCount}"/>`,
    `<cc:payload encoding="application/json">${xmlText(payload)}</cc:payload>`,
    '</cc:contractSessionCache>',
  ].join('');
}

function makeSessionId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function asRecord(value: unknown, label: string): UnknownRecord {
  expect(value, `${label} should be an object`).not.toBeNull();
  expect(typeof value, `${label} should be an object`).toBe('object');
  return value as UnknownRecord;
}

function asString(value: unknown, label: string): string {
  expect(typeof value, `${label} should be a string`).toBe('string');
  return value as string;
}

function asStringArray(value: unknown, label: string): string[] {
  expect(Array.isArray(value), `${label} should be an array`).toBe(true);
  const strings = value as unknown[];
  for (const [index, item] of strings.entries()) {
    expect(typeof item, `${label}[${index}] should be a string`).toBe('string');
  }
  return strings as string[];
}

function toCacheSummary(value: unknown, label: string): CacheSummary {
  const record = asRecord(value, label);
  const summary: CacheSummary = {
    partName: asString(record.partName, `${label}.partName`),
    schemaRefs: asStringArray(record.schemaRefs, `${label}.schemaRefs`),
  };

  if (record.id !== undefined) summary.id = asString(record.id, `${label}.id`);
  if (record.propsPartName !== undefined) {
    summary.propsPartName = asString(record.propsPartName, `${label}.propsPartName`);
  }
  if (record.rootNamespace !== undefined) {
    summary.rootNamespace = asString(record.rootNamespace, `${label}.rootNamespace`);
  }

  return summary;
}

function toCacheInfo(value: unknown): CacheInfo {
  const summary = toCacheSummary(value, 'customXml.parts.get result');
  const record = value as UnknownRecord;
  return {
    ...summary,
    content: asString(record.content, 'customXml.parts.get result.content'),
  };
}

function listedCacheSummaries(value: unknown): CacheSummary[] {
  const record = asRecord(value, 'customXml.parts.list result');
  expect(typeof record.total, 'customXml.parts.list result.total should be a number').toBe('number');
  expect(Array.isArray(record.items), 'customXml.parts.list result.items should be an array').toBe(true);
  return (record.items as unknown[]).map((item, index) => toCacheSummary(item, `customXml.parts.list item ${index}`));
}

function formatDiagnostic(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, nested) => {
      if (typeof nested === 'string' && nested.length > 500) return `${nested.slice(0, 500)}...`;
      return nested;
    },
    2,
  );
}

async function readZipEntry(docPath: string, zipPath: string): Promise<string | null> {
  const buffer = await readFile(docPath);
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file(zipPath);
  return file ? file.async('string') : null;
}

async function requireZipEntry(docPath: string, zipPath: string): Promise<string> {
  const content = await readZipEntry(docPath, zipPath);
  if (content == null) {
    throw new Error(`Missing zip entry "${zipPath}" in ${docPath}`);
  }
  return content;
}

function itemIndexFromPartName(partName: string): string {
  const match = partName.match(/^customXml\/item(\d+)\.xml$/);
  if (!match?.[1]) {
    throw new Error(`Expected customXml item part name, got ${partName}`);
  }
  return match[1];
}

function requireCreatedPart(part: CreatedCachePart | null): CreatedCachePart {
  if (!part) {
    throw new Error('Expected custom XML part creation to complete before save assertions.');
  }
  return part;
}

async function assertCachePackageShape(
  docPath: string,
  createdPart: CreatedCachePart,
  expectedHeadHash: string,
): Promise<void> {
  const itemIndex = itemIndexFromPartName(createdPart.partName);
  const itemRelsPath = `customXml/_rels/item${itemIndex}.xml.rels`;

  const storageXml = await requireZipEntry(docPath, createdPart.partName);
  expect(storageXml).toContain(`<cc:sessionId>${SESSION_ID}</cc:sessionId>`);
  expect(storageXml).toContain(expectedHeadHash);

  const propsXml = await requireZipEntry(docPath, createdPart.propsPartName);
  expect(propsXml).toContain(createdPart.id);
  expect(propsXml).toContain(CACHE_SCHEMA_REF);
  expect(propsXml).toContain('officeDocument/2006/customXml');

  const itemRelsXml = await requireZipEntry(docPath, itemRelsPath);
  expect(itemRelsXml).toContain('customXmlProps');
  expect(itemRelsXml).toContain(`Target="itemProps${itemIndex}.xml"`);

  const contentTypesXml = await requireZipEntry(docPath, '[Content_Types].xml');
  expect(contentTypesXml).toContain(`/${createdPart.propsPartName}`);
  expect(contentTypesXml).toContain('customXmlProperties+xml');

  const documentRelsXml = await requireZipEntry(docPath, 'word/_rels/document.xml.rels');
  expect(documentRelsXml).toContain('officeDocument/2006/relationships/customXml');
  expect(documentRelsXml).toContain(`Target="../${createdPart.partName}"`);
}

describe('document-api story: contract collaboration customXml cache', () => {
  const { createHandleClient, outPath } = useStoryHarness('contract-collaboration/customxml-cache-roundtrip', {
    preserveResults: true,
  });

  async function openSession(doc: string, prefix: string): Promise<SuperDocDocument> {
    const client = await createHandleClient();
    const sessionId = makeSessionId(prefix);
    return client.open({ sessionId, doc });
  }

  async function closeSession(doc: SuperDocDocument | null): Promise<void> {
    await doc?.close({ discard: true }).catch(() => {});
  }

  async function readSingleCache(doc: SuperDocDocument, expectedId: string, stage: string): Promise<CacheInfo> {
    const list = await doc.customXml.parts.list({
      rootNamespace: CACHE_NAMESPACE,
    });

    const summaries = listedCacheSummaries(list).filter(
      (summary) => summary.rootNamespace === CACHE_NAMESPACE && summary.schemaRefs.includes(CACHE_SCHEMA_REF),
    );
    if (summaries.length !== 1) {
      const unfiltered = await doc.customXml.parts.list();
      const direct = await doc.customXml.parts.get({
        target: { id: expectedId },
      });
      throw new Error(
        [
          `Expected one contract cache part during ${stage}, got ${summaries.length}.`,
          `Filtered list: ${formatDiagnostic(list)}`,
          `Unfiltered list: ${formatDiagnostic(unfiltered)}`,
          `Direct get by id: ${formatDiagnostic(direct)}`,
        ].join('\n'),
      );
    }

    const [summary] = summaries;
    expect(summary.partName).toMatch(/^customXml\/item\d+\.xml$/);
    expect(summary.propsPartName).toMatch(/^customXml\/itemProps\d+\.xml$/);

    const info = await doc.customXml.parts.get({
      target: { id: expectedId },
    });
    expect(info).not.toBeNull();

    const cacheInfo = toCacheInfo(info);
    expect(cacheInfo.id).toBe(expectedId);
    expect(cacheInfo.content).toContain(`<cc:sessionId>${SESSION_ID}</cc:sessionId>`);
    expect(cacheInfo.content).toContain(`href="${SERVER_REF}"`);
    expect(cacheInfo.content).toContain('autoCall="false"');
    return cacheInfo;
  }

  it('creates, saves, reopens, patches, and reopens a disposable cache part', async () => {
    let authorDoc: SuperDocDocument | null = await openSession(BASE_DOC, 'cc-author');
    let createdId = '';
    let createdPart: CreatedCachePart | null = null;

    try {
      const created = await authorDoc.customXml.parts.create({
        content: cacheXml(HEAD_1, 1),
        schemaRefs: [CACHE_SCHEMA_REF],
      });
      expect(created.success).toBe(true);
      expect(created.id).toMatch(/^\{[0-9A-F-]+\}$/);
      expect(created.partName).toMatch(/^customXml\/item\d+\.xml$/);
      expect(created.propsPartName).toMatch(/^customXml\/itemProps\d+\.xml$/);
      createdId = created.id;
      createdPart = {
        id: created.id,
        partName: created.partName,
        propsPartName: created.propsPartName,
      };

      const written = await readSingleCache(authorDoc, createdId, 'author session after create');
      expect(written.id).toBe(created.id);
      expect(written.content).toContain(HEAD_1);

      const createdDocPath = outPath('contract-cache-created.docx');
      await authorDoc.save({
        out: createdDocPath,
        force: true,
      });
      await assertCachePackageShape(createdDocPath, requireCreatedPart(createdPart), HEAD_1);
    } finally {
      await closeSession(authorDoc);
      authorDoc = null;
    }

    let reviewerDoc: SuperDocDocument | null = await openSession(outPath('contract-cache-created.docx'), 'cc-reviewer');
    try {
      const reopened = await readSingleCache(reviewerDoc, createdId, 'reviewer session after reopen');
      expect(reopened.id).toBe(createdId);
      expect(reopened.content).toContain(HEAD_1);

      const patched = await reviewerDoc.customXml.parts.patch({
        target: { id: createdId },
        content: cacheXml(HEAD_2, 2),
      });
      expect(patched.success).toBe(true);
      expect(patched.id).toBe(createdId);

      const afterPatch = await readSingleCache(reviewerDoc, createdId, 'reviewer session after patch');
      expect(afterPatch.content).toContain(HEAD_2);
      expect(afterPatch.content).not.toContain(HEAD_1);

      const patchedDocPath = outPath('contract-cache-patched.docx');
      await reviewerDoc.save({
        out: patchedDocPath,
        force: true,
      });
      await assertCachePackageShape(patchedDocPath, requireCreatedPart(createdPart), HEAD_2);
    } finally {
      await closeSession(reviewerDoc);
      reviewerDoc = null;
    }

    let finalDoc: SuperDocDocument | null = await openSession(outPath('contract-cache-patched.docx'), 'cc-final');
    try {
      const finalCache = await readSingleCache(finalDoc, createdId, 'final session after reopen');
      expect(finalCache.id).toBe(createdId);
      expect(finalCache.content).toContain(HEAD_2);
      expect(finalCache.content).not.toContain(HEAD_1);
    } finally {
      await closeSession(finalDoc);
      finalDoc = null;
    }
  });
});
