import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = {
  'content.js': readFileSync(join(root, 'content.js'), 'utf8'),
  'background.js': readFileSync(join(root, 'background.js'), 'utf8'),
};

function preserveLines(text) {
  return text.replace(/[^\n]/g, '');
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, preserveLines)
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function reportLine(failures, filename, source, index, message) {
  const line = source.slice(0, index).split('\n').length;
  failures.push(`${filename}:${line}: ${message}`);
}

function findToken(failures, filename, source, token, message) {
  let index = source.indexOf(token);
  while (index !== -1) {
    reportLine(failures, filename, source, index, message);
    index = source.indexOf(token, index + token.length);
  }
}

const failures = [];
const content = stripComments(files['content.js']);
const background = stripComments(files['background.js']);

findToken(failures, 'content.js', content, '${data.filename}', 'data.filename must not be interpolated into template HTML');
findToken(failures, 'content.js', content, '${data.htmlContent}', 'data.htmlContent must not be interpolated into template HTML');

content.split('\n').forEach((line, index) => {
  if (/innerHTML\s*=.*(data\.filename|data\.htmlContent|currentFileData)/.test(line)) {
    failures.push(`content.js:${index + 1}: innerHTML assignment references untrusted data on the same line`);
  }
});

const sanitizerUses = content.match(/sanitizeHtml\(/g)?.length ?? 0;
if (sanitizerUses < 3) {
  failures.push('content.js:1: expected sanitizeHtml( to be used at least 3 times');
}

const markdownAssignmentIndex = background.indexOf('let html = markdown');
if (markdownAssignmentIndex !== -1) {
  reportLine(
    failures,
    'background.js',
    background,
    markdownAssignmentIndex,
    'markdown conversion must start from escapeHtml(markdown)',
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Chrome extension XSS sink checks passed.');
