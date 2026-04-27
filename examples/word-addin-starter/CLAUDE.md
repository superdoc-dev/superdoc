# Word Add-in Doc Sync

Real-time document sync between Microsoft Word and a web-based SuperDoc editor.

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│     addin/      │         │     server/     │         │     webapp/     │
│                 │         │                 │         │                 │
│  Word Taskpane  │◄───────►│  WebSocket Hub  │◄───────►│  SuperDoc       │
│  (Office.js)    │   WSS   │  (Node.js)      │   WSS   │  (Vite)         │
│                 │         │                 │         │                 │
│ localhost:3000  │         │ localhost:8080  │         │ localhost:5173  │
└─────────────────┘         └─────────────────┘         └─────────────────┘
        │                                                        │
        ▼                                                        ▼
   Microsoft Word                                          Web Browser
```

All connections use **WSS (secure WebSocket)** because Word's WebView blocks insecure connections from HTTPS pages.

## Components

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `addin/` | Word taskpane add-in | `taskpane.js`, `taskpane.html`, `manifest.xml` |
| `server/` | WebSocket broadcast hub | `server.js` (HTTPS + WSS) |
| `webapp/` | SuperDoc web editor | `main.js`, `index.html` |

## How to Run

You need **4 terminals**:

### Terminal 1: Server (WSS Hub)
```bash
cd server
npm install
npm start
```
Runs on `wss://localhost:8080`

### Terminal 2: Add-in Dev Server
```bash
cd addin
npm install
npm run dev
```
Runs on `https://localhost:3000`

### Terminal 3: Webapp
```bash
cd webapp
npm install
npm run dev
```
Runs on `http://localhost:5173`

### Terminal 4: Sideload into Word
```bash
cd addin
npm start
```
Opens Word with the add-in registered.

## Testing the Full Flow

1. Click the **SuperDoc** button in Word's ribbon (Home tab)
2. Click **Start Sync** in the taskpane
3. Open http://localhost:5173 in browser
4. Edit in either place - changes sync in real-time

## Sync Protocol

Simple JSON over WebSocket:

```javascript
// Client → Server: Document changed
{
  type: 'document_update',
  document: 'UEsDBBQA...',  // Base64 .docx
  author: 'word-addin'       // or 'web-editor'
}

// Client → Server: Ready to receive
{ type: 'client_ready' }

// Server → Client: Current document
{
  type: 'document_update',
  document: 'UEsDBBQA...',
  author: 'server'
}
```

## Key Implementation Details

### Add-in (taskpane.js)

| Function | What it does |
|----------|--------------|
| `startSync()` | Opens WSS connection, sends current doc, starts listening |
| `getDocumentAsBase64()` | `Office.context.document.getFileAsync()` → base64 |
| `receiveDocument()` | `Word.run()` + `insertFileFromBase64()` to replace doc |
| `startDocumentChangeListener()` | Listens to `DocumentSelectionChanged`, debounces 1s |

### Server (server.js)

- Uses HTTPS with certs from `~/.office-addin-dev-certs/` (created by `office-addin-dev-certs`)
- Stores current document in memory (lost on restart)
- Broadcasts updates to all other connected clients

### Webapp (main.js)

| Function | What it does |
|----------|--------------|
| `initSuperDoc()` | Creates SuperDoc editor instance |
| `sendDocument()` | `exportDocx()` → base64 → WebSocket |
| `receiveDocument()` | base64 → File → reinitialize SuperDoc |

## Configuration

All URLs are in `CONFIG` at the top of each file:

| File | Setting | Default |
|------|---------|---------|
| `addin/taskpane.js` | `serverUrl` | `https://localhost:8080` |
| `addin/taskpane.js` | `webEditorUrl` | `http://localhost:5173` |
| `webapp/main.js` | `serverUrl` | `wss://localhost:8080` |

## Certificates

The server uses the same localhost certificates as the Office add-in dev tools:
- `~/.office-addin-dev-certs/localhost.crt`
- `~/.office-addin-dev-certs/localhost.key`

These are created automatically by `office-addin-dev-certs` when you first run `npm run dev` in the addin folder.

## Troubleshooting

### "Start Sync" shows "Server unavailable"
Server not running or wrong port. Check `curl https://localhost:8080/health` returns JSON.

### Port already in use
```bash
lsof -ti :8080 | xargs kill -9  # Kill whatever's on 8080
lsof -ti :3000 | xargs kill -9  # Kill whatever's on 3000
lsof -ti :5173 | xargs kill -9  # Kill whatever's on 5173
```

### WebSocket error in Word
Word's WebView requires WSS (not WS). Make sure server is using HTTPS and taskpane uses `https://` in `serverUrl`.

### Certificate errors
Run `npm run dev` in `addin/` once to generate/trust certificates. On Mac, you may need to trust the cert in Keychain.

## Limitations

- **No persistence**: Document lost when server restarts
- **Last write wins**: No conflict resolution
- **Full doc sync**: Sends entire document on each change (inefficient for large docs)
- **No auth**: Anyone can connect and send updates
