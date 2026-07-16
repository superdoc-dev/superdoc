/**
 * Compile entrypoint for the standalone host binary (`bun build --compile`).
 *
 * `stdio.ts` guards its auto-start with `import.meta.main` (true for
 * `bun src/rpc/stdio.ts`), but that is false inside a compiled binary - so the
 * binary needs to start the server unconditionally here.
 */

import { runStdioServer } from './stdio.js';

runStdioServer()
  .then(() => process.exit(0))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
