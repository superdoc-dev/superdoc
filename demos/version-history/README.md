# Version History Demo

A backend-first implementation of Google Docs-style version history using SuperDoc.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (React)                          │
│  - SuperDoc editor with real-time collaboration                 │
│  - Version sidebar for save/view/revert                         │
└─────────────────────────────────────────────────────────────────┘
           │                                    │
           │ REST API                           │ WebSocket
           ▼                                    ▼
┌─────────────────────────┐      ┌─────────────────────────────────┐
│   REST API (Fastify)    │      │   Collab Server (Hocuspocus)   │
│  - POST /documents      │      │  - Real-time sync via Yjs      │
│  - POST /versions       │      │  - Awareness (cursors, users)  │
│  - POST /revert         │      └─────────────────────────────────┘
│  - GET /versions/:id    │
└─────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│   SuperDoc Node SDK     │
│  - Headless document    │
│  - Export to DOCX       │
│  - Sync with collab     │
└─────────────────────────┘
```

## What This Demo Shows

- **Real-time collaboration** - Multiple users edit simultaneously via Yjs/Hocuspocus
- **Backend-managed versions** - Versions stored as DOCX snapshots on the server
- **Version preview** - Download and view any saved version
- **Revert to version** - Restore any previous version (syncs to all collaborators)

## Folder Structure

```
version-history/
├── backend/
│   ├── src/
│   │   └── server.ts     # Single-file server (REST + WebSocket)
│   └── package.json
├── client/
│   ├── src/              # React frontend
│   ├── public/           # Static assets
│   └── package.json
└── package.json          # Root scripts
```

## Running Locally

```bash
# From the demo root
cd demos/version-history
pnpm install
pnpm dev
```

This starts two servers:
- **Backend** (REST + WebSocket) on `http://localhost:3001`
- **Vite dev server** on `http://localhost:5173`

Or run individually:

```bash
# Terminal 1: Backend (REST API + Collab)
cd backend && pnpm dev

# Terminal 2: Client
cd client && pnpm dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/documents` | Upload a document |
| GET | `/api/documents` | List all documents |
| GET | `/api/documents/:id` | Get document details |
| DELETE | `/api/documents/:id` | Release a document |
| GET | `/api/documents/:id/versions` | List versions |
| POST | `/api/documents/:id/versions` | Save a new version |
| GET | `/api/documents/:id/versions/:vid` | Get version details |
| GET | `/api/documents/:id/versions/:vid/download` | Download version DOCX |
| POST | `/api/documents/:id/versions/:vid/revert` | Revert to version |
| DELETE | `/api/documents/:id/versions/:vid` | Delete a version |

## How It Works

1. **Upload**: Client exports document to DOCX and uploads to backend
2. **Editing**: Users edit in real-time via Hocuspocus/Yjs
3. **Save Version**: Backend exports current doc state via SDK, stores as DOCX snapshot
4. **View Version**: Client downloads DOCX blob and renders in preview
5. **Revert**: Backend loads snapshot, replaces collab room state, syncs to all clients

## Backend Overview

The backend is implemented as a single-file Node.js server (`backend/src/server.ts`, ~740 lines) that combines both the REST API and WebSocket collaboration layer on a single port.

### Server Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Fastify HTTP Server (PORT 3001)                       │
│  ├── REST API (/api/documents, /api/.../versions)      │
│  └── WebSocket upgrades → Hocuspocus (collaboration)   │
└─────────────────────────────────────────────────────────┘
```

### Code Organization

The server is organized into namespaced modules to keep responsibilities clearly separated:

| Namespace | Purpose |
|-----------|---------|
| `Config` | Port, paths, and limits (50 rooms, 10 versions per room) |
| `SDK` | SuperDoc client lifecycle management (open, close, export) |
| `Docs` | Document registry with LRU eviction |
| `Versions` | Version storage with in-memory blob cache |
| `Collab` | Hocuspocus WebSocket collaboration server |
| `API` | HTTP route handlers |

### Key Endpoints

- `POST /api/documents` - Upload a document and receive a `documentId`
- `POST /api/documents/:id/versions` - Save the current document state as a version
- `GET /api/documents/:id/versions` - List all saved versions (polled by the client)
- `POST /api/documents/:id/versions/:versionId/revert` - Restore the document to a previous version
