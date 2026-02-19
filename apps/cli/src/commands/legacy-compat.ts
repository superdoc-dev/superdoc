import { glob } from 'fast-glob';
import { openDocument, exportToPath } from '../lib/document';
import type { CliIO } from '../lib/types';

type LegacyCommand = 'search' | 'read' | 'replace-legacy';

interface LegacySearchMatch {
  from: number;
  to: number;
  text: string;
  context?: string;
}

interface LegacySearchFileResult {
  path: string;
  matches: LegacySearchMatch[];
}

interface LegacySearchResult {
  pattern: string;
  files: LegacySearchFileResult[];
  totalMatches: number;
}

interface LegacyReadResult {
  path: string;
  content: string;
}

interface LegacyReplaceFileResult {
  path: string;
  replacements: number;
}

interface LegacyReplaceResult {
  find: string;
  replace: string;
  files: LegacyReplaceFileResult[];
  totalReplacements: number;
}

type LegacyCompatHandled = {
  handled: true;
  exitCode: number;
};

type LegacyCompatNotHandled = {
  handled: false;
};

/** Discriminated result of a legacy compatibility command attempt. */
export type LegacyCompatResult = LegacyCompatHandled | LegacyCompatNotHandled;

type RawSearchMatch = {
  from: number;
  to: number;
  text: string;
};

function getMatchContext(fullText: string, from: number, to: number, contextChars = 40): string {
  const start = Math.max(0, from - contextChars);
  const end = Math.min(fullText.length, to + contextChars);

  let context = fullText.slice(start, end);
  if (start > 0) context = `...${context}`;
  if (end < fullText.length) context = `${context}...`;

  return context.replace(/\n/g, ' ');
}

async function expandGlobs(patterns: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      const matches = await glob(pattern, { absolute: true });
      for (const file of matches) {
        if (file.endsWith('.docx')) {
          files.push(file);
        }
      }
    } else {
      files.push(pattern);
    }
  }

  return files;
}

async function searchSingleFile(filePath: string, pattern: string, io: CliIO): Promise<LegacySearchFileResult> {
  const opened = await openDocument(filePath, io);
  try {
    const matches =
      (opened.editor.commands.search?.(pattern, {
        highlight: false,
      }) as RawSearchMatch[] | undefined) ?? [];
    const fullText = opened.editor.state.doc.textContent;

    return {
      path: filePath,
      matches: matches.map((match) => ({
        ...match,
        context: getMatchContext(fullText, match.from, match.to),
      })),
    };
  } finally {
    opened.dispose();
  }
}

async function runLegacySearch(pattern: string, files: string[], io: CliIO): Promise<LegacySearchResult> {
  const results = await Promise.all(files.map((filePath) => searchSingleFile(filePath, pattern, io)));
  const filesWithMatches = results.filter((entry) => entry.matches.length > 0);
  const totalMatches = filesWithMatches.reduce((sum, entry) => sum + entry.matches.length, 0);

  return {
    pattern,
    files: filesWithMatches,
    totalMatches,
  };
}

async function runLegacyRead(filePath: string, io: CliIO): Promise<LegacyReadResult> {
  const opened = await openDocument(filePath, io);
  try {
    return {
      path: filePath,
      content: opened.editor.state.doc.textContent,
    };
  } finally {
    opened.dispose();
  }
}

type DocRange = { from: number; to: number };
type RawSearchMatchWithRanges = RawSearchMatch & { ranges?: DocRange[] };

/**
 * Replace all occurrences of a pattern in a document with replacement text.
 *
 * Handles cross-paragraph matches by replacing each range individually
 * (back-to-front) to preserve document structure and positions.
 */
function applyReplacements(editor: import('../lib/document').EditorWithDoc, find: string, replaceWith: string): number {
  const matches =
    (editor.commands.search?.(find, { highlight: false }) as RawSearchMatchWithRanges[] | undefined) ?? [];
  if (matches.length === 0) return 0;

  // Collect all ranges, marking the first range of each match for replacement text
  const allRanges: Array<{ from: number; to: number; isFirst: boolean }> = [];

  for (const match of matches) {
    if (match.ranges && match.ranges.length > 0) {
      match.ranges.forEach((range, index) => {
        allRanges.push({ from: range.from, to: range.to, isFirst: index === 0 });
      });
    } else {
      allRanges.push({ from: match.from, to: match.to, isFirst: true });
    }
  }

  // Sort descending so replacements don't shift earlier positions
  allRanges.sort((a, b) => b.from - a.from);

  for (const range of allRanges) {
    const content = range.isFirst ? replaceWith : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor.chain() as any).setTextSelection({ from: range.from, to: range.to }).insertContent(content).run();
  }

  return matches.length;
}

async function replaceInFile(
  filePath: string,
  find: string,
  replaceWith: string,
  io: CliIO,
): Promise<LegacyReplaceFileResult> {
  const opened = await openDocument(filePath, io);
  try {
    const replacements = applyReplacements(opened.editor, find, replaceWith);
    if (replacements > 0) {
      await exportToPath(opened.editor, filePath, true);
    }
    return { path: filePath, replacements };
  } finally {
    opened.dispose();
  }
}

