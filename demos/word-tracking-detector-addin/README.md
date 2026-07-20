# Word tracked-edit detector add-in

This minimal Word task-pane add-in tests live detection of local mutations made
with change tracking enabled or disabled.

It registers `onParagraphAdded`, `onParagraphChanged`, and
`onParagraphDeleted`. For every local event it immediately reads
`document.changeTrackingMode`. A mutation observed in `Off` mode permanently
sets the session's untracked-edit flag until **Reset session flag** is pressed.

## Run

From the SuperDoc repository root, install the workspace dependencies once:

```bash
pnpm install
```

Then start the add-in:

```bash
pnpm --dir demos/word-tracking-detector-addin start
```

The command starts an HTTPS dev server on port 3015 and sideloads
`manifest.xml` into desktop Word. Word should open automatically. Open or create
a document, then use the ribbon's **Edit Detector** button to open the pane.

### macOS certificate prompt

The add-in is served from `https://localhost:3015`, so the development tooling
creates a local **Developer CA for Microsoft Office Add-ins** certificate. On
the first run, or after that certificate expires, macOS may ask for permission
or an administrator password to trust it.

Word may also display a **Verify Certificate** dialog for `localhost`. Select
the developer certificate, choose **Continue**, and enter your macOS password
if prompted. To avoid seeing the same dialog on every launch, select the option
to always trust the localhost certificate before continuing.

If localhost is still reported as untrusted, reinstall and verify the
development certificate, then restart Word:

```bash
pnpm --dir demos/word-tracking-detector-addin exec office-addin-dev-certs uninstall
pnpm --dir demos/word-tracking-detector-addin exec office-addin-dev-certs install
pnpm --dir demos/word-tracking-detector-addin exec office-addin-dev-certs verify
```

### Stop and uninstall

When finished, run the matching stop command. It stops the development server
and unregisters the sideloaded add-in from Word:

```bash
pnpm --dir demos/word-tracking-detector-addin stop
```

This does not remove the reusable localhost development certificate. Remove it
separately only if you no longer develop Office add-ins:

```bash
pnpm --dir demos/word-tracking-detector-addin exec office-addin-dev-certs uninstall
```

## Test

1. Enable Track Changes and edit the document. The pane should remain clear.
2. Disable Track Changes and edit the document. The pane should show
   **Untracked edit detected**.
3. Re-enable Track Changes. The blocked flag remains set.
4. Press **Reset session flag** to start a new observation window.

This is a live-session signal. Events missed while the add-in is closed cannot
be reconstructed by this demo.
