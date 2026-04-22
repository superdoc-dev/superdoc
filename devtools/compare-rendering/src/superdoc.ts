import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type SuperDocSnapshot = {
  layoutSnapshot: {
    layout: { pages: SuperDocPage[] };
    blocks: SuperDocBlock[];
  };
};

type SuperDocPage = {
  number: number;
  fragments: Array<{ blockId: string; y: number }>;
};

type SuperDocBlock = {
  kind: 'paragraph' | 'sectionBreak' | string;
  id?: string;
  runs?: Array<{ text?: string }>;
  attrs?: Record<string, unknown>;
};

export type SuperDocExtraction = {
  blocks: SuperDocBlock[];
  blockPage: Record<string, number>;
  blockY: Record<string, number>;
  pageCount: number;
};

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export async function extractSuperDoc(
  docxPath: string,
  opts: { pipeline?: 'presentation' | 'headless' } = {},
): Promise<SuperDocExtraction> {
  const pipeline = opts.pipeline ?? 'presentation';
  const tmp = await mkdtemp(join(tmpdir(), 'compare-sd-'));
  const outputPath = join(tmp, 'snapshot.layout.json');

  try {
    await runLayoutExport(docxPath, outputPath, pipeline);
    const raw = JSON.parse(await readFile(outputPath, 'utf8')) as SuperDocSnapshot;
    return normalizeSuperDocSnapshot(raw);
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

function runLayoutExport(input: string, output: string, pipeline: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['layout:export-one', '--', '--input', input, '--output', output, '--pipeline', pipeline],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stderr = '';
    child.stderr.on('data', (c) => {
      stderr += String(c);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`layout:export-one exited ${code}:\n${stderr.trim().slice(-1000)}`));
    });
  });
}

function normalizeSuperDocSnapshot(raw: SuperDocSnapshot): SuperDocExtraction {
  const blocks = raw.layoutSnapshot.blocks;
  const blockPage: Record<string, number> = {};
  const blockY: Record<string, number> = {};

  for (const pg of raw.layoutSnapshot.layout.pages) {
    for (const frag of pg.fragments) {
      if (!(frag.blockId in blockPage)) {
        blockPage[frag.blockId] = pg.number;
        blockY[frag.blockId] = frag.y;
      }
    }
  }

  return {
    blocks,
    blockPage,
    blockY,
    pageCount: raw.layoutSnapshot.layout.pages.length,
  };
}
