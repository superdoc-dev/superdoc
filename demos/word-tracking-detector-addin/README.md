# Word tracked-edit detector add-in

This minimal Word task-pane add-in tests live detection of local mutations made
with change tracking enabled or disabled.

It registers `onParagraphAdded`, `onParagraphChanged`, and
`onParagraphDeleted`. For every local event it immediately reads
`document.changeTrackingMode`. A mutation observed in `Off` mode permanently
sets the session's untracked-edit flag until **Reset session flag** is pressed.

## Run

```bash
pnpm install
pnpm --dir demos/word-tracking-detector-addin start
```

The command starts an HTTPS dev server on port 3015 and sideloads
`manifest.xml` into desktop Word. Use the ribbon's **Edit Detector** button to
open the pane.

## Test

1. Enable Track Changes and edit the document. The pane should remain clear.
2. Disable Track Changes and edit the document. The pane should show
   **Untracked edit detected**.
3. Re-enable Track Changes. The blocked flag remains set.
4. Press **Reset session flag** to start a new observation window.

This is a live-session signal. Events missed while the add-in is closed cannot
be reconstructed by this demo.
