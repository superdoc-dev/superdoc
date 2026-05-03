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

## Treat stale comments as bugs

A stale or misleading comment wastes the exact place where a useful invariant
could have lived. Update it or delete it during the same change.

## When a task conflicts with a comment

Treat the comment as a documented constraint. If the requested change appears
to violate it, surface the conflict instead of silently choosing one side.

## CLAUDE.md / AGENTS.md snippet

```markdown
Use comments sparingly, but preserve and add them when they encode invariants
the code does not structurally enforce. Prefer specific `AIDEV-NOTE:` anchors
for business, security, compliance, and non-local rules. Do not add comments
that paraphrase code. Treat stale comments as bugs.
```
