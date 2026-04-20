import type { CompareReport } from './types.ts';

export function formatJson(report: CompareReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function formatMarkdown(report: CompareReport): string {
  const lines: string[] = [];
  lines.push(`# compare-rendering: ${basename(report.docxPath)}`);
  lines.push('');
  lines.push(`- sha256: \`${report.docxSha}\``);
  lines.push(`- Word pages: ${report.counts.wordPages}, SuperDoc pages: ${report.counts.superdocPages}`);
  lines.push(
    `- Word paragraphs: ${report.counts.wordParagraphs}, SuperDoc paragraphs: ${report.counts.superdocParagraphs}`,
  );
  lines.push('');

  if (!report.wordSupported) {
    lines.push(`> **Skipped**: ${report.unsupportedReason ?? 'unsupported document'}`);
    lines.push('');
    return lines.join('\n');
  }

  if (report.findings.length === 0) {
    lines.push('No findings — Word and SuperDoc agree on paragraph text and page assignment.');
    lines.push('');
    return lines.join('\n');
  }

  const byCategory = groupBy(report.findings, (f) => f.category);
  lines.push(`## Findings (${report.findings.length})`);
  for (const [cat, findings] of byCategory) {
    lines.push('');
    lines.push(`### ${cat} (${findings.length})`);
    for (const f of findings) {
      lines.push(`- **[${f.severity}]** ${f.message}`);
      if (f.specRef) lines.push(`  - spec: ${f.specRef}`);
      if (f.codeAreaHint) lines.push(`  - code: \`${f.codeAreaHint}\``);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i === -1 ? p : p.slice(i + 1);
}

function groupBy<T, K>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = key(x);
    const bucket = m.get(k) ?? [];
    bucket.push(x);
    m.set(k, bucket);
  }
  return m;
}
