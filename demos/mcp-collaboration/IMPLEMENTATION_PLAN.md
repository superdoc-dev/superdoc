# Minimal Standalone Live-Collaboration MCP Demo

## Summary

Create a standalone demo in `demos/mcp-collaboration`. The existing
`demos/collaborative-agent` demo remains unchanged. Copy only the editor,
upload, room, and styling pieces that the MCP demo needs; do not create a
shared UI package or refactor the original demo.

The demo has four local processes:

```text
React SuperDoc editor
        ↕ Yjs
Room/Yjs backend
        ↕ Yjs
Hosted HTTP MCP backend
        ↕ Streamable HTTP
Codex / Claude Code
```

The MCP backend reuses the MCP server and `superdoc_attach` implementation
from PR #3569. There is no built-in LLM, model API key, or paid service.

## Branch and dependency strategy

- Develop on a branch created from PR #3569's head.
- Initially stack the PR on `feature/mcp-collab-attach` so its diff contains
  only the transport and demo changes.
- Do not copy or reimplement `superdoc_attach`.
- Do not resolve #3569's conflict with `main` inside the demo commits.
- After #3569 merges, rebase the demo commits onto `main`, retarget the PR,
  and rerun all acceptance tests.

## Planned structure

```text
demos/mcp-collaboration/
├── IMPLEMENTATION_PLAN.md
├── README.md
├── Makefile
├── client/
├── room-server/
└── mcp-server/
```

The client contains only the landing/upload flow, room navigation,
SuperDoc/Yjs editor, readiness polling, room header, MCP connection sidebar,
and required styling. The room server contains only document seeding, room
lifecycle, and Yjs connectivity. The MCP server contains the authenticated
Streamable HTTP composition root.

## Implementation checklist

- [x] Extract an internal `createSuperDocMcpServer()` factory used by both
      stdio and HTTP without changing the published stdio behavior.
- [x] Add a demo-only Streamable HTTP MCP backend on
      `http://127.0.0.1:8091/mcp`.
- [x] Create one MCP server, transport, and `SessionManager` per protocol
      session and clean them up on deletion and shutdown.
- [x] Require `Authorization: Bearer superdoc-demo`, bind to localhost, and
      reject non-local Host headers.
- [x] Add a minimal room server that uploads/seeds DOCX files and keeps room
      state in memory without any agent or OpenAI code.
- [x] Run the Yjs relay on `ws://127.0.0.1:8081`.
- [x] Add a two-column frontend with the live editor and MCP connection
      details for Codex and Claude Code.
- [x] Keep connection-snippet generation in a pure, testable function.
- [x] Provide `make install`, `make dev`, `make test`, and `make clean`.
- [x] Document local-only limitations and production follow-ups.

## MCP connection details

Codex:

```bash
export MCP_DEMO_TOKEN=superdoc-demo
codex mcp add superdoc-live \
  --url http://127.0.0.1:8091/mcp \
  --bearer-token-env-var MCP_DEMO_TOKEN
```

Claude Code:

```bash
claude mcp add \
  --transport http \
  --header "Authorization: Bearer superdoc-demo" \
  superdoc-live \
  http://127.0.0.1:8091/mcp
```

Room prompt:

```text
Call superdoc_attach with:
- ws_url: ws://127.0.0.1:8081
- document_id: <current-room-id>
- user: { id: "external-agent", name: "Codex" }

Read the open document and make the requested edits. Use tracked changes
when requested. The document is already visible in SuperDoc.
```

## Acceptance criteria

### AC-1: Build and startup

- [x] The MCP package and both demo backends typecheck.
- [x] Existing MCP tests pass.
- [x] The client production build succeeds.
- [x] The new demo neither imports OpenAI nor reads `OPENAI_API_KEY`.
- [x] `make dev` starts all local processes without an `.env` file.

### AC-2: Authentication

- [x] Missing or incorrect bearer credentials return `401`.
- [x] Correct credentials allow MCP initialization.
- [x] Non-local Host headers are rejected.

