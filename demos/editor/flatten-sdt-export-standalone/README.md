# Flatten SDT Export Demo (Standalone)

This demo shows how to export documents with SDTs (Content Controls) flattened to plain text while **preserving tracked changes**.

## The Problem

The `isFinalDoc: true` export option couples two behaviors:
1. Flattens SDTs to plain text
2. Accepts all tracked changes

For "legal redlines" use cases, you need SDTs flattened but tracked changes (`w:ins`/`w:del`) preserved.

## The Solution

This demo includes a patch that **always flattens SDTs** on export, without accepting tracked changes.

No API changes - just use normal export:

```typescript
await superdoc.export({
  exportType: ['docx'],
});
// SDTs are automatically flattened, tracked changes preserved
```

## Setup

```bash
npm install    # patch-package runs automatically via postinstall
npm run dev
```

## How It Works

The patch changes one line in `translateStructuredContent()`:

```diff
- if (isFinalDoc && !preserveSdtWrappers) {
+ if (!preserveSdtWrappers) {
```

This makes SDT flattening happen on every export (unless `preserveSdtWrappers` is set), independent of `isFinalDoc`.

## Related

- Linear ticket: IT-1197
- Use case: Ontra "legal redlines" - SDTs flattened, tracked changes preserved
