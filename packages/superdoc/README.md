# 🦋️📝️ SuperDoc

> The modern collaborative document editor for the web

[![Documentation](https://img.shields.io/badge/docs-available-1355ff.svg)](https://docs.superdoc.dev/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-1355ff.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![npm version](https://img.shields.io/npm/v/superdoc.svg?color=1355ff)](https://www.npmjs.com/package/superdoc)
[![Discord](https://img.shields.io/badge/discord-join-1355ff)](https://discord.gg/FBeRDqWy)

SuperDoc is a powerful document editor that brings Microsoft Word-level capabilities to your web applications. With real-time collaboration, extensive formatting options, and seamless integration capabilities, SuperDoc makes document editing on the web better for everyone.

## ✨ Features

- **Document Compatibility**: View and edit DOCX and PDF documents directly in the browser
- **Microsoft Word Integration**: Full support for importing/exporting, advanced formatting, comments, and tracked changes
- **Paginated Layout**: True WYSIWYG editing with accurate page rendering powered by the layout engine
- **Real-time Collaboration**: Built-in multiplayer editing, live updates, commenting, sharing, and revision history
- **Framework Agnostic**: Seamlessly integrates with Vue, React, or vanilla JavaScript
- **Extensible Architecture**: Modular design makes it easy to extend and customize
- **Dual License**: Available under AGPLv3 for community use and Commercial license for enterprise deployments

## 🚀 Quick Start

### Installation

```bash
npm install superdoc
```

### Basic Usage

```javascript
import 'superdoc/style.css';
import { SuperDoc } from 'superdoc';

const superdoc = new SuperDoc({
  selector: '#superdoc',
  documents: [
    {
      id: 'my-doc-id',
      type: 'docx',
      data: fileObject, // Optional: JS File object if not using collaboration
    },
  ],
});
```

## 🛠️ Development Setup

1. **Clone the Repository**

```bash
git clone https://github.com/your-username/SuperDoc.git
cd SuperDoc
```

2. **Choose Your Package**

SuperDoc consists of two main packages:

- **/packages/superdoc**: Main package (recommended)

  ```bash
  cd packages/superdoc
  npm install && npm run dev
  ```

- **/packages/super-editor**: Core editor component
  ```bash
  cd packages/super-editor
  npm install && npm run dev
  ```

## 🏗️ Architecture

SuperDoc uses a **paginated-only** rendering approach powered by `PresentationEditor` and the layout engine:

- **For web applications**: Use `SuperDoc` - it automatically uses `PresentationEditor` for paginated rendering
- **For Node.js/CLI/headless environments**: Use `Editor` directly from `@superdoc/super-editor`

The layout engine provides:
- True WYSIWYG page rendering with accurate pagination
- Support for multi-column layouts, headers, footers, and section breaks
- Virtualization for optimal performance with large documents
- Zoom controls and responsive page scaling

**Note**: If you need a flow-mode (unpaginated) editor, use the core `Editor` class directly. SuperDoc is designed for paginated document editing.

## 📖 Documentation

For comprehensive documentation, visit our [SuperDocumentation](https://docs.superdoc.dev) site. Key topics include:

- Complete API reference
- Integration guides
- Collaboration setup
- Advanced customization
- Best practices

## 🤝 Contributing

We love contributions! Here's how you can help:

1. Check our [issue tracker](https://github.com/superdoc-dev/superdoc/issues) for open issues
2. Fork the repository and create a feature/bugfix branch
3. Write clear, documented code following our style guidelines
4. Submit a PR with detailed description of your changes

See our [Contributing Guide](CONTRIBUTING.md) for more details.

## 💬 Community

- [Discord Server](https://discord.gg/FBeRDqWy) - Join our community chat
- [GitHub Discussions](https://github.com/superdoc-dev/superdoc/discussions) - Ask questions and share ideas
- [Email Support](mailto:support@harbourshare.com) - Get help from our team

## 📄 License

- Open Source: [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)
- Commercial: [Enterprise License](https://www.harbourshare.com/request-a-demo)

## 📱 Contact

- [✉️ Email](mailto:support@harbourshare.com?subject=[SuperDoc]%20Project%20inquiry)
- [🔗 LinkedIn](https://www.linkedin.com/company/harbourshare/)
- [⛵️ Website](https://superdoc.dev)

---

Created and actively maintained by [Harbour](https://www.harbourshare.com) and the SuperDoc community.
