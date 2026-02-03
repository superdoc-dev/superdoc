#!/usr/bin/env node

import { glob } from 'fast-glob';
import { read } from './commands/read';
import { type ReplaceResult, replace } from './commands/replace';
import { type SearchResult, search } from './commands/search';

const HELP = `
superdoc - DOCX editing in your terminal

Commands:
  search <pattern> <files...>    Find text across documents
  replace <find> <to> <files...> Find and replace text
  read <file>                    Extract plain text

Options:
  --json        Machine-readable output
  -h, --help    Show this message

Examples:
  superdoc search "indemnification" ./contracts/*.docx
  superdoc replace "ACME Corp" "Globex Inc" ./merger/*.docx
  superdoc read ./proposal.docx

Docs: https://github.com/superdoc-dev/superdoc
`;

/**
 * Expand glob patterns to file paths
 * @param patterns - Array of file patterns (supports wildcards)
 */
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

/**
 * Format search results for human-readable output
 * @returns Formatted string with match summary
 */
function formatSearchResult(result: SearchResult): string {
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

/**
 * Format replace results for human-readable output
 * @param result - Replace operation result
 * @returns Formatted string with replacement summary
 */
function formatReplaceResult(result: ReplaceResult): string {
  const lines: string[] = [];

  lines.push(`Updated ${result.files.length} files (${result.totalReplacements} replacements total)`);

  for (const file of result.files) {
    lines.push(`  ${file.path}: ${file.replacements} replacements`);
  }

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  const jsonOutput = args.includes('--json');
  const filteredArgs = args.filter((a) => a !== '--json');

  const [command, ...rest] = filteredArgs;

  try {
    switch (command) {
      case 'search': {
        if (rest.length < 2) {
          console.error('Usage: superdoc search <pattern> <files...>');
          process.exit(1);
        }
        const [pattern, ...filePatterns] = rest;
        const files = await expandGlobs(filePatterns);

        if (files.length === 0) {
          console.error('No .docx files found matching the pattern.');
          process.exit(1);
        }

        const result = await search(pattern, files);

        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatSearchResult(result));
        }
        break;
      }

      case 'replace': {
        if (rest.length < 3) {
          console.error('Usage: superdoc replace <find> <replace> <files...>');
          process.exit(1);
        }
        const [find, replaceWith, ...filePatterns] = rest;
        const files = await expandGlobs(filePatterns);

        if (files.length === 0) {
          console.error('No .docx files found matching the pattern.');
          process.exit(1);
        }

        const result = await replace(find, replaceWith, files);

        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatReplaceResult(result));
        }
        break;
      }

      case 'read': {
        if (rest.length < 1) {
          console.error('Usage: superdoc read <file>');
          process.exit(1);
        }
        const [filePath] = rest;
        const result = await read(filePath);

        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.content);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
