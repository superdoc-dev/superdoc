import type { CodeExample } from './extract';

/**
 * Transform a Full Example code block into executable code that
 * receives an `editor` argument. Returns null if the code can't
 * be meaningfully transformed.
 */
export function transformCode(example: CodeExample): string | null {
  if (example.pattern === 'superdoc') return transformSuperdocPattern(example.code);
  if (example.pattern === 'editor') return transformEditorPattern(example.code);
  return null;
}

function transformSuperdocPattern(code: string): string | null {
  const lines = code.split('\n');

  let onReadyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/onReady:\s*(async\s*)?\(/.test(lines[i])) {
      onReadyStart = i;
      break;
    }
  }

  if (onReadyStart === -1) {
    return extractEventBody(code) ?? extractFallback(code);
  }

  let braceDepth = 0;
  let onReadyEnd = -1;
  let bodyStart = -1;

  for (let i = onReadyStart; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') {
        if (braceDepth === 0) bodyStart = i;
        braceDepth++;
      }
      if (ch === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          onReadyEnd = i;
          break;
        }
      }
    }
    if (onReadyEnd !== -1) break;
  }

  if (bodyStart === -1 || onReadyEnd === -1) return null;

  const bodyLines = lines.slice(bodyStart + 1, onReadyEnd);
  const filtered = bodyLines.filter(
    (line) =>
      !line.trim().startsWith('const editor = superdoc') &&
      !line.trim().startsWith('let editor = superdoc') &&
      !line.trim().startsWith('const editor = instance') &&
      !line.trim().startsWith('let editor = instance'),
  );

  const result = filtered.join('\n').trim();
  return result || null;
}

function transformEditorPattern(code: string): string | null {
  const lines = code.split('\n');

  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('import ')) return false;
    if (/(?:const|let)\s+editor\s*=\s*await\s+Editor\.open/.test(trimmed)) return false;
    if (/^await\s+Editor\.open/.test(trimmed)) return false;
    return true;
  });

  const result = filtered.join('\n').trim();
  return result || null;
}

/** Extract handler body from superdoc.on() patterns that contain editor calls. */
function extractEventBody(code: string): string | null {
  const lines = code.split('\n');

  let eventStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/superdoc\.on\(/.test(lines[i])) {
      eventStart = i;
      break;
    }
  }

  if (eventStart === -1) return null;
  if (!code.includes('editor.commands.') && !code.includes('editor.helpers.')) return null;

  let braceDepth = 0;
  let bodyStart = -1;
  let bodyEnd = -1;

  for (let i = eventStart; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') {
        if (braceDepth === 0) bodyStart = i;
        braceDepth++;
      }
      if (ch === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          bodyEnd = i;
          break;
        }
      }
    }
    if (bodyEnd !== -1) break;
  }

  if (bodyStart === -1 || bodyEnd === -1) return null;

  const bodyLines = lines.slice(bodyStart + 1, bodyEnd);
  const filtered = bodyLines.filter(
    (line) => !line.trim().startsWith('const editor = superdoc') && !line.trim().startsWith('let editor = superdoc'),
  );

  const result = filtered.join('\n').trim();
  return result || null;
}

/** Last resort: extract any editor.commands/helpers lines from unrecognized patterns. */
function extractFallback(code: string): string | null {
  const commandLines = code.split('\n').filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed.includes('editor.commands.') || trimmed.includes('editor.helpers.') || trimmed.includes('editor.can().')
    );
  });

  if (commandLines.length === 0) return null;
  return commandLines.join('\n').trim();
}

const PLACEHOLDER_REPLACEMENTS: [RegExp, string][] = [
  [/\bautoSave\b/g, '(() => {})'],
  [/\bcleanup\b/g, '(() => {})'],
  [/\bshowOnlineUsers\b/g, '(() => {})'],
  [/\bshowFormattingToolbar\b/g, '(() => {})'],
  [/\bsaveCurrentState\b/g, '(() => {})'],
  [/\bupdateCommentsSidebar\b/g, '(() => {})'],
  [/\bupdateReviewPanel\b/g, '(() => {})'],
  [/\bshowCollaboratorsCursors\b/g, '(() => {})'],
  [/\bhideLoadingSpinner\b/g, '(() => {})'],
  [/\bupdateUserCursors\b/g, '(() => {})'],
  [/\bshowLockBanner\b/g, '(() => {})'],
  [/\badjustLayout\b/g, '(() => {})'],
  [/\bupdateConnectionIndicator\b/g, '(() => {})'],
  [/\brefreshToken\b/g, '(() => {})'],
  [/\bclearInterval\b/g, '(() => {})'],
  [/\bsaveToBackend\b/g, '(() => {})'],
];

export function applyStubs(code: string): string {
  let result = code;

  // Prefix with ; to avoid ASI hazards when previous line lacks semicolons
  result = result.replace(/console\.(log|warn|error|info|debug)\b/g, ';(() => {})');

  for (const [pattern, replacement] of PLACEHOLDER_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  return result;
}
