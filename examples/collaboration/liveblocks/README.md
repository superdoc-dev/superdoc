# SuperDoc + Liveblocks Example

This example demonstrates using SuperDoc with [Liveblocks](https://liveblocks.io) as a cloud collaboration provider.

## Setup

1. **Get your Liveblocks API keys**
   - Create an account at [liveblocks.io](https://liveblocks.io)
   - Get your **public API key** from the [dashboard](https://liveblocks.io/dashboard) (starts with `pk_`)
   - Get your **secret API key** for server-side room seeding (starts with `sk_`)

2. **Create `.env` file**
   ```bash
   cp .env.example .env
   # Edit .env and add your key
   ```
   Add this manually for seeding:
   ```bash
   LIVEBLOCKS_SECRET_KEY=sk_xxx
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Run the example**
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000 in multiple browser tabs to test collaboration

## Reproduce: server-prepopulated room

This example includes a server-side seeding script that:

1. Opens a DOCX with a headless SuperDoc editor.
2. Generates a Yjs binary update.
3. Ensures the room exists in Liveblocks.
4. Sends the binary update with `sendYjsBinaryUpdate`.
5. Verifies the room with `getYjsDocumentAsBinaryUpdate`.

Run this exact seed command:

```bash
npm run seed -- /Users/nickjbernal/Desktop/justify-test.docx
```

To guarantee a brand-new room before seeding (delete if exists), use:

```bash
npm run seed -- --fresh /Users/nickjbernal/Desktop/justify-test.docx
```

Then start the browser client and connect to the same room:

```bash
npm run dev
```

Notes:
- `npm run seed` reads `.env` via `node --env-file=.env`.
- Room id defaults to `VITE_ROOM_ID`. You can override with `LIVEBLOCKS_ROOM_ID`.
- Seeding requires `LIVEBLOCKS_SECRET_KEY` (server-side key) and room id.
- The script ensures the room exists (`getOrCreateRoom`) before sending the update.
- `--fresh` deletes the room first, then reseeds it.
- Optional: set `SEED_DOC_PATH` in `.env` and run `npm run seed` without CLI args.

## How It Works

```js
import { createClient } from '@liveblocks/client';
import { LiveblocksYjsProvider } from '@liveblocks/yjs';
import * as Y from 'yjs';

// 1. Create client and enter room
const client = createClient({ publicApiKey: 'pk_...' });
const { room } = client.enterRoom('my-room');

// 2. Create Y.Doc and provider
const ydoc = new Y.Doc();
const provider = new LiveblocksYjsProvider(room, ydoc);

// 3. Pass to SuperDoc
new SuperDoc({
  selector: '#superdoc',
  modules: {
    collaboration: {
      ydoc,
      provider,
    },
  },
});
```

## Resources

- [Liveblocks Yjs Guide](https://liveblocks.io/docs/products/yjs)
- [LiveblocksYjsProvider API](https://liveblocks.io/docs/api-reference/liveblocks-yjs)
