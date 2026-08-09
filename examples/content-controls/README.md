# Content controls

List a Word text content control, update its value, and export the DOCX with the control intact.

The sample document contains one synthetic field tagged `company-name`.

## Run it

Requires Node 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm dev
```

Change the company name, choose **Update field**, and export the DOCX.

## Verify it

```bash
pnpm typecheck
pnpm build
pnpm browsers
pnpm test
```

The browser test updates the real Word content control and verifies that its tag and new value remain in `word/document.xml`.

See [Build a content-control panel](https://docs.superdoc.dev/editor/custom-ui/content-controls) for additional control types and navigation.
