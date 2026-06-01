# @superdoc/contracts

Shared type definitions for SuperDoc's layout pipeline. Consumers import these
types (e.g., `FlowBlock`, `TextRun`) to keep adapters, measurers, and painters in
sync.

## 1.0.0 highlights

- Stable 1.0 release of the contracts package
- Added `TrackedChangeKind`, `TrackedChangesMode`, `RunMark`, and
  `TrackedChangeMeta` types
- `TextRun` now exposes an optional `trackedChange` payload carrying author/date
  metadata plus format deltas for track-change marks
- `AdapterOptions` (in the v1 SuperEditor layout adapter) accepts `trackedChangesMode` and
  `enableTrackedChanges` so callers can opt into the new metadata
- Versioned `FlowRunLink` schema with extended metadata (target, rel, anchor, docLocation, etc.)

Remember to bump `CONTRACTS_VERSION` whenever a breaking type change lands so
downstream packages can assert compatibility at runtime.
