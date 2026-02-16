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
  <a href="https://www.superdoc.dev" target="_blank"><img src="https://img.shields.io/badge/Official%20Site-1355ff.svg" height="22px"></a>
  <a href="https://docs.superdoc.dev" target="_blank"><img src="https://img.shields.io/badge/docs-available-1355ff.svg" height="22px"></a>
  <a href="https://www.gnu.org/licenses/agpl-3.0" target="_blank"><img src="https://img.shields.io/badge/License-AGPL%20v3-1355ff.svg?color=1355ff" height="22px"></a>
  <a href="https://www.npmjs.com/package/superdoc" target="_blank"><img src="https://img.shields.io/npm/v/superdoc.svg?color=1355ff" height="22px"></a>
  <a href="https://www.discord.com/invite/b9UuaZRyaB" target="_blank"><img src="https://img.shields.io/badge/discord-join-1355ff" height="22px"></a>
</div>

<div>
  <BR />
  <strong>SuperDoc</strong> (<a href="https://www.superdoc.dev" target="_blank">online demo</a>) is an open source document editor bringing Microsoft Word capabilities to the web with real-time collaboration, extensive formatting options, and easy integration. Self-hostable with Vanilla JS, React, Vue, and more (<a href="https://github.com/superdoc-dev/superdoc/tree/main/examples" target="_blank">code examples</a>).
  <BR />
</div>

## 🖼️ Screenshot

<div align="center">
  <a href="https://www.superdoc.dev" target="_blank">
    <img alt="SuperDoc editor screenshot" src="https://storage.googleapis.com/public_statichosting/SuperDocHomepage/screeenshot.png" width="600px" height="auto" />
  </a>
</div>

## ✨ Features

- **📝 Microsoft Word compatible**: View and edit DOCX documents with great import/export, advanced formatting, comments, and tracked changes
- **🛠️ Easy to integrate**: Open source, can be self-hosted, seamlessly integrates with React, Vue, vanilla JavaScript, and more
- **👥 Real-time collaboration**: Features multiplayer editing, live updates, commenting, sharing, and revision history
- **📐 Extensible architecture**: Modular design makes it easy to extend, brand, and customize
- **✅ Dual licensed**: Available under AGPLv3 for community use and Commercial license for enterprise deployments

## 💡 Quick start

### Installation

```bash
npm install superdoc
```

Or install with CDN

```html
<link rel="stylesheet" href="https://unpkg.com/superdoc/dist/style.css" />
<script type="module" src="https://unpkg.com/superdoc/dist/superdoc.umd.js"></script>
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

See the [@superdoc-dev/react README](packages/react/README.md) for full documentation.

### Vanilla JavaScript

```javascript
import 'superdoc/style.css';
import { SuperDoc } from 'superdoc';

// For CDN use - `SuperDocLibrary.SuperDoc`
const superdoc = new SuperDoc({
  selector: '#superdoc',
  toolbar: '#superdoc-toolbar',
  document: '/sample.docx', // URL, File or document config
  documentMode: 'editing',
  rulers: true,
  onReady: (event) => {
    console.log('SuperDoc is ready', event);
  },
  onEditorCreate: (event) => {
    console.log('Editor is created', event);
  },
});
```

SuperDoc now uses the layout-engine powered `PresentationEditor` under the hood, so pages/zoom/error events are always available—no pagination flag required.

For a list of all available properties and events, see the documentation or refer to [SuperDoc.js](packages/superdoc/src/core/SuperDoc.js)

## 📖 Documentation

Visit our <a href="https://docs.superdoc.dev" target="_blank">documentation site</a> and <a href="https://github.com/superdoc-dev/superdoc/tree/main/examples" target="_blank">code examples</a>. Key topics include:

- Installation
- Integration guides
- Collaboration setup
- Advanced customization
- Best practices

## 🎯️ Roadmap

We keep our big work-in-progress items here:

- Check out our [SuperDoc roadmap](https://github.com/superdoc-dev/superdoc/wiki/%F0%9F%8E%AF%EF%B8%8F-SuperDoc-Roadmap)
- We prioritize the solving of big DOCX import/export/formatting needs

## 🤝 Contribute

We love contributions! Here's how you can help:

1. Check our [issue tracker](https://github.com/superdoc-dev/superdoc/issues) for open issues
2. Fork the repository and create a feature/bugfix branch
3. Write clear, documented code following our style guidelines
4. Submit a PR with detailed description of your changes

See our [Contributing Guide](CONTRIBUTING.md) for more details.

## 💬 Community

- [Discord](https://discord.com/invite/b9UuaZRyaB) - Join our community chat
- [Team email](mailto:q@superdoc.dev) - Get help from our team

## 📄 License

- Open Source: [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)
- Commercial: [Enterprise License](https://www.harbourshare.com/get-in-touch)

## 🙌 Shout-outs

- Marijn Haverbeke and the community behind <a href="https://prosemirror.net" target="_blank">ProseMirror</a> - which we built on top of to make SuperDoc possible
- Tiptap and the <a href="https://github.com/JefMari/awesome-wysiwyg-editors" target="_blank">many amazing editors of the web</a> - from which we draw inspiration
- These wonderful projects that SuperDoc uses: <a href="https://github.com/yjs/yjs" target="_blank">Yjs</a>, <a href="https://fontawesome.com/" target="_blank">FontAwesome</a>, <a href="https://stuk.github.io/jszip/" target="_blank">JSZip</a>, and <a href="https://vite.dev" target="_blank">Vite</a>

## 📱 Contact

- [✉️ Email](mailto:q@superdoc.dev?subject=[SuperDoc]%20Project%20inquiry)
- [⛵️ Website](https://superdoc.dev)

## Community Contributors

Special thanks to these community members who have contributed code to SuperDoc:

<a href="https://github.com/johanneswilm"><img src="https://github.com/johanneswilm.png" width="50" height="50" alt="johanneswilm" title="Johannes Wilm" /></a>
<a href="https://github.com/financialvice"><img src="https://github.com/financialvice.png" width="50" height="50" alt="financialvice" title="financialvice" /></a>
<a href="https://github.com/luciorubeens"><img src="https://github.com/luciorubeens.png" width="50" height="50" alt="luciorubeens" title="Lúcio Caetano" /></a>
<a href="https://github.com/Dannyhvv"><img src="https://github.com/Dannyhvv.png" width="50" height="50" alt="Dannyhvv" title="Dannyhvv" /></a>
<a href="https://github.com/henriquedevelops"><img src="https://github.com/henriquedevelops.png" width="50" height="50" alt="henriquedevelops" title="henriquedevelops" /></a>
<a href="https://github.com/ybrodsky"><img src="https://github.com/ybrodsky.png" width="50" height="50" alt="ybrodsky" title="Yael Brodsky" /></a>
<a href="https://github.com/icaroharry"><img src="https://github.com/icaroharry.png" width="50" height="50" alt="icaroharry" title="Ícaro Harry" /></a>
<a href="https://github.com/asumaran"><img src="https://github.com/asumaran.png" width="50" height="50" alt="asumaran" title="Alfredo Sumaran" /></a>

Want to see your avatar here? Check our [Contributing Guide](CONTRIBUTING.md) to get started.

## Team

<a href="https://github.com/superdoc-dev/superdoc/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superdoc-dev/superdoc" />
</a>

---

Created and actively maintained by <a href="https://www.superdoc.dev" target="_blank">Harbour</a> and the SuperDoc community
