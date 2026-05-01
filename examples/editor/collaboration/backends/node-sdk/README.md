# Node.js SDK + Collaboration (Barebones)

Tiny demo focused on one thing: open a realtime collaboration session from Node.js and mutate it via HTTP.

This example uses `@superdoc-dev/sdk` from npm and exposes the same endpoints as the FastAPI sample:

- `GET /`
- `GET /status`
- `GET /insert?text=...`
- `GET /markdown`
- `GET /download`

`package.json` tracks the npm `latest` channel for `@superdoc-dev/sdk`.

`server.mjs` is hardcoded for the local `@y/hub` server in `../fastapi/yjs-hub`.
It reuses the FastAPI sample assets:

- `../fastapi/assets/doc-template.docx`
- `../fastapi/assets/fake-nda.md`

and writes `/download` output to `examples/collaboration/node-sdk/.superdoc-state/download.docx`.

## 1) Install

```bash
cd /path/to/superdoc/examples/collaboration/node-sdk
npm install
```

## 2) Start a collaboration server

From the FastAPI sample folder:

```bash
cd /path/to/superdoc/examples/collaboration/fastapi
./run-yjs-hub.sh
```

If you use a custom token, set it before starting the Node server:

```bash
export YHUB_AUTH_TOKEN="my-demo-token"
```

## 3) Start the Node API

```bash
cd /path/to/superdoc/examples/collaboration/node-sdk
npm run dev
```

Default URL: `http://127.0.0.1:8001`

## 4) Test endpoints

```bash
curl "http://127.0.0.1:8001/status"
curl "http://127.0.0.1:8001/insert?text=hello%20from%20node%20sdk"
```
