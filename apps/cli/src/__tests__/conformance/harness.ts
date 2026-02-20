import { access, copyFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run } from '../../index';

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type SuccessEnvelope = {
  ok: true;
  command: string;
  data: unknown;
  meta: {
    elapsedMs: number;
  };
};

export type ErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    elapsedMs: number;
  };
};

export type CommandEnvelope = SuccessEnvelope | ErrorEnvelope;

export type TextRangeAddress = {
  kind: 'text';
  blockId: string;
  range: {
    start: number;
    end: number;
  };
};

export type ListItemAddress = {
  kind: 'block';
  nodeType: 'listItem';
  nodeId: string;
};

const REPO_ROOT = path.resolve(import.meta.dir, '../../../../../');
const SOURCE_DOC = path.join(REPO_ROOT, 'e2e-tests/test-data/basic-documents/advanced-text.docx');
const LIST_SOURCE_DOC_CANDIDATES = [
  path.join(REPO_ROOT, 'devtools/document-api-tests/fixtures/matrix-list.input.docx'),
  path.join(REPO_ROOT, 'e2e-tests/test-data/basic-documents/lists-complex-items.docx'),
];

let resolvedListSourceDoc: string | null = null;

async function resolveListSourceDoc(): Promise<string> {
  if (resolvedListSourceDoc != null) return resolvedListSourceDoc;

  for (const candidate of LIST_SOURCE_DOC_CANDIDATES) {
    try {
      await access(candidate);
      resolvedListSourceDoc = candidate;
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error(`No list fixture found. Tried: ${LIST_SOURCE_DOC_CANDIDATES.join(', ')}`);
}

function parseEnvelope(raw: RunResult): CommandEnvelope {
  const source = raw.stdout.trim() || raw.stderr.trim();
  if (!source) {
    throw new Error('No CLI envelope output found.');
  }

  try {
    return JSON.parse(source) as CommandEnvelope;
  } catch {
    const lines = source.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const candidate = lines.slice(index).join('\n').trim();
      if (!candidate.startsWith('{')) continue;
      try {
        return JSON.parse(candidate) as CommandEnvelope;
      } catch {
        // continue
      }
    }
    throw new Error(`Failed to parse CLI JSON envelope:\n${source}`);
  }
}

function assertSuccessEnvelope(envelope: CommandEnvelope): asserts envelope is SuccessEnvelope {
  if (envelope.ok !== true) {
    throw new Error(`Expected success envelope, got error: ${envelope.error.code} ${envelope.error.message}`);
  }
}

export class ConformanceHarness {
  readonly rootDir: string;
  readonly docsDir: string;
  readonly statesDir: string;
  #counter = 0;

  private constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.docsDir = path.join(rootDir, 'docs');
    this.statesDir = path.join(rootDir, 'states');
  }

  static async create(): Promise<ConformanceHarness> {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'superdoc-cli-conformance-'));
    const harness = new ConformanceHarness(rootDir);
    await mkdir(harness.docsDir, { recursive: true });
    await mkdir(harness.statesDir, { recursive: true });
    return harness;
  }

  async cleanup(): Promise<void> {
    await rm(this.rootDir, { recursive: true, force: true });
  }

  async createStateDir(label: string): Promise<string> {
    const dir = path.join(this.statesDir, `${this.nextId()}-${label}`);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async copyFixtureDoc(label: string): Promise<string> {
    const filePath = path.join(this.docsDir, `${this.nextId()}-${label}.docx`);
    await copyFile(SOURCE_DOC, filePath);
    return filePath;
  }

  async copyListFixtureDoc(label: string): Promise<string> {
    const filePath = path.join(this.docsDir, `${this.nextId()}-${label}.docx`);
    await copyFile(await resolveListSourceDoc(), filePath);
    return filePath;
  }

  createOutputPath(label: string): string {
    return path.join(this.docsDir, `${this.nextId()}-${label}.docx`);
  }

  async runCli(
    args: string[],
    stateDir: string,
    stdinBytes?: Uint8Array,
  ): Promise<{ result: RunResult; envelope: CommandEnvelope }> {
    const previousStateDir = process.env.SUPERDOC_CLI_STATE_DIR;
    process.env.SUPERDOC_CLI_STATE_DIR = stateDir;

    let stdout = '';
    let stderr = '';
    try {
      const code = await run(args, {
        stdout(message: string) {
          stdout += message;
        },
        stderr(message: string) {
          stderr += message;
        },
        async readStdinBytes() {
          return stdinBytes ?? new Uint8Array();
        },
      });

      const result: RunResult = { code, stdout, stderr };
      return { result, envelope: parseEnvelope(result) };
    } finally {
      if (previousStateDir == null) {
        delete process.env.SUPERDOC_CLI_STATE_DIR;
      } else {
        process.env.SUPERDOC_CLI_STATE_DIR = previousStateDir;
      }
    }
  }

  async firstTextRange(docPath: string, stateDir: string, pattern = 'Wilde'): Promise<TextRangeAddress> {
    const { result, envelope } = await this.runCli(
      ['find', docPath, '--type', 'text', '--pattern', pattern, '--limit', '1'],
      stateDir,
    );
    if (result.code !== 0) {
      throw new Error(`Unable to resolve first text range for ${docPath}`);
    }

    assertSuccessEnvelope(envelope);
    const data = envelope.data as {
      result?: {
        context?: Array<{
          textRanges?: TextRangeAddress[];
        }>;
      };
    };
    const range = data.result?.context?.[0]?.textRanges?.[0];
    if (!range) {
      throw new Error(`No text range found for pattern "${pattern}" in ${docPath}`);
    }
    return range;
  }

  async firstBlockMatch(
    docPath: string,
    stateDir: string,
    pattern = 'Wilde',
  ): Promise<{ nodeId: string; nodeType: string; address: Record<string, unknown> }> {
    const { result, envelope } = await this.runCli(
      ['find', docPath, '--type', 'text', '--pattern', pattern, '--limit', '1'],
      stateDir,
    );
    if (result.code !== 0) {
      throw new Error(`Unable to resolve first block match for ${docPath}`);
    }

    assertSuccessEnvelope(envelope);
    const data = envelope.data as {
      result?: {
        matches?: Array<Record<string, unknown>>;
      };
    };
    const match = data.result?.matches?.find(
      (entry) => entry.kind === 'block' && typeof entry.nodeId === 'string' && typeof entry.nodeType === 'string',
    );
    if (!match) {
      throw new Error(`No block match found for pattern "${pattern}" in ${docPath}`);
    }
    return {
      nodeId: match.nodeId as string,
      nodeType: match.nodeType as string,
      address: match,
    };
  }

  async firstListItemAddress(docPath: string, stateDir: string): Promise<ListItemAddress> {
    const { result, envelope } = await this.runCli(['lists', 'list', docPath, '--limit', '1'], stateDir);
    if (result.code !== 0) {
      throw new Error(`Unable to resolve first list item for ${docPath}`);
    }

    assertSuccessEnvelope(envelope);
    const data = envelope.data as {
      result?: {
        matches?: ListItemAddress[];
      };
    };
    const address = data.result?.matches?.[0];
    if (!address) {
      throw new Error(`No list item address found in ${docPath}`);
    }
    return address;
  }

  async addCommentFixture(
    stateDir: string,
    label: string,
  ): Promise<{ docPath: string; commentId: string; target: TextRangeAddress }> {
    const sourceDoc = await this.copyFixtureDoc(`${label}-source`);
    const target = await this.firstTextRange(sourceDoc, stateDir);
    const outDoc = this.createOutputPath(`${label}-with-comment`);

    const { result, envelope } = await this.runCli(
      [
        'comments',
        'add',
        sourceDoc,
        '--target-json',
        JSON.stringify(target),
        '--text',
        'Conformance seed comment',
        '--out',
        outDoc,
      ],
      stateDir,
    );
    if (result.code !== 0) {
      throw new Error(`Failed to create comment fixture for ${label}`);
    }

    assertSuccessEnvelope(envelope);
    const data = envelope.data as {
      receipt?: {
        inserted?: Array<{ entityId?: string }>;
      };
    };
    const commentId = data.receipt?.inserted?.[0]?.entityId;
    if (!commentId) {
      throw new Error(`Comment fixture did not return an inserted comment id for ${label}`);
    }

    return { docPath: outDoc, commentId, target };
  }

  async addTrackedChangeFixture(
    stateDir: string,
    label: string,
  ): Promise<{ docPath: string; changeId: string; target: TextRangeAddress }> {
    const sourceDoc = await this.copyFixtureDoc(`${label}-source`);
    const target = await this.firstTextRange(sourceDoc, stateDir);
    const collapsedTarget: TextRangeAddress = {
      ...target,
      range: { start: target.range.start, end: target.range.start },
    };
    const outDoc = this.createOutputPath(`${label}-with-tracked-change`);

    const insert = await this.runCli(
      [
        'insert',
        sourceDoc,
        '--target-json',
        JSON.stringify(collapsedTarget),
        '--text',
        'TRACKED_CONFORMANCE_TOKEN',
        '--change-mode',
        'tracked',
        '--out',
        outDoc,
      ],
      stateDir,
    );
    if (insert.result.code !== 0) {
      throw new Error(`Failed to create tracked-change fixture for ${label}`);
    }

    const list = await this.runCli(['track-changes', 'list', outDoc, '--limit', '1'], stateDir);
    if (list.result.code !== 0) {
      throw new Error(`Failed to list tracked changes for fixture ${label}`);
    }
    assertSuccessEnvelope(list.envelope);
    const matches =
      (list.envelope.data as { result?: { matches?: Array<{ entityId?: string }> } }).result?.matches ?? [];
    const changeId = matches[0]?.entityId;
    if (!changeId) {
      throw new Error(`Tracked-change fixture did not produce a tracked change id for ${label}`);
    }

    return { docPath: outDoc, changeId, target: collapsedTarget };
  }

  async openSessionFixture(
    stateDir: string,
    label: string,
    sessionId: string,
  ): Promise<{ sessionId: string; docPath: string }> {
    const docPath = await this.copyFixtureDoc(`${label}-source`);
    const open = await this.runCli(['open', docPath, '--session', sessionId], stateDir);
    if (open.result.code !== 0) {
      throw new Error(`Failed to open session fixture ${sessionId}`);
    }
    return { sessionId, docPath };
  }

  nextId(): string {
    this.#counter += 1;
    return String(this.#counter).padStart(4, '0');
  }
}
