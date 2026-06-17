# Headless Comments Panel Demo

A standalone React demo showing how to build a custom comments and track changes review panel using SuperDoc's Document API.

## What This Demo Shows

- Custom UI for reviewing track changes and comments side-by-side
- Using `editor.doc.comments.list()` and `editor.doc.comments.get()` to fetch comment data
- Using `editor.doc.trackChanges.decide()` to accept/reject changes
- Using `editor.doc.comments.update()` and `editor.doc.comments.delete()` to manage comments
- Hiding SuperDoc's built-in sidebar via CSS (`.superdoc__right-sidebar { display: none !important; }`)

## Running

```bash
cd demos/headless-comments-panel
npm install
npm run dev
```

Runs at http://localhost:3000

## Architecture

- **Standalone**: This demo is excluded from the monorepo's pnpm workspace. Use `npm` directly.
- **React 18**: Uses hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`)
- **Vite**: Dev server with HMR

## Key Files

- `src/App.jsx` - Main app with SuperDoc initialization
- `src/components/CommentsPanel.jsx` - The custom review panel
- `src/App.css` - App styles
- `src/components/CommentsPanel.css` - Panel styles

## Document API Usage

```javascript
// List all comments (includes track changes)
const result = editor.doc.comments.list({ includeResolved: true });

// Get full comment details (includes text field)
const full = editor.doc.comments.get({ commentId });

// Accept/reject track change
editor.doc.trackChanges.decide({
  decision: 'accept', // or 'reject'
  target: { id: changeId }
});

// Resolve/delete comment
editor.doc.comments.update({ id: commentId, status: 'resolved' });
editor.doc.comments.delete({ id: commentId });
```

## Panel Features

- Toggle pills to show/hide changes or comments columns
- Cards in each row match height
- Floating card design with shadows
- Click card to scroll to item in document
- Accept/Reject buttons for track changes
- Resolve/Delete buttons for comments
