import { HostTransport } from './host.js';
import { resolveEmbeddedCliBinary } from './embedded-cli.js';
import type { InvokeOptions, OperationParamSpec, OperationSpec, SuperDocClientOptions } from './transport-common.js';

/**
 * Internal runtime that delegates CLI invocations to a persistent host transport.
 *
 * Resolves the CLI binary and creates a {@link HostTransport} that communicates
 * with a long-lived `superdoc host --stdio` process.
 */
export class SuperDocRuntime {
  private readonly transport: HostTransport;

  constructor(options: SuperDocClientOptions = {}) {
    const cliBin = options.env?.SUPERDOC_CLI_BIN ?? process.env.SUPERDOC_CLI_BIN ?? resolveEmbeddedCliBinary();

    this.transport = new HostTransport({
      cliBin,
      ...options,
    });
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async dispose(): Promise<void> {
    await this.transport.dispose();
  }

  async invoke<TData extends Record<string, unknown>>(
    operation: OperationSpec,
    params: Record<string, unknown> = {},
    options: InvokeOptions = {},
  ): Promise<TData> {
    return this.transport.invoke<TData>(operation, params, options);
  }
}

export type { InvokeOptions, OperationParamSpec, OperationSpec, SuperDocClientOptions };
