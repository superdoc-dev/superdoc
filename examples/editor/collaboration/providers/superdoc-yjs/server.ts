import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';
import type { WebSocket } from 'ws';
import type { FastifyRequest } from 'fastify';

import { 
  CollaborationBuilder,
  type CollaborationParams,
  type CollaborationWebSocket,
  type SocketRequest,
  type UserContext,
  type ServiceConfig
} from '@superdoc-dev/superdoc-yjs-collaboration';


/** Create an example server */
const fastify = Fastify({ logger: false });
fastify.register(websocketPlugin);


/** We create some basic hooks */
const handleConfig = (config: ServiceConfig): void => {
  console.debug('[handleConfig] Service has been configured', config);
}

const handleAuth = async ({ documentId, socket, request }: CollaborationParams): Promise<UserContext> => {
  console.debug(`[handleAuth] Authenticating connection for document ${documentId}`);
  const user = { userid: 'abc', username: 'testuser' };
  const organizationid = "someorg123";
  const custom = { someCustomKey: 'somevalue' }
  const context = { user, organizationid, custom };
  return context;
};

const handleLoad = async (params: CollaborationParams): Promise<Uint8Array> => {
  const ydoc = new YDoc();
  console.debug('[handleLoad] loaded', params)
  return encodeStateAsUpdate(ydoc);
}

const handleOnChange = async (params: CollaborationParams): Promise<void> => {
  console.debug(`[handleOnChange Document ${params.documentId} changed.`);
};

const handleAutoSave = async (params: CollaborationParams): Promise<void> => {
  console.debug('handleAutoSave] params', params)
}


const SuperDocCollaboration = new CollaborationBuilder()
  .withName('SuperDoc Collaboration service')
  .withDebounce(2000)
  .onConfigure(handleConfig)
  .onLoad(handleLoad)
  .onAuthenticate(handleAuth)
  .onChange(handleOnChange)
  .onAutoSave(handleAutoSave)
  .build();


/** A sample test route */
fastify.get('/', async (request, reply) => 'Hello, SuperDoc!');


/** An example route for websocket collaboration connection */
fastify.register(async function (fastify) {
  fastify.get('/collaboration/:documentId', { websocket: true }, (socket, request) => {
    SuperDocCollaboration.welcome(socket as any, request as any)
  })
});


/** Start the example! */
const start = async (): Promise<void> => {
  fastify.listen({ port: 3050 }, errorHandler);
  console.log('Server listening at http://localhost:3050');
};

/** Basic error handler example */
const errorHandler = (err: Error | null, address?: string): void => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
