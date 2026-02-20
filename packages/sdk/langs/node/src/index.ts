import { createDocApi } from './generated/client.js';
import { SuperDocRuntime, type SuperDocClientOptions } from './runtime/process.js';

/**
 * High-level client for interacting with SuperDoc documents via the CLI.
 *
 * Provides a typed `doc` API for opening, querying, and mutating documents.
 * Call {@link connect} before operations and {@link dispose} when finished
 * to manage the host process lifecycle.
 */
export class SuperDocClient {
  private readonly runtime: SuperDocRuntime;
  readonly doc: ReturnType<typeof createDocApi>;

  constructor(options: SuperDocClientOptions = {}) {
    this.runtime = new SuperDocRuntime(options);
    this.doc = createDocApi(this.runtime);
  }

  async connect(): Promise<void> {
    await this.runtime.connect();
  }

  async dispose(): Promise<void> {
    await this.runtime.dispose();
  }
}

export function createSuperDocClient(options: SuperDocClientOptions = {}): SuperDocClient {
  return new SuperDocClient(options);
}

export { getSkill, installSkill, listSkills } from './skills.js';
export {
  chooseTools,
  dispatchSuperDocTool,
  getToolCatalog,
  inferDocumentFeatures,
  listTools,
  resolveToolOperation,
} from './tools.js';
export { SuperDocCliError } from './runtime/errors.js';
export type { InvokeOptions, OperationSpec, OperationParamSpec, SuperDocClientOptions } from './runtime/process.js';
export type { DocumentFeatures, ToolChooserInput, ToolPhase, ToolProfile, ToolProvider } from './tools.js';
