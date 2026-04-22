import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Baseline, CompareReport, DeltaReport, Finding } from './types.ts';

const CURRENT_SCHEMA_VERSION = 1 as const;

export async function readBaseline(path: string): Promise<Baseline> {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  if (raw?.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`baseline ${path}: unsupported schemaVersion ${raw?.schemaVersion}`);
  }
  return raw as Baseline;
}

export async function writeBaseline(path: string, reports: CompareReport[]): Promise<void> {
  const baseline: Baseline = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    docs: {},
  };
  for (const r of reports) {
    const key = baselineKey(r.docxPath);
    baseline.docs[key] = { docxSha: r.docxSha, findings: r.findings };
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

/**
 * Diff a fresh set of reports against a baseline. Findings are keyed by
 * `fingerprint` within each doc — same fingerprint in both → unchanged;
 * only in baseline → resolved; only in current → new.
 *
 * Docs present in current but not in baseline contribute all their findings
 * as new (the doc itself is new to the corpus). Docs present in baseline
 * but not in current are ignored — they're a batch-scope issue, not a
 * regression in behavior.
 */
export function diffAgainstBaseline(reports: CompareReport[], baseline: Baseline): DeltaReport {
  const docs: DeltaReport['docs'] = [];
  let totalResolved = 0;
  let totalNew = 0;
  let totalUnchanged = 0;

  for (const r of reports) {
    const key = baselineKey(r.docxPath);
    const baselineDoc = baseline.docs[key];
    const baselineByFp = new Map<string, Finding>();
    if (baselineDoc) for (const f of baselineDoc.findings) baselineByFp.set(f.fingerprint, f);

    const currentByFp = new Map<string, Finding>();
    for (const f of r.findings) currentByFp.set(f.fingerprint, f);

    const resolved: Finding[] = [];
    const fresh: Finding[] = [];
    let unchanged = 0;

    for (const [fp, f] of baselineByFp) {
      if (!currentByFp.has(fp)) resolved.push(f);
    }
    for (const [fp, f] of currentByFp) {
      if (baselineByFp.has(fp)) unchanged += 1;
      else fresh.push(f);
    }

    if (resolved.length || fresh.length || unchanged) {
      docs.push({ file: key, resolved, new: fresh, unchangedCount: unchanged });
    }
    totalResolved += resolved.length;
    totalNew += fresh.length;
    totalUnchanged += unchanged;
  }

  return {
    baselineCapturedAt: baseline.capturedAt,
    totals: { resolved: totalResolved, new: totalNew, unchanged: totalUnchanged },
    docs,
  };
}

/** Normalize a docx path to a stable baseline key (basename). */
function baselineKey(docxPath: string): string {
  const i = Math.max(docxPath.lastIndexOf('/'), docxPath.lastIndexOf('\\'));
  return i === -1 ? docxPath : docxPath.slice(i + 1);
}
