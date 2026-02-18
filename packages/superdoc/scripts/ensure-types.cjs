#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

// Verify that vite-plugin-dts generated the expected type entry points.
// Path aliases are resolved by vite-plugin-dts via tsconfig.json paths.
const distRoot = path.resolve(__dirname, '..', 'dist');

const requiredEntryPoints = [
  'superdoc/src/index.d.ts',
  'super-editor/src/index.d.ts',
  'super-editor/src/types.d.ts',
];

for (const entry of requiredEntryPoints) {
  const fullPath = path.join(distRoot, entry);
  if (!fs.existsSync(fullPath)) {
    console.error(`[ensure-types] Missing ${entry}`);
    process.exit(1);
  }
}

const indexPath = path.join(distRoot, 'superdoc/src/index.d.ts');
let content = fs.readFileSync(indexPath, 'utf8');

const hasSuperDocExport = /export\s+\{[^}]*\bSuperDoc\b[^}]*\}/m.test(content);
if (!hasSuperDocExport) {
  console.error(`[ensure-types] SuperDoc export missing in superdoc/src/index.d.ts`);
  process.exit(1);
}

// Fix workspace package imports that aren't resolvable by consumers.
// @superdoc/common is a private workspace package — inline its types.
const hadWorkspaceImport = content.includes('@superdoc/common');
if (hadWorkspaceImport) {
  // Replace the @superdoc/common import with inline declarations
  content = content.replace(
    /import\s*\{[^}]*\}\s*from\s*['"]@superdoc\/common['"];?\s*\n?/g,
    '',
  );

  // BlankDOCX comes from a Vite ?url import (resolves to a string at runtime)
  // Declare it since vite-plugin-dts can't generate types for ?url imports
  const inlineDeclarations = [
    '/** Document MIME type constants */',
    "declare const DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';",
    "declare const PDF: 'application/pdf';",
    "declare const HTML: 'text/html';",
    'declare function getFileObject(fileUrl: string, name: string, type: string): Promise<File>;',
    'declare function compareVersions(version1: string, version2: string): -1 | 0 | 1;',
    '/** URL to the blank DOCX template */',
    'declare const BlankDOCX: string;',
  ].join('\n');

  content = inlineDeclarations + '\n' + content;
  fs.writeFileSync(indexPath, content);
  console.log('[ensure-types] ✓ Inlined @superdoc/common types');
}

console.log('[ensure-types] ✓ Verified type entry points');
