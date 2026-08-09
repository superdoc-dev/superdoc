# Tests

Cross-package and consumer contract tests. Everything here answers one question:
**can someone outside this repository import and use what we publish?**

Most tests are not here. A unit or package-integration test lives beside the
source it verifies, because locality beats a distant mirror of the source tree.

## What is here

| Path | What it proves |
|---|---|
| `consumer-typecheck/` | The published types work for a consumer. Packs the tarball, installs it, and typechecks against it across a matrix of module and TypeScript settings |

`consumer-typecheck/` deliberately carries its own lockfile and is not a pnpm
workspace member. It has to install the way a consumer installs, so resolving
through the repository's workspace links would defeat the point.

## What does not belong here

A broad system or conformance corpus is not a consumer contract. Those stay with
the engine they exercise. This directory is small on purpose: a test that would
pass just as well beside its source belongs beside its source.

The distinction matters because a test directory is not automatically public.
Keep the tests that prove what an outside consumer can import; a
system-conformance corpus is a different thing wearing the same name.

## Fixtures

A fixture used by one test area sits beside that test area, so the owning test is
obvious from the path. `tests/fixtures/<area>/` is where a fixture genuinely
shared across areas goes, and a shared fixture needs a documented owner and a
public test explaining why it exists.

That directory does not exist today. Whether anything belongs in it is an open
question rather than a settled no: there are duplicate fixtures in the tree whose
ownership has not been classified, and a policy-level audit is what decides
which of them are legitimate local copies and which are drift. Do not create the
directory to hold something merely because two places use it; the owner and the
reason come first.

Fixtures are synthetic by default. A `.docx` is a zip archive, so a text-based
secret scanner reads its compressed bytes and finds nothing: `pnpm
check:docx-privacy` opens every tracked `.docx` and reads the identity-bearing
parts instead. It fails closed, so a fixture it cannot read is a failure rather
than a pass. `node scripts/sanitize-docx.mjs <file>` strips the metadata.

## Running things

Run these from the public root, the directory holding `pnpm-workspace.yaml`. In
an Orbit checkout that is `superdoc/public`, not the Orbit root, which does not
define these scripts.

| What to verify | Command | Speed |
|---|---|---|
| Logic across the repository | `pnpm test` | seconds |
| The published surfaces | `pnpm check:public` | ~5 min |
| DOCX fixture privacy | `pnpm check:docx-privacy` | seconds |
