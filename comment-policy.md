# Comment policy for AI coding agents

Core rule: write comments when they encode information the code does not
already make obvious. Do not write comments that merely restate the code.

## Write

- Invariants the code does not enforce structurally.
- Business rules, compliance rules, security review outcomes, data-retention
  rules, and payment or audit constraints.
- Non-local constraints that live in another file or service.
- Refactor-sensitive rationale next to code that looks simpler than it is.
- `AIDEV-NOTE:` anchors for rules that must survive future agent edits.

## Do not write

- Comments that paraphrase the next line.
- Generic AI-style docstrings such as "Returns the appropriate value."
- Vague warnings without a named file, symbol, rule, or consequence.
- Historical notes that no longer affect the current code path.

## Prefer specific anchors

Weak:

```ts
// There are processor considerations for gift-card refunds.
```

Strong:

```ts
// AIDEV-NOTE: Gift-card refunds must cap at 24h regardless of any tier.
// The processor settles at T+1 and refunds beyond 24h are unrecoverable.
```

Strong for non-local rules:

```ts
// AIDEV-NOTE: For gift-card refund caps, use capRefundWindow from
// processor_rules. Do not return raw window constants for gift-card orders.
```

## Loaded terms

Some words decay faster than others because they imply precision the code
does not enforce. When you reach for one of these, anchor it.

### `legacy-public`

A user-facing API kept available for backward compatibility. The code path
is current; only the *name* is historical.

Required annotation: replacement and earliest version it can be removed.

```ts
// AIDEV-NOTE: legacy-public - `oldName` kept for v1.x consumers.
// Replaced by `newName`. Earliest removal: v2.0.
```

### `compat-fallback`

A code path used today as the fallback when a newer system has gaps.
**Not** deprecated; the fallback is load-bearing.

Required annotation: what triggers the fallback, and what newer path
replaces it once gaps close.

```ts
// AIDEV-NOTE: compat-fallback - used when ResolvedLayout.content is absent.
// Retire once pm-adapter populates content for every fragment.
```

### `removed-dead`

Code or a symbol that no longer exists in the repo. Should not appear in
comments at all. Describe the change in the PR or git history. A comment
naming a removed symbol as "context" is itself a candidate for removal.

### `deprecated`

Actively scheduled for removal.

Required annotation: `replaceWith` *and* either `removeIn` or
`compat-indefinitely` (with reason).

```ts
/** @deprecated replaceWith=`viewOptions.layout: 'web'` removeIn=v2.0 */
```

A bare `@deprecated` is treated as incomplete: either annotate or delete.

### `temporary`

A short-lived workaround.

Required annotation: condition for removal *and* an issue id.

```ts
// AIDEV-NOTE: temporary - disable until SD-1234 lands the new path.
```

A `temporary` comment without an issue id is treated as permanent, which is
almost never what was intended.

## Treat stale comments as bugs

In agent-heavy codebases, comments and docs are part of the prompt surface.
A stale comment is not harmless decoration. It can become an instruction
the next agent follows. If a comment no longer reflects the code, update it
or delete it in the same change.

## Treat agent-facing docs as comments

`README.md`, `AGENTS.md`, `CLAUDE.md`, architecture notes, runbooks, and
tutorials are prompt surface too. If a code change invalidates one of these
docs, update or delete the stale prose in the same change. A stale root
instruction can be more dangerous than a stale inline comment because agents
may treat it as project policy.

## When a task conflicts with a comment

Treat the comment as a documented constraint. If the requested change appears
to violate it, surface the conflict instead of silently choosing one side.

## CLAUDE.md / AGENTS.md snippet

```markdown
Use comments sparingly, but preserve and add them when they encode invariants
the code does not structurally enforce. Prefer specific `AIDEV-NOTE:` anchors
for business, security, compliance, and non-local rules. Do not add comments
that paraphrase code. When reaching for loaded terms like `legacy`,
`deprecated`, or `temporary`, follow the taxonomy in `comment-policy.md`.
Treat stale comments and stale agent-facing docs as bugs.
```