async function runLegacyReplace(
  find: string,
  replaceWith: string,
  files: string[],
  io: CliIO,
): Promise<LegacyReplaceResult> {
  const results = await Promise.all(files.map((fp) => replaceInFile(fp, find, replaceWith, io)));
  const filesWithReplacements = results.filter((r) => r.replacements > 0);
  const totalReplacements = results.reduce((sum, r) => sum + r.replacements, 0);

  return {
    find,
    replace: replaceWith,
    files: filesWithReplacements,
    totalReplacements,
  };
}

function formatLegacyReplaceResult(result: LegacyReplaceResult): string {
  const lines: string[] = [];
  lines.push(`Replaced ${result.totalReplacements} occurrences across ${result.files.length} files`);
  lines.push('');

  for (const file of result.files) {
    lines.push(`  ${file.path}: ${file.replacements} replacements`);
  }

  return lines.join('\n');
}

function formatLegacySearchResult(result: LegacySearchResult): string {
  const lines: string[] = [];

  lines.push(`Found ${result.totalMatches} matches in ${result.files.length} files`);
  lines.push('');

  for (const file of result.files) {
    lines.push(`  ${file.path}: ${file.matches.length} matches`);
    for (const match of file.matches.slice(0, 3)) {
      lines.push(`    "${match.context}"`);
    }
    if (file.matches.length > 3) {
      lines.push(`    ... and ${file.matches.length - 3} more`);
    }
  }

  return lines.join('\n');
}

function resolveLegacyJsonOutput(argv: string[]): boolean {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') return true;
    if (token === '--pretty') return false;
    if (token.startsWith('--output=')) {
      return token.slice('--output='.length) === 'json';
    }
    if (token === '--output') {
      return argv[index + 1] === 'json';
    }
  }

  // Legacy default: pretty output unless JSON is explicitly requested.
  return false;
}

function writeLegacySuccess(
  io: CliIO,
  payload: LegacySearchResult | LegacyReadResult | LegacyReplaceResult,
  jsonOutput: boolean,
): void {
  if (jsonOutput) {
    io.stdout(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if ('pattern' in payload) {
    io.stdout(`${formatLegacySearchResult(payload)}\n`);
    return;
  }

  if ('totalReplacements' in payload) {
    io.stdout(`${formatLegacyReplaceResult(payload)}\n`);
    return;
  }

  io.stdout(`${payload.content}\n`);
}

function usageFor(command: LegacyCommand): string {
  if (command === 'search') return 'Usage: superdoc search <pattern> <files...>';
  if (command === 'replace-legacy') return 'Usage: superdoc replace-legacy <find> <to> <files...>';
  return 'Usage: superdoc read <file>';
}

/**
 * Attempts to handle a CLI invocation as a legacy v0.x command (`search`, `read`, or `replace-legacy`).
 *
 * @param argv - Raw process arguments (used to detect `--json` / `--output` flags).
 * @param rest - Remaining tokens after global flag extraction.
 * @param io - CLI I/O streams.
 * @returns `{ handled: true, exitCode }` if the command was a legacy command, otherwise `{ handled: false }`.
 */
export async function tryRunLegacyCompatCommand(
  argv: string[],
  rest: string[],
  io: CliIO,
): Promise<LegacyCompatResult> {
  const [command, ...args] = rest;
  if (command !== 'search' && command !== 'read' && command !== 'replace-legacy') {
    return { handled: false };
  }

  const jsonOutput = resolveLegacyJsonOutput(argv);

  try {
    if (command === 'search') {
      if (args.length < 2) {
        io.stderr(`${usageFor('search')}\n`);
        return { handled: true, exitCode: 1 };
      }

      const [pattern, ...filePatterns] = args;
      const files = await expandGlobs(filePatterns);
      if (files.length === 0) {
        io.stderr('No .docx files found matching the pattern.\n');
        return { handled: true, exitCode: 1 };
      }

      const payload = await runLegacySearch(pattern, files, io);
      writeLegacySuccess(io, payload, jsonOutput);
      return { handled: true, exitCode: 0 };
    }

    if (command === 'replace-legacy') {
      if (args.length < 3) {
        io.stderr(`${usageFor('replace-legacy')}\n`);
        return { handled: true, exitCode: 1 };
      }

      const [find, to, ...filePatterns] = args;
      const files = await expandGlobs(filePatterns);
      if (files.length === 0) {
        io.stderr('No .docx files found matching the pattern.\n');
        return { handled: true, exitCode: 1 };
      }

      const payload = await runLegacyReplace(find, to, files, io);
      writeLegacySuccess(io, payload, jsonOutput);
      return { handled: true, exitCode: 0 };
    }

    if (args.length < 1) {
      io.stderr(`${usageFor('read')}\n`);
      return { handled: true, exitCode: 1 };
    }

    const payload = await runLegacyRead(args[0], io);
    writeLegacySuccess(io, payload, jsonOutput);
    return { handled: true, exitCode: 0 };
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return { handled: true, exitCode: 1 };
  }
}
