export interface McpSnippetOptions {
  roomId: string;
  mcpUrl?: string;
  collaborationUrl?: string;
  token?: string;
}

export interface McpSnippets {
  mcpUrl: string;
  token: string;
  codexCommand: string;
  claudeCommand: string;
  attachPrompt: string;
}

export function createMcpSnippets(options: McpSnippetOptions): McpSnippets {
  const roomId = requireSingleLine(options.roomId, 'room ID');
  const mcpUrl = requireSingleLine(options.mcpUrl ?? 'http://127.0.0.1:8091/mcp', 'MCP URL');
  const collaborationUrl = requireSingleLine(options.collaborationUrl ?? 'ws://127.0.0.1:8081', 'collaboration URL');
  const token = requireSingleLine(options.token ?? 'superdoc-demo', 'bearer token');

  return {
    mcpUrl,
    token,
    codexCommand: [
      `export MCP_DEMO_TOKEN=${shellWord(token)}`,
      'codex mcp add superdoc-live \\',
      `  --url ${shellWord(mcpUrl)} \\`,
      '  --bearer-token-env-var MCP_DEMO_TOKEN',
    ].join('\n'),
    claudeCommand: [
      'claude mcp add \\',
      '  --transport http \\',
      `  --header "Authorization: Bearer ${escapeDoubleQuoted(token)}" \\`,
      '  superdoc-live \\',
      `  ${shellWord(mcpUrl)}`,
    ].join('\n'),
    attachPrompt: [
      'Call superdoc_attach with:',
      `- ws_url: ${collaborationUrl}`,
      `- document_id: ${roomId}`,
      '- user: { id: "external-agent", name: "Codex" }',
      '',
      'Review the open document, identify opportunities for improvement, and make',
      'those improvements using tracked changes. The document is already visible',
      'in SuperDoc.',
    ].join('\n'),
  };
}

function requireSingleLine(value: string, label: string): string {
  if (!value || /[\r\n]/.test(value)) throw new Error(`${label} must be a non-empty single line.`);
  return value;
}

function shellWord(value: string): string {
  if (/^[a-zA-Z0-9_./:@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeDoubleQuoted(value: string): string {
  return value.replace(/[\\"$`]/g, '\\$&');
}
