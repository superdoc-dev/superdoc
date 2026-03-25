# SuperDoc

> The document engine for DOCX files.

[![Documentation](https://img.shields.io/badge/docs-available-1355ff.svg)](https://docs.superdoc.dev/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-1355ff.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![npm version](https://img.shields.io/npm/v/superdoc.svg?color=1355ff)](https://www.npmjs.com/package/superdoc)
[![Discord](https://img.shields.io/badge/discord-join-1355ff)](https://discord.com/invite/b9UuaZRyaB)

SuperDoc renders and edits DOCX files in the browser. Built on OOXML — not bolted onto HTML. As you type, you write directly to the XML. Import a document, edit it, export it. Nothing lost.

## Features

- **Real DOCX, not rich text** — Built on OOXML. Real pagination, section breaks, headers/footers, complex tables. Not a contenteditable wrapper with export bolted on.
- **Self-hosted** — Runs entirely in the browser. Your documents never leave your servers.
- **Any framework** — React, Vue, Angular, Svelte, vanilla JS. One component, zero lock-in.
- **Real-time collaboration** — Yjs-based CRDT. Multiplayer editing with comments, tracked changes, and automatic conflict resolution.
- **Built for agents** — [SDK](https://www.npmjs.com/package/@superdoc-dev/sdk), [CLI](https://www.npmjs.com/package/@superdoc-dev/cli), and [MCP server](https://www.npmjs.com/package/@superdoc-dev/mcp) let LLMs read, edit, and save .docx files programmatically.
- **Dual licensed** — AGPLv3 for community use. [Commercial license](https://www.superdocportal.dev/get-in-touch) for proprietary deployments.

## Quick start

```bash
npm install superdoc
```

```javascript
import 'superdoc/style.css';
import { SuperDoc } from 'superdoc';

const superdoc = new SuperDoc({
  selector: '#superdoc',
  documents: [
    {
      id: 'my-doc-id',
      type: 'docx',
      data: fileObject,
    },
  ],
});
```

For React, Vue, and other frameworks, see the [documentation](https://docs.superdoc.dev).

### Using an AI coding agent?

```bash
npx @superdoc-dev/create              # generates AGENTS.md for your framework
claude mcp add superdoc -- npx @superdoc-dev/mcp   # connect agent to DOCX files
```

## Documentation

[docs.superdoc.dev](https://docs.superdoc.dev) — installation, integration guides, collaboration setup, API reference, and more.

## Contributing

Check the [issue tracker](https://github.com/superdoc-dev/superdoc/issues) for open issues, or read the [Contributing Guide](../../CONTRIBUTING.md) to get started. Bug reports with reproduction .docx files are especially valuable.

## Community

- [Discord](https://discord.com/invite/b9UuaZRyaB) — Chat with the team and other contributors
- [Email](mailto:q@superdoc.dev) — Reach the team directly

## License

- Open source: [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)
- Commercial: [Enterprise License](https://www.superdocportal.dev/get-in-touch)

---

Created and maintained by [Harbour](https://www.superdoc.dev) and the SuperDoc community.
