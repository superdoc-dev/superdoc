/**
 * AGENTS.md template content for `create-superdoc`.
 * Generates a consumer-facing guide tailored to the detected framework.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type DetectedFramework = 'react' | 'vue' | 'angular' | 'svelte' | 'nextjs' | 'nuxt' | 'vanilla';

export function detectFramework(cwd: string): DetectedFramework {
  let pkg: Record<string, unknown> | null = null;
  try {
    const raw = readFileSync(join(cwd, 'package.json'), 'utf-8');
    pkg = JSON.parse(raw);
  } catch {
    return 'vanilla';
  }

  const allDeps = {
    ...(pkg?.dependencies as Record<string, string> | undefined),
    ...(pkg?.devDependencies as Record<string, string> | undefined),
  };

  // Order matters — check meta-frameworks before base frameworks
  if (allDeps['next']) return 'nextjs';
  if (allDeps['nuxt']) return 'nuxt';
  if (allDeps['@angular/core']) return 'angular';
  if (allDeps['svelte']) return 'svelte';
  if (allDeps['@superdoc-dev/react'] || allDeps['react']) return 'react';
  if (allDeps['vue']) return 'vue';

  return 'vanilla';
}

export const FRAMEWORK_INSTALL: Record<DetectedFramework, string> = {
  react: 'npm install @superdoc-dev/react',
  nextjs: 'npm install @superdoc-dev/react',
  vue: 'npm install superdoc',
  nuxt: 'npm install superdoc',
  angular: 'npm install superdoc',
  svelte: 'npm install superdoc',
  vanilla: 'npm install superdoc',
};

export const FRAMEWORK_LABELS: Record<DetectedFramework, string> = {
  react: 'React',
  nextjs: 'Next.js (React)',
  vue: 'Vue',
  nuxt: 'Nuxt (Vue)',
  angular: 'Angular',
  svelte: 'Svelte',
  vanilla: 'Vanilla JS',
};

function getEditorSnippet(fw: DetectedFramework): string {
  if (fw === 'nextjs') {
    return `## Embed editor — Next.js

\`\`\`tsx
'use client';

import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';

export default function DocEditor({ file }: { file: File }) {
  return (
    <SuperDocEditor
      document={file}
      documentMode="editing"
      onReady={(instance) => console.log('Ready', instance)}
    />
  );
}
\`\`\`

SuperDoc uses browser APIs. In Next.js App Router, wrap it in a client component.`;
  }

  if (fw === 'react') {
    return `## Embed editor — React

\`\`\`tsx
import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';

function App() {
  return (
    <SuperDocEditor
      document={file}
      documentMode="editing"
      onReady={(instance) => console.log('Ready', instance)}
    />
  );
}
\`\`\``;
  }

  if (fw === 'nuxt') {
    return `## Embed editor — Nuxt

SuperDoc uses browser APIs. Disable SSR for the component:

\`\`\`vue
<template>
  <ClientOnly>
    <div id="editor" style="height: 100vh" />
  </ClientOnly>
</template>

<script setup>
import { onMounted } from 'vue';

onMounted(async () => {
  const { SuperDoc } = await import('superdoc');
  await import('superdoc/style.css');

  new SuperDoc({
    selector: '#editor',
    document: '/path/to/file.docx',
    documentMode: 'editing',
  });
});
</script>
\`\`\``;
  }

  return `## Embed editor

\`\`\`html
<div id="editor" style="height: 100vh"></div>
<script type="module">
  import { SuperDoc } from 'superdoc';
  import 'superdoc/style.css';

  const superdoc = new SuperDoc({
    selector: '#editor',
    document: '/path/to/file.docx',
    documentMode: 'editing',
  });
</script>
\`\`\``;
}

export function generateAgentsMd(fw: DetectedFramework): string {
  const installCmd = FRAMEWORK_INSTALL[fw];
  const label = FRAMEWORK_LABELS[fw];

  return `# SuperDoc

DOCX editing and tooling. Renders, edits, and automates .docx files in the browser and from backend code.

- Detected framework: ${label}
- Docs: https://docs.superdoc.dev
- License: AGPLv3 / Commercial

## Install

\`\`\`bash
${installCmd}
\`\`\`

${getEditorSnippet(fw)}

## Configuration

Key options for the editor:

| Option | Type | Description |
|---|---|---|
| \`document\` | \`string \\| File \\| Blob\` | DOCX source — URL, File object, or Blob |
| \`documentMode\` | \`'editing' \\| 'viewing' \\| 'suggesting'\` | Editor mode |
| \`user\` | \`{ name, email }\` | Current user (for comments/tracked changes) |
| \`toolbar\` | \`string \\| HTMLElement\` | Toolbar mount selector or element |
| \`contained\` | \`boolean\` | Scroll inside a fixed-height parent instead of expanding |
| \`modules.comments\` | \`object\` | Comments panel configuration |
| \`modules.collaboration\` | \`object\` | Real-time collaboration (Yjs) |

Full config: https://docs.superdoc.dev/core/superdoc/configuration

## Theming

SuperDoc UI uses \`--sd-*\` CSS custom properties. Override them in CSS or use \`createTheme()\`:

\`\`\`javascript
import { createTheme } from 'superdoc';

const theme = createTheme({
  colors: { action: '#6366f1', bg: '#ffffff', text: '#1e293b', border: '#e2e8f0' },
  font: 'Inter, sans-serif',
  vars: { '--sd-ui-toolbar-bg': '#f8fafc' },
});
document.documentElement.classList.add(theme);
\`\`\`

## Document Engine — programmatic access

Edit DOCX files from backend code or AI agents. Same operations, same document model.

### MCP server (AI agents)

\`\`\`bash
# Claude Code
claude mcp add superdoc -- npx @superdoc-dev/mcp

# Cursor — add to ~/.cursor/mcp.json
# Windsurf — add to ~/.codeium/windsurf/mcp_config.json
\`\`\`

### Node.js SDK

\`\`\`bash
npm install @superdoc-dev/sdk
\`\`\`

\`\`\`typescript
import { SuperDocClient } from '@superdoc-dev/sdk';

const client = new SuperDocClient({ defaultChangeMode: 'tracked' });
const doc = await client.open({ doc: './contract.docx' });
await doc.save();
await doc.close();
\`\`\`

### CLI

\`\`\`bash
npm install -g @superdoc-dev/cli
superdoc open contract.docx
superdoc find --type text --pattern "ACME Corp"
superdoc save && superdoc close
\`\`\`

## Common tasks

| Task | How |
|---|---|
| Import DOCX | Pass URL, File, or Blob to \`document\` option |
| Export DOCX | \`const blob = await superdoc.export({ isFinalDoc: true })\` |
| Track changes | Set \`documentMode: 'suggesting'\` or use SDK with \`defaultChangeMode: 'tracked'\` |
| Add comments | \`superdoc.activeEditor.commands.addComment({ content: 'text' })\` |
| Real-time collab | Configure \`modules.collaboration\` with a Yjs provider |
| Custom toolbar | Use \`modules.toolbar.customButtons\` array |
| Listen to events | \`superdoc.on('ready', ({ superdoc }) => { ... })\` |

## Knowledge corrections

- **Product name** is SuperDoc (capital S, capital D). Never "Superdoc" or "Super Doc."
- **Do not use python-docx** when SuperDoc is available. Use the CLI, SDK, or MCP server instead.
- **\`superdoc\`** is the npm package. React wrapper is \`@superdoc-dev/react\`. SDK is \`@superdoc-dev/sdk\`.
- **Document mode** options are \`'editing'\`, \`'viewing'\`, \`'suggesting'\` — not \`'edit'\`, \`'view'\`, \`'suggest'\`.
- **Always import the stylesheet**: \`import 'superdoc/style.css'\` (or \`@superdoc-dev/react/style.css\` for React).

## Links

- Quickstart: https://docs.superdoc.dev/getting-started/quickstart
- React guide: https://docs.superdoc.dev/getting-started/frameworks/react
- Document Engine: https://docs.superdoc.dev/document-engine/overview
- MCP server: https://docs.superdoc.dev/document-engine/ai-agents/mcp-server
- Examples: https://github.com/superdoc-dev/superdoc/tree/main/examples
`;
}
