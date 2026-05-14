# Agent docs policy

Core rule: agent docs (`CLAUDE.md`, `AGENTS.md`, `.claude/rules/*.md`) encode
non-obvious truths that a competent agent would otherwise miss. They are not
encyclopedias of the codebase.

## Placement

- **Root `CLAUDE.md` / `AGENTS.md`**: routing layer. Cross-package invariants,
  high-frequency truths, the one-line "where does X go" answer. Loaded into
  every session.
- **Nested `<package>/AGENTS.md`**: package-specific rules and patterns.
  Loaded only when an agent reads files in that package.
- **`.claude/rules/<topic>.md`** with `paths:` frontmatter: rules that only
  apply to matching files (e.g. JSDoc rules for `**/*.js`).
- **Symlink pairs**: when both `AGENTS.md` and `CLAUDE.md` exist with the same
  content, make `AGENTS.md` canonical and symlink `CLAUDE.md` to it. Allowlist
  intentional audience-specific pairs that must differ.
- **Hooks or scripts**: anything that must be enforced rather than advised.
  Doc-level "always do X" rules that have a deterministic check belong in CI,
  not in agent docs.

## Size budgets

- Root: target <= 120 lines. Hard ceiling 200.
- Nested: target <= 200 lines. Flag at 200, justify above 250.
- Path-scoped rule files: one concern per file, <= 50 lines.

## Write

- Architectural invariants that prevent wrong-subsystem edits.
- The four-file pattern, the do-not-hand-edit-derived list, the layer boundary
  whose violation produces real bugs.
- Non-obvious commands (workspace filters, multi-step procedures).
- Repo conventions an agent cannot infer from one file (`pnpm run X` vs
  `pnpm --filter Y run X`, symlink direction for `AGENTS.md` / `CLAUDE.md`).
- Subsystem rules that have caused recurring PR feedback.

## Do not write

- Project structure trees that `ls packages/` would produce.
- Standard language conventions or framework basics.
- File-by-file descriptions of source.
- Long restatements of what nested docs already say.
- Marketing copy or brand prose; that belongs in `brand.md`.
- Speculative rules, one-off preferences, or guidance whose value has not been
  observed in real work. Agents try to satisfy written rules; unnecessary
  requirements add cost and can reduce task success.

## Verifiable claims

Every concrete claim must be checkable by the audit:

- **Paths in backticks** must resolve from the doc's package root, the repo
  root, or one of `packages/`, `apps/`, `shared/`.
- **`pnpm <script>` references** must resolve in the relevant `package.json`,
  including workspace-filter forms (`pnpm --filter <pkg> run <script>`).
- **Identifiers** named in prose (function names, exports, type aliases) must
  exist in the referenced file at audit time.
- **`@imports`** must resolve to a real file.
- **Architectural claims** ("X owns Y", "A does not import B") should match
  what `rg` finds in the referenced packages.
- **Worked examples and code snippets** must reflect current APIs and
  conventions. An example that pins a specific identifier or sequence rots
  faster than the surrounding prose; prefer pointing at a real test or
  reference doc over inlining an example.

## Exceptions

- **Consumer-facing pairs may differ from dev-internal pairs.** When an
  `AGENTS.md` ships to npm consumers and the sibling `CLAUDE.md` is for repo
  contributors, they speak to different audiences and should diverge. Add
  the pair to the audit's `intentionalDifferentPairs` allowlist with a short
  reason.
- **Prefer pointers to source-of-truth docs over inlined procedures.** Always-
  loaded docs should link to deeper docs rather than copy long procedures
  inline. This is the main anti-bloat rule.

## Findings classification

When the audit produces findings, each one is one of:

| Label | Meaning | Action |
|---|---|---|
| **KEEP** | Load-bearing, verified against current code. **Only emit when explaining why an over-budget or otherwise-flagged section should remain.** Do not emit KEEP for every passing section; the default for verified content is silence. |
| **TRIM** | Load-bearing but verbose; cut wording, keep meaning. | Reword in place. |
| **MOVE** | Better placed in nested doc, path-scoped rule, or hook. | Author follow-up PR. |
| **UPDATE** | Stale (paths/identifiers/commands no longer accurate). | Fix in place. |
| **INVESTIGATE** | Audit can't tell. Human decides. | Open issue or thread. |

The audit reports findings; it never auto-applies them.

## Out of scope for this policy

- Code comments inside source files (see `comment-policy.md`).
- Consumer-facing brand voice (see `brand.md`).
- API documentation under `apps/docs/` (separate doc system).
