# Word Add-in Starter

Real-time document sync between Microsoft Word and a web-based SuperDoc editor.

## Quick Start

```bash
# Install everything
npm install
npm run install:all

# Run all services (server + addin + webapp)
npm run dev

# In a separate terminal, sideload into Word
npm run addin:start
```

Then:
1. Click **SuperDoc** in Word's ribbon
2. Click **Start Sync**
3. Open http://localhost:5173 in browser
4. Edit in either place - changes sync!

## Architecture

```
Word Add-in          Server              Web Editor
(localhost:3000)     (localhost:8080)    (localhost:5173)
     │                    │                    │
     │◄──── WSS ─────────►│◄──── WSS ─────────►│
     │                    │                    │
  Office.js          Broadcasts           SuperDoc
  extracts .docx     to all clients       renders .docx
```

**How it works:**
- Add-in extracts the Word document as base64 and sends it via WebSocket
- Server broadcasts updates to all connected clients
- Webapp receives updates and loads them into SuperDoc
- Changes flow both directions in real-time

## Project Structure

```
word-addin-starter/
├── addin/       # Word taskpane (Office.js + Webpack)
├── server/      # WebSocket broadcast hub (Node.js)
└── webapp/      # SuperDoc editor (Vite)
```

## Requirements

- Node.js 18+
- Microsoft Word (desktop)
