import {
  createDocApi,
  createBoundDocApi,
  type BoundDocApi,
  type DocCloseBoundParams,
  type DocCloseResult,
  type DocOpenParams as GeneratedDocOpenParams,
  type DocOpenResult,
  type DocSaveBoundParams,
  type DocSaveResult,
} from './generated/client.js';
import { CONTRACT } from './generated/contract.js';
import {
  SuperDocRuntime,
  type SuperDocClientOptions,
  type InvokeOptions,
  type OperationSpec,
  type RuntimeInvoker,
} from './runtime/process.js';
import { SuperDocCliError } from './runtime/errors.js';

// ---------------------------------------------------------------------------
// Session-bound runtime wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a raw runtime and injects a fixed sessionId into every invoke call.
 * Implements RuntimeInvoker so generated code can use it directly.
 *
 * @internal
 */
class BoundRuntime implements RuntimeInvoker {
  private readonly runtime: SuperDocRuntime;
  private readonly sessionId: string;
  private closed = false;

  constructor(runtime: SuperDocRuntime, sessionId: string) {
    this.runtime = runtime;
    this.sessionId = sessionId;
  }

  async invoke<TData = unknown>(
    operation: OperationSpec,
    params: Record<string, unknown> = {},
    options: InvokeOptions = {},
  ): Promise<TData> {
    if (this.closed) {
      throw new SuperDocCliError('Document handle is closed.', {
        code: 'DOCUMENT_CLOSED',
        details: { sessionId: this.sessionId },
      });
    }
    return this.runtime.invoke<TData>(operation, { ...params, sessionId: this.sessionId }, options);
  }

  markClosed(): void {
    this.closed = true;
  }
}

// ---------------------------------------------------------------------------
// Document handle
// ---------------------------------------------------------------------------

/**
 * Bound document handle. All document operations are available as typed methods.
 * The handle injects its session id automatically — callers never pass
 * doc or sessionId.
 */
class SuperDocDocumentCore {
  private readonly boundRuntime: BoundRuntime;
  private readonly _sessionId: string;
  private readonly _openResult: DocOpenResult;
  private readonly client: SuperDocClient;

  /** @internal */
  constructor(boundRuntime: BoundRuntime, sessionId: string, openResult: DocOpenResult, client: SuperDocClient) {
    this.boundRuntime = boundRuntime;
    this._sessionId = sessionId;
    this._openResult = openResult;
    this.client = client;
    attachBoundDocApi(this, createBoundDocApi(this.boundRuntime));
  }

  get sessionId(): string {
    return this._sessionId;
  }

  /** Read-only snapshot of the initial doc.open response metadata. */
  get openResult(): DocOpenResult {
    return this._openResult;
  }

  async save(params: DocSaveBoundParams = {}, options: InvokeOptions = {}): Promise<DocSaveResult> {
    return this.boundRuntime.invoke<DocSaveResult>(
      CONTRACT.operations['doc.save'],
      params as unknown as Record<string, unknown>,
      options,
    );
  }

  async close(params: DocCloseBoundParams = {}, options: InvokeOptions = {}): Promise<DocCloseResult> {
    const result = await this.boundRuntime.invoke<DocCloseResult>(
      CONTRACT.operations['doc.close'],
      params as unknown as Record<string, unknown>,
      options,
    );
    this.boundRuntime.markClosed();
    this.client.removeHandle(this._sessionId);
    return result;
  }

  /** @internal */
  markClosed(): void {
    this.boundRuntime.markClosed();
  }
}

type SuperDocDocumentInstance = SuperDocDocumentCore & BoundDocApi;

function attachBoundDocApi(target: SuperDocDocumentCore, api: BoundDocApi): void {
  const { save: _save, close: _close, ...boundMethods } = api;
  Object.assign(target, boundMethods);
}

export const SuperDocDocument: new (
  boundRuntime: BoundRuntime,
  sessionId: string,
  openResult: DocOpenResult,
  client: SuperDocClient,
) => SuperDocDocumentInstance = SuperDocDocumentCore as unknown as new (
  boundRuntime: BoundRuntime,
  sessionId: string,
  openResult: DocOpenResult,
  client: SuperDocClient,
) => SuperDocDocumentInstance;

export type SuperDocDocument = SuperDocDocumentInstance;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export type DocOpenParams = GeneratedDocOpenParams;

export interface DocDescribeCommandParams {
  operationId: string;
  [key: string]: unknown;
}

/**
 * SuperDoc client — transport manager and document factory.
 *
 * Use `client.open()` to get bound document handles. Each handle is
 * independently session-scoped and safe for concurrent use.
 *
 *     const client = new SuperDocClient({ user: { name: 'bot' } });
 *     await client.connect();
 *     const doc = await client.open({ doc: './file.docx' });
 *     const markdown = await doc.getMarkdown();
 *     await doc.close();
 *     await client.dispose();
 */
export class SuperDocClient {
  private readonly runtime: SuperDocRuntime;
  private readonly rawApi: ReturnType<typeof createDocApi>;
  private readonly handles = new Map<string, SuperDocDocument>();

  constructor(options: SuperDocClientOptions = {}) {
    this.runtime = new SuperDocRuntime(options);
    this.rawApi = createDocApi(this.runtime);
  }

  async connect(): Promise<void> {
    await this.runtime.connect();
  }

  /**
   * Open a document and return a bound document handle.
   *
   * The returned handle injects its session id into every operation
   * automatically. The same file can be opened multiple times with
   * different session ids (useful for diff workflows).
   */
  async open(params: DocOpenParams, options?: InvokeOptions): Promise<SuperDocDocument> {
    const explicitSessionId = params.sessionId;
    if (typeof explicitSessionId === 'string' && this.handles.has(explicitSessionId)) {
      throw new SuperDocCliError(`Session id already open in this client: ${explicitSessionId}`, {
        code: 'SESSION_ALREADY_OPEN',
        details: { sessionId: explicitSessionId },
      });
    }

    const result = (await this.rawApi.open(params, options)) as DocOpenResult;
    const contextId = result.contextId;

    const boundRuntime = new BoundRuntime(this.runtime, contextId);
    const handle = new SuperDocDocument(boundRuntime, contextId, result, this);
    this.handles.set(contextId, handle);
    return handle;
  }

  async describe(params: Record<string, unknown> = {}, options?: InvokeOptions): Promise<unknown> {
    return this.rawApi.describe(params, options);
  }

  async describeCommand(params: DocDescribeCommandParams, options?: InvokeOptions): Promise<unknown> {
    return this.rawApi.describeCommand(params, options);
  }

  async dispose(): Promise<void> {
    for (const handle of this.handles.values()) {
      handle.markClosed();
    }
    this.handles.clear();
    await this.runtime.dispose();
  }

  /** @internal */
  removeHandle(sessionId: string): void {
    this.handles.delete(sessionId);
  }
}

export function createSuperDocClient(options: SuperDocClientOptions = {}): SuperDocClient {
  return new SuperDocClient(options);
}

export { getSkill, installSkill, listSkills } from './skills.js';
export { chooseTools, dispatchSuperDocTool, getSystemPrompt, getToolCatalog, listTools } from './tools.js';
export { dispatchIntentTool } from './generated/intent-dispatch.generated.js';
export { SuperDocCliError } from './runtime/errors.js';
export type {
  InvokeOptions,
  OperationSpec,
  OperationParamSpec,
  RuntimeInvoker,
  SuperDocClientOptions,
} from './runtime/process.js';
export type { ToolChooserInput, ToolProvider } from './tools.js';
export type { DocOpenResult } from './generated/client.js';
