<h1 align="center">
  <a href="https://www.superdoc.dev" target="_blank">
    <img alt="SuperDoc logo" src="https://storage.googleapis.com/public_statichosting/SuperDocHomepage/logo.webp" width="170px" height="auto" />
  </a>
  <BR />
  <a href="https://www.superdoc.dev" target="_blank">
    SuperDoc
  </a>
</h1>

<div align="center">
  <a href="https://www.npmjs.com/package/superdoc" target="_blank"><img src="https://img.shields.io/npm/v/superdoc.svg?color=1355ff" height="22px"></a>
  <a href="https://www.npmjs.com/package/superdoc" target="_blank"><img src="https://img.shields.io/npm/dm/superdoc.svg?color=1355ff" height="22px"></a>
  <a href="https://www.gnu.org/licenses/agpl-3.0" target="_blank"><img src="https://img.shields.io/badge/License-AGPL%20v3-1355ff.svg?color=1355ff" height="22px"></a>
  <a href="https://github.com/superdoc-dev/superdoc" target="_blank"><img src="https://img.shields.io/github/stars/superdoc-dev/superdoc?style=flat&color=1355ff" height="22px"></a>
  <a href="https://discord.com/invite/b9UuaZRyaB" target="_blank"><img src="https://img.shields.io/badge/discord-join-1355ff" height="22px"></a>
</div>

<p align="center">
  <strong>A JavaScript library that renders and edits .docx files in the browser.</strong><br>
  Tracked changes, complex tables, headers/footers, real-time collaboration — the features your users actually need.<br>
  Self-hosted. Open source. Works with React, Vue, and vanilla JS.
</p>

<div align="center">
  <a href="https://www.superdoc.dev" target="_blank">
    <img alt="SuperDoc editor screenshot" src="https://storage.googleapis.com/public_statichosting/SuperDocHomepage/screeenshot.png" width="600px" height="auto" />
  </a>
</div>

## Quick start

```bash
npm install superdoc
```

### React

```bash
npm install @superdoc-dev/react
```

```tsx
import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';

function App() {
  return (
    <SuperDocEditor
      document={file}
      documentMode="editing"
      onReady={() => console.log('Ready!')}
    />
  );
}
```

See the [@superdoc-dev/react README](packages/react/README.md) for full React documentation.

### Vanilla JavaScript

```javascript
import 'superdoc/style.css';
import { SuperDoc } from 'superdoc';

const superdoc = new SuperDoc({
  selector: '#superdoc',
  toolbar: '#superdoc-toolbar',
  document: '/sample.docx',
  documentMode: 'editing',
});
```

Or use the CDN:

```html
<link rel="stylesheet" href="https://unpkg.com/superdoc/dist/style.css" />
<script type="module" src="https://unpkg.com/superdoc/dist/superdoc.umd.js"></script>
```

For all available options and events, see the [documentation](https://docs.superdoc.dev) or [SuperDoc.js](packages/superdoc/src/core/SuperDoc.js).

## Features

- **Real DOCX, not rich text** — Built on OOXML. Real pagination, section breaks, headers/footers. Not a contenteditable wrapper with export bolted on.
- **Self-hosted** — Runs entirely in the browser. Your documents never leave your servers.
- **Any framework** — React, Vue, Angular, Svelte, vanilla JS. One component, zero lock-in.
- **Real-time collaboration** — Yjs-based CRDT. Multiplayer editing with comments, tracked changes, and automatic conflict resolution.
- **Agentic tooling** — Runs headless in Node.js. Bring your own LLM for document automation, redlining, and template workflows.
- **Extensible** — 60+ built-in extensions. Write custom plugins with full ProseMirror access.
- **Dual licensed** — AGPLv3 for community use. [Commercial license](https://www.superdocportal.dev/get-in-touch) for proprietary deployments.

## Examples

Starter projects to get you running quickly:

| Example | |
|---------|--|
| [React](examples/getting-started/react) | [Vue](examples/getting-started/vue) |
| [Angular](examples/getting-started/angular) | [Next.js](examples/getting-started/nextjs) |
| [Vanilla JS](examples/getting-started/vanilla) | [CDN](examples/getting-started/cdn) |
| [Comments](examples/features/comments) | [Track changes](examples/features/track-changes) |
| [Custom toolbar](examples/features/custom-toolbar) | [AI redlining](examples/features/ai-redlining) |
| [Headless AI redlining](examples/headless/ai-redlining) | |

[Browse all examples](examples/)

## Documentation

[docs.superdoc.dev](https://docs.superdoc.dev) — installation, integration guides, collaboration setup, API reference, and more.

## Roadmap

See the [SuperDoc roadmap](https://github.com/superdoc-dev/superdoc/wiki/%F0%9F%8E%AF%EF%B8%8F-SuperDoc-Roadmap) for what's coming next. DOCX import/export fidelity is always a top priority.

## Contributing

Check the [issue tracker](https://github.com/superdoc-dev/superdoc/issues) for open issues, or read the [Contributing Guide](CONTRIBUTING.md) to get started. Bug reports with reproduction .docx files are especially valuable.

## Community

- [Discord](https://discord.com/invite/b9UuaZRyaB) — Chat with the team and other contributors
- [Email](mailto:q@superdoc.dev) — Reach the team directly

## License

- Open source: [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)
- Commercial: [Enterprise License](https://www.superdocportal.dev/get-in-touch)

## Acknowledgments

Built on <a href="https://prosemirror.net" target="_blank">ProseMirror</a>, <a href="https://github.com/yjs/yjs" target="_blank">Yjs</a>, <a href="https://stuk.github.io/jszip/" target="_blank">JSZip</a>, and <a href="https://vite.dev" target="_blank">Vite</a>.

## Community Contributors

Special thanks to these community members who have contributed code to SuperDoc:

<a href="https://github.com/financialvice"><img src="https://github.com/financialvice.png" width="50" height="50" alt="financialvice" title="financialvice" /></a>
<a href="https://github.com/luciorubeens"><img src="https://github.com/luciorubeens.png" width="50" height="50" alt="luciorubeens" title="Lúcio Caetano" /></a>
<a href="https://github.com/Dannyhvv"><img src="https://github.com/Dannyhvv.png" width="50" height="50" alt="Dannyhvv" title="Dannyhvv" /></a>
<a href="https://github.com/henriquedevelops"><img src="https://github.com/henriquedevelops.png" width="50" height="50" alt="henriquedevelops" title="henriquedevelops" /></a>
<a href="https://github.com/ybrodsky"><img src="https://github.com/ybrodsky.png" width="50" height="50" alt="ybrodsky" title="Yael Brodsky" /></a>
<a href="https://github.com/icaroharry"><img src="https://github.com/icaroharry.png" width="50" height="50" alt="icaroharry" title="Ícaro Harry" /></a>
<a href="https://github.com/asumaran"><img src="https://github.com/asumaran.png" width="50" height="50" alt="asumaran" title="Alfredo Sumaran" /></a>

Want to see your avatar here? Check the [Contributing Guide](CONTRIBUTING.md) to get started.

## Team

<a href="https://github.com/superdoc-dev/superdoc/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superdoc-dev/superdoc" />
</a>

---

Created and maintained by <a href="https://www.superdoc.dev" target="_blank">Harbour</a> and the SuperDoc community
