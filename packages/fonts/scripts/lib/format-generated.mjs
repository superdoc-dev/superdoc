/**
 * Format generated source with the workspace formatter.
 *
 * Both generators here write TypeScript into `src/`, which `vp fmt` then owns.
 * If the generator's output is not already formatted, the next `vp check`
 * rewrites it and the file's own "re-running the generator produces byte
 * identical output" promise stops holding. `--stdin-filepath` is how Oxfmt is
 * told which parser and which `fmt` block options apply, so the answer comes
 * from the repository's config rather than a second set of defaults here.
 *
 * Missing formatter is not an error, which is the same tolerance the Prettier
 * version had and for the same reason: these scripts can run from a consumer's
 * git install, where the workspace devDependencies are absent, and unformatted
 * output is still valid TypeScript.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function formatGenerated(content, filepath) {
  try {
    // Run the JavaScript CLI through Node so pnpm's Windows `.cmd` shim is never involved.
    const vitePlusCli = fileURLToPath(import.meta.resolve('vite-plus/bin'));
    return execFileSync(process.execPath, [vitePlusCli, 'fmt', '--stdin-filepath', filepath], {
      input: content,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return content;
  }
}
