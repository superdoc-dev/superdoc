import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { roomRoutes } from './routes/rooms.js';

// Load .env from the example root (one level up from server/)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const PORT = Number(process.env.PORT) || 8090;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required. Create .env with OPENAI_API_KEY=sk-...');
  process.exit(1);
}

const app = Fastify({
  logger: {
    level: 'warn',
  },
});

await app.register(cors, {
  origin: [FRONTEND_ORIGIN],
  methods: ['GET', 'POST', 'OPTIONS'],
});

app.get('/', async () => ({ ok: true, service: 'agent' }));

await app.register(roomRoutes, { prefix: '/v1' });

await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`Agent server on port ${PORT}`);
