import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMcpSnippets } from './mcp-snippets';

describe('createMcpSnippets', () => {
  it('interpolates the endpoint, token, room, and collaboration URL', () => {
    const snippets = createMcpSnippets({
      roomId: 'quiet-fox-42',
      mcpUrl: 'http://127.0.0.1:9991/mcp',
      collaborationUrl: 'ws://127.0.0.1:9992',
      token: 'test-token',
    });

    assert.equal(
      snippets.codexCommand,
      'export MCP_DEMO_TOKEN=test-token\n' +
        'codex mcp add superdoc-live \\\n' +
        '  --url http://127.0.0.1:9991/mcp \\\n' +
        '  --bearer-token-env-var MCP_DEMO_TOKEN',
    );
    assert.equal(
      snippets.claudeCommand,
      'claude mcp add \\\n' +
        '  --transport http \\\n' +
        '  --header "Authorization: Bearer test-token" \\\n' +
        '  superdoc-live \\\n' +
        '  http://127.0.0.1:9991/mcp',
    );
    assert.equal(
      snippets.attachPrompt,
      'Call superdoc_attach with:\n' +
        '- ws_url: ws://127.0.0.1:9992\n' +
        '- document_id: quiet-fox-42\n' +
        '- user: { id: "external-agent", name: "Codex" }\n' +
        '\n' +
        'Read the open document and make the requested edits. Use tracked changes\n' +
        'when requested. The document is already visible in SuperDoc.',
    );
  });

  it('escapes shell-sensitive connection values', () => {
    const snippets = createMcpSnippets({
      roomId: 'quiet-fox-42',
      token: 'token$value',
      mcpUrl: 'http://127.0.0.1:8091/mcp?label=two words',
    });

    assert.match(snippets.codexCommand, /MCP_DEMO_TOKEN='token\$value'/);
    assert.match(snippets.codexCommand, /--url 'http:\/\/127\.0\.0\.1:8091\/mcp\?label=two words'/);
    assert.match(snippets.claudeCommand, /Bearer token\\\$value/);
  });
});
