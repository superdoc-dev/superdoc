import { copyFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run } from '../../index';
import {
  resolveListDocFixture,
  resolvePreSeparatedListFixture,
  resolveSourceDocFixture,
  resolveTocDocFixture,
} from '../fixtures';

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

export type TocAddress = {
  kind: 'block';
  nodeType: 'tableOfContents';
  nodeId: string;
};

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
    await copyFile(await resolveSourceDocFixture(), filePath);
    return filePath;
  }

  async copyListFixtureDoc(label: string): Promise<string> {
    const filePath = path.join(this.docsDir, `${this.nextId()}-${label}.docx`);
    await copyFile(await resolveListDocFixture(), filePath);
    return filePath;
  }

  async copyPreSeparatedListDoc(label: string): Promise<string> {
    const filePath = path.join(this.docsDir, `${this.nextId()}-${label}.docx`);
    await copyFile(await resolvePreSeparatedListFixture(), filePath);
    return filePath;
  }

  async copyTocFixtureDoc(label: string, stateDir: string): Promise<string> {
    const filePath = path.join(this.docsDir, `${this.nextId()}-${label}.docx`);

    try {
      await copyFile(await resolveTocDocFixture(), filePath);
      const probe = await this.runCli(['toc', 'list', filePath, '--limit', '1'], stateDir);
      if (probe.result.code === 0) {
        return filePath;
      }
    } catch {
      // Fall back to creating a TOC fixture from the generic source doc.
    }

    const sourceDoc = await this.copyFixtureDoc(`${label}-seed`);
    const seededPath = path.join(this.docsDir, `${this.nextId()}-${label}-seeded.docx`);
    const { result, envelope } = await this.runCli(
      ['create', 'table-of-contents', sourceDoc, '--out', seededPath],
      stateDir,
    );

    if (result.code !== 0 || envelope.ok !== true) {
      const details = envelope.ok
        ? 'unexpected non-success envelope'
        : `${envelope.error.code}: ${envelope.error.message}`;
      throw new Error(`Unable to seed TOC fixture for ${label}: ${details}`);
    }

    return seededPath;
  }

  createOutputPath(label: string): string {
    return path.join(this.docsDir, `${this.nextId()}-${label}.docx`);
  }

  async runCli(
    args: string[],
    stateDir: string,
    stdinBytes?: Uint8Array,
  ): Promise<{ result: RunResult; envelope: CommandEnvelope }> {
    let stdout = '';
    let stderr = '';
    const code = await run(
      args,
      {
        stdout(message: string) {
          stdout += message;
        },
        stderr(message: string) {
          stderr += message;
        },
        async readStdinBytes() {
          return stdinBytes ?? new Uint8Array();
        },
      },
      { stateDir },
    );

    const result: RunResult = { code, stdout, stderr };
    return { result, envelope: parseEnvelope(result) };
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
        items?: Array<{
          node?: { kind?: string; [key: string]: unknown };
          address?: { kind?: string; nodeId?: string };
        }>;
      };
    };
    const item = data.result?.items?.[0];
    const address = item?.address;
    if (!address?.nodeId) {
      throw new Error(`No text match found for pattern "${pattern}" in ${docPath}`);
    }

    // Extract concatenated text from the SDM/1 node's inline content
    const node = item?.node as Record<string, unknown> | undefined;
    const nodeKind = node?.kind as string | undefined;
    const kindData = nodeKind ? (node?.[nodeKind] as Record<string, unknown> | undefined) : undefined;
    const inlines = Array.isArray(kindData?.inlines) ? kindData!.inlines : [];
    let fullText = '';
    for (const inline of inlines) {
      if (typeof inline === 'object' && inline != null && (inline as Record<string, unknown>).kind === 'run') {
        const runData = (inline as Record<string, unknown>).run as Record<string, unknown> | undefined;
        if (typeof runData?.text === 'string') fullText += runData.text as string;
      }
    }

    // Find the pattern within the text for a precise range
    const matchIndex = fullText.indexOf(pattern);
    const start = matchIndex >= 0 ? matchIndex : 0;
    const end = matchIndex >= 0 ? matchIndex + pattern.length : Math.max(fullText.length, 1);

    return {
      kind: 'text',
      blockId: address.nodeId,
      range: { start, end },
    };
  }

  async firstBlockMatch(
    docPath: string,
    stateDir: string,
  ): Promise<{ nodeId: string; nodeType: string; address: Record<string, unknown> }> {
    const { result, envelope } = await this.runCli(
      ['find', docPath, '--type', 'node', '--node-type', 'paragraph', '--limit', '1'],
      stateDir,
    );
    if (result.code !== 0) {
      throw new Error(`Unable to resolve first block match for ${docPath}`);
    }

    assertSuccessEnvelope(envelope);
    const data = envelope.data as {
      result?: {
        items?: Array<{
          node?: { kind?: string };
          address?: Record<string, unknown>;
        }>;
      };
    };
    const item = data.result?.items?.[0];
    const sdAddress = item?.address;
    const nodeKind = item?.node?.kind;
    if (!sdAddress || typeof sdAddress.nodeId !== 'string') {
      throw new Error(`No block match found in ${docPath}`);
    }
    const nodeType = typeof nodeKind === 'string' ? nodeKind : 'paragraph';
    // Build a legacy NodeAddress for consumers that still expect { kind: 'block', nodeType, nodeId }
    const legacyAddress: Record<string, unknown> = {
      kind: 'block',
      nodeType,
      nodeId: sdAddress.nodeId as string,
    };
    return {
      nodeId: sdAddress.nodeId as string,
      nodeType,
      address: legacyAddress,
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
        items?: Array<{
          address?: ListItemAddress;
        }>;
      };
    };
    const address = data.result?.items?.[0]?.address;
    if (!address) {
      throw new Error(`No list item address found in ${docPath}`);
    }
    return address;
  }

  async firstTocAddress(docPath: string, stateDir: string): Promise<TocAddress> {
    const { result, envelope } = await this.runCli(['toc', 'list', docPath, '--limit', '1'], stateDir);
    if (result.code !== 0) {
      throw new Error(`Unable to resolve first table of contents for ${docPath}`);
    }

    assertSuccessEnvelope(envelope);
    const data = envelope.data as {
      result?: {
        items?: Array<{
          address?: TocAddress;
        }>;
      };
    };
    const address = data.result?.items?.[0]?.address;
    if (!address) {
      throw new Error(`No table of contents address found in ${docPath}`);
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
        '--value',
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
    const items =
      (list.envelope.data as { result?: { items?: Array<{ address?: { entityId?: string } }> } }).result?.items ?? [];
    const changeId = items[0]?.address?.entityId;
    if (!changeId) {
      throw new Error(`Tracked-change fixture did not produce a tracked change id for ${label}`);
    }

    return { docPath: outDoc, changeId, target: collapsedTarget };
  }

  async firstTwoBlockAddresses(
    docPath: string,
    stateDir: string,
  ): Promise<{ first: { nodeId: string; nodeType: string }; second: { nodeId: string; nodeType: string } }> {
    const { result, envelope } = await this.runCli(['blocks', 'list', docPath, '--limit', '5'], stateDir);
    if (result.code !== 0) {
      throw new Error(`Unable to list blocks for ${docPath}`);
    }

    assertSuccessEnvelope(envelope);
    const data = envelope.data as {
      result?: {
        blocks?: Array<{ nodeId?: string; nodeType?: string }>;
      };
    };
    const blocks = data.result?.blocks ?? [];
    if (blocks.length < 2) {
      throw new Error(`Need at least 2 blocks in ${docPath}, found ${blocks.length}`);
    }
    const first = blocks[0]!;
    const second = blocks[1]!;
    if (!first.nodeId || !first.nodeType || !second.nodeId || !second.nodeType) {
      throw new Error(`Block entries missing nodeId or nodeType in ${docPath}`);
    }
    return {
      first: { nodeId: first.nodeId, nodeType: first.nodeType },
      second: { nodeId: second.nodeId, nodeType: second.nodeType },
    };
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

  /**
   * Creates a doc with a 3x3 table and opens it in a session.
   *
   * Because sdBlockId is regenerated on each document open, nodeIds are only
   * stable within a single session. This method creates the table, then opens
   * the output doc in a persistent session and discovers the table nodeId via
   * `find`. Subsequent commands must use `--session` to stay in the same
   * address space.
   */
  async createTableFixture(
    stateDir: string,
    label: string,
  ): Promise<{ docPath: string; tableNodeId: string; cellNodeId: string; sessionId: string }> {
    const sourceDoc = await this.copyFixtureDoc(`${label}-source`);
    const outDoc = this.createOutputPath(`${label}-with-table`);

    const { result } = await this.runCli(
      ['create', 'table', sourceDoc, '--rows', '3', '--columns', '3', '--out', outDoc],
      stateDir,
    );
    if (result.code !== 0) {
      throw new Error(`Failed to create table fixture for ${label}`);
    }

    // Open the output doc in a session so the nodeId stays stable
    const sessionId = `table-${label}-session`;
    const open = await this.runCli(['open', outDoc, '--session', sessionId], stateDir);
    if (open.result.code !== 0) {
      throw new Error(`Failed to open table session for ${label}`);
    }

    // Discover the table nodeId within the session
    const { result: findResult, envelope: findEnvelope } = await this.runCli(
      ['find', '--session', sessionId, '--type', 'node', '--node-type', 'table', '--limit', '1'],
      stateDir,
    );
    if (findResult.code !== 0) {
      throw new Error(`Unable to find table in session for ${label}`);
    }
    assertSuccessEnvelope(findEnvelope);
    const data = findEnvelope.data as {
      result?: { items?: Array<{ address?: { nodeId?: string } }> };
    };
    const tableNodeId = data.result?.items?.[0]?.address?.nodeId;
    if (!tableNodeId) {
      throw new Error(`No table found in session for ${label}`);
    }

    // Discover a cell nodeId within the same session
    const { result: cellResult, envelope: cellEnvelope } = await this.runCli(
      ['find', '--session', sessionId, '--type', 'node', '--node-type', 'tableCell', '--limit', '1'],
      stateDir,
    );
    if (cellResult.code !== 0) {
      throw new Error(`Unable to find table cell in session for ${label}`);
    }
    assertSuccessEnvelope(cellEnvelope);
    const cellData = cellEnvelope.data as {
      result?: { items?: Array<{ address?: { nodeId?: string } }> };
    };
    const cellNodeId = cellData.result?.items?.[0]?.address?.nodeId;
    if (!cellNodeId) {
      throw new Error(`No table cell found in session for ${label}`);
    }

    return { docPath: outDoc, tableNodeId, cellNodeId, sessionId };
  }

  nextId(): string {
    this.#counter += 1;
    return String(this.#counter).padStart(4, '0');
  }
}
