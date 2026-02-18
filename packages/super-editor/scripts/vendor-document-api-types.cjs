#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const distRoot = path.join(packageRoot, 'dist');
const documentApiDistRoot = path.resolve(packageRoot, '..', 'document-api', 'dist', 'src');
const vendoredDocumentApiRoot = path.join(distRoot, 'document-api');

const toPosix = (value) => value.split(path.sep).join('/');

const ensureDotRelative = (value) => {
  if (!value) return '.';
  if (value.startsWith('.')) return value;
  return `./${value}`;
};

const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
      continue;
    }
    if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

const rewriteDeclarationImports = (filePath) => {
  const original = fs.readFileSync(filePath, 'utf8');
  if (!original.includes('@superdoc/document-api')) return false;

  const relativeBase = ensureDotRelative(toPosix(path.relative(path.dirname(filePath), vendoredDocumentApiRoot)));
  const localIndexPath = `${relativeBase}/index.js`;
  const localTypesPath = `${relativeBase}/types/index.js`;

  const rewritten = original
    .replace(/(['"])@superdoc\/document-api\/types\1/g, `$1${localTypesPath}$1`)
    .replace(/(['"])@superdoc\/document-api\1/g, `$1${localIndexPath}$1`);

  if (rewritten === original) return false;
  fs.writeFileSync(filePath, rewritten, 'utf8');
  return true;
};

const visitDeclarations = (dirPath, onFile) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const childPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      visitDeclarations(childPath, onFile);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      onFile(childPath);
    }
  }
};

if (!fs.existsSync(distRoot)) {
  console.error(`[vendor-document-api-types] Missing dist directory: ${distRoot}`);
  process.exit(1);
}

if (!fs.existsSync(documentApiDistRoot)) {
  console.error(
    `[vendor-document-api-types] Missing document-api declarations at ${documentApiDistRoot}. ` +
      'Run `pnpm --dir ../document-api exec tsc -p tsconfig.json` first.',
  );
  process.exit(1);
}

copyDir(documentApiDistRoot, vendoredDocumentApiRoot);

let rewrittenCount = 0;
visitDeclarations(distRoot, (filePath) => {
  if (rewriteDeclarationImports(filePath)) {
    rewrittenCount += 1;
  }
});

console.log(
  `[vendor-document-api-types] Vendored document-api declarations into ${path.relative(packageRoot, vendoredDocumentApiRoot)}.`,
);
console.log(`[vendor-document-api-types] Rewrote ${rewrittenCount} declaration file(s).`);
