# SuperDoc for VS Code

Open, edit, and review Word documents directly in VS Code.

![SuperDoc VS Code Extension Demo](demo.gif)

## Features

- **Full DOCX rendering** — pagination, headings, tables, lists, signature blocks
- **Edit in place** — type, format, and save without leaving VS Code
- **Tracked changes** — AI agents can suggest edits as Word tracked changes
- **Comments** — view and add Word comments with margin bubbles
- **Live reload** — when an external process modifies the file, the document refreshes automatically
- **Auto-save** — changes are saved as you type
- **Context menu** — right-click any `.docx` in the Explorer and choose "Open with SuperDoc"

## Install

Search **"SuperDoc"** in the VS Code Extensions panel, or:

```
ext install superdoc-dev.superdoc-vscode-ext
```

Once installed, click any `.docx` file to open it with SuperDoc.

## AI Integration

SuperDoc provides an [MCP server](https://github.com/superdoc-dev/superdoc/tree/main/apps/mcp) that lets AI agents read, edit, and comment on Word documents programmatically. Combined with this extension, you get a live preview of AI-suggested changes — tracked changes and comments appear in real time as the agent works.

## Part of SuperDoc

This extension is powered by [SuperDoc](https://github.com/superdoc-dev/superdoc) — open-source DOCX editing for the browser and server. No server calls — your documents never leave your machine.

## License

AGPL-3.0 · [Enterprise license available](https://superdoc.dev)
