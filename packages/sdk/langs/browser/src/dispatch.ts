import { dispatchIntentTool } from './intent-dispatch';
import { validateToolArgs } from './validate';
import { getCatalogJson } from './assets';
import type { ToolCatalogEntry } from './validate';

/**
 * A minimal interface matching DocumentApi.invoke().
 * Avoids a hard compile-time dependency on @superdoc/document-api
 * while still being type-safe for consumers that pass a real DocumentApi.
 */
export interface InvokableDocumentApi {
  invoke(request: { operationId: string; input: unknown; options?: unknown }): unknown;
}

/**
 * Dispatch an LLM tool call against an in-browser DocumentApi.
 *
 * Drop-in replacement for the Node SDK's dispatchSuperDocTool.
 * Instead of routing through a CLI process, this calls documentApi.invoke() directly.
 *
 * The catalog is loaded automatically from the bundled JSON — no setup needed.
 */
export function dispatchSuperDocTool(
  documentApi: InvokableDocumentApi,
  toolName: string,
  args: Record<string, unknown> = {},
): unknown {
  const catalog = getCatalogJson();
  const tool = catalog.tools.find((t: ToolCatalogEntry) => t.toolName === toolName);
  if (!tool) {
    throw new Error(
      `Unknown tool: "${toolName}". Available: ${catalog.tools.map((t: ToolCatalogEntry) => t.toolName).join(', ')}`,
    );
  }

  validateToolArgs(toolName, args, tool);

  // Strip doc/sessionId — not relevant in browser context
  const { doc: _doc, sessionId: _sid, ...cleanArgs } = args;

  return dispatchIntentTool(toolName, cleanArgs, (operationId, input) => {
    // Intent dispatch produces "doc.insert", "doc.format.apply", etc.
    // DocumentApi.invoke() expects the id without "doc." prefix: "insert", "format.apply"
    const stripped = operationId.startsWith('doc.') ? operationId.slice(4) : operationId;

    // Extract envelope params — these go into options, not input
    const { changeMode, dryRun, force, ...operationInput } = input;
    const options: Record<string, unknown> = {};
    if (changeMode !== undefined) options.changeMode = changeMode;
    if (dryRun !== undefined) options.dryRun = dryRun;
    if (force !== undefined) options.force = force;

    return documentApi.invoke({
      operationId: stripped,
      input: operationInput,
      ...(Object.keys(options).length > 0 ? { options } : {}),
    });
  });
}
