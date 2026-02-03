# Demo

This demo shows how to integrate `@superdoc-dev/esign` into a React application. The frontend sends signing and download requests to a proxy server, which securely communicates with the SuperDoc Services API.

## Prerequisites

You'll need a SuperDoc Services API key. [Get your API key here](https://docs.superdoc.dev/api-reference/authentication/register).

## Setup

1. Build the main package (from repo root):
   ```bash
   pnpm build
   ```

2. Install dependencies:
   ```bash
   cd demo
   pnpm install
   cd server
   pnpm install
   ```

3. Create `.env` file in `demo/server/`:
   ```
   SUPERDOC_SERVICES_API_KEY=your_key_here
   ```

4. Update `demo/vite.config.ts` to proxy to localhost:
   ```ts
   proxy: {
     '/v1': {
       target: 'http://localhost:3001',
       changeOrigin: true,
     },
   },
   ```

## Running

Start the proxy server:
```bash
cd demo/server
pnpm start
```

In a separate terminal, start the frontend:
```bash
cd demo
pnpm dev
```