### AC-3: Protocol compatibility

- [x] The official `StreamableHTTPClientTransport` initializes successfully.
- [x] `tools/list` contains `superdoc_attach` and the grouped document tools.
- [x] The client can close its protocol session successfully.

### AC-4: Live collaboration

- [x] A test starts a real Yjs relay on an ephemeral localhost port.
- [x] An observer SuperDoc session and an HTTP MCP client join the same room.
- [x] MCP attaches through `superdoc_attach` and creates a paragraph containing
      `MCP live collaboration test`.
- [x] Bounded polling observes that marker through the observer session,
      proving live Yjs propagation.

### AC-5: Cleanup

- [x] Closing a document destroys its collaboration provider and editor.
- [x] Deleting an HTTP MCP session removes its transport and session manager.
- [x] Test teardown closes every HTTP server, WebSocket relay, provider, and
      child process.

### AC-6: Regression and UI data

- [x] Existing stdio and bundled MCP protocol tests remain green.
- [x] Pure tests verify exact Codex and Claude commands, room ID, and Yjs URL.
- [x] The frontend builds without adding another frontend test framework.

All tests use ephemeral ports, unique rooms, deterministic marker text,
bounded polling, and `finally` cleanup. Tests never require Codex, Claude, an
LLM API key, or an external model response.

## Clean Code review gates

- [x] **Meaningful names:** identifiers communicate MCP, room, transport, or
      collaboration intent.
- [x] **Small functions:** each function performs one identifiable operation.
- [x] **Single responsibility:** transport, authentication, construction,
      room lifecycle, and UI rendering stay separate.
- [x] **One abstraction level:** HTTP parsing is not mixed with tool
      registration or document operations.
- [x] **Few arguments:** cohesive configuration uses typed option objects.
- [x] **No hidden side effects:** startup and shutdown explicitly own and
      return disposable resources.
- [x] **No duplication:** stdio and HTTP share MCP construction and tool
      registration.
- [x] **Purposeful comments:** comments explain protocol or lifecycle reasons,
      not visible code.
- [x] **Explicit errors:** authentication, initialization, attachment, and
      cleanup failures are actionable.
- [x] **Clean tests:** tests are fast, independent, repeatable,
      self-validating, and readable as specifications.

## Explicit limitations

This is a localhost-only demo. OAuth, TLS, filesystem-tool restrictions,
WebSocket destination allowlisting, persistent rooms, expiring credentials,
rate limiting, ChatGPT connectivity, and public deployment are future work.

## Plan deviations

Record intentional deviations here with a date, reason, and affected
acceptance criteria. Do not rewrite completed requirements during review.

- **2026-07-15 — SuperDoc facade imports:** #3569 imported the blank DOCX and
  document adapters through internal `@superdoc/super-editor` subpaths. The
  current stacked branch already exposes both from `superdoc/super-editor`, so
  the MCP session manager now uses that single runtime/type facade and disables
  telemetry explicitly. This fixes current type identity/runtime resolution
  without changing tool behavior. Affects AC-1 and AC-6.
- **2026-07-15 — Isolated relay fixture:** AC-4 starts the real y-websocket
  relay in a child process instead of importing its CommonJS server utility
  beside the MCP client's ESM Yjs runtime. This avoids duplicate Yjs
  constructors while retaining an ephemeral real relay and explicit child
  cleanup. Affects AC-4 and AC-5.
- **2026-07-15 — Self-contained regression runner:** the demo installs a local
  Bun binary and approves its install script so `make test` can execute #3569's
  unchanged Bun-based MCP regressions on machines without a global Bun
  installation. Affects AC-1 and AC-6.
- **2026-07-16 — Review-oriented room prompt:** the generated room prompt now
  asks the connected agent to identify and make document improvements using
  tracked changes, replacing the original request-driven edit wording. The
  pure snippet test verifies the new exact prompt. Affects AC-6.
