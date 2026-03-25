import { WebsocketProvider } from 'y-websocket';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { awarenessStatesToArray } from '@superdoc/common/collaboration/awareness';
import { Doc as YDoc } from 'yjs';

/**
 * Translate awareness states to an array of users. This will cause superdoc (context) to
 * emit an awareness-update event with the list of users.
 *
 * @param {Object} context The superdoc instance
 * @param {Object} param
 * @param {Object} param.changes The changes in awareness states
 * @param {Object} param.states The current awareness states
 * @returns {void}
 */
function awarenessHandler(context, { changes = {}, states }) {
  // Context is the superdoc instance
  // Since co-presence is handled outside of superdoc,
  // we need to emit an awareness-update event

  const { added = [], removed = [] } = changes;
  const awarenessArray = awarenessStatesToArray(context, states);

  const payload = {
    states: awarenessArray,
    added,
    removed,
    superdoc: context,
  };

  context.emit('awareness-update', payload);
}

/**
 * Main function to create a provider for collaboration.
 * Currently only hocuspocus is actually supported.
 *
 * @deprecated Use external provider instead. Pass { ydoc, provider } to modules.collaboration config.
 * @param {Object} param The config object
 * @param {Object} param.config The configuration object
 * @param {Object} param.ydoc The Yjs document
 * @param {Object} param.user The user object
 * @param {string} param.documentId The document ID
 * @returns {Object} The provider and socket
 */
function createProvider({ config, user, documentId, socket, superdocInstance }) {
  console.warn(
    '[superdoc] Internal provider creation is deprecated. Pass { ydoc, provider } to modules.collaboration instead.',
  );
  if (!config.providerType) config.providerType = 'superdoc';

  const providers = {
    hocuspocus: () => createHocuspocusProvider({ config, user, documentId, socket, superdocInstance }),
    superdoc: () => createSuperDocProvider({ config, user, documentId, socket, superdocInstance }),
  };
  if (!providers) throw new Error(`Provider type ${config.providerType} is not supported.`);

  return providers[config.providerType]();
}

/**
 * @deprecated Use external provider instead. Pass { ydoc, provider } to modules.collaboration config.
 * @param {Object} param The config object
 * @param {Object} param.config The configuration object
 * @param {Object} param.ydoc The Yjs document
 * @param {Object} param.user The user object
 * @param {string} param.documentId The document ID
 * @returns {Object} The provider and socket
 */
function createSuperDocProvider({ config, user, documentId, superdocInstance }) {
  const ydoc = new YDoc({ gc: false });
  const options = {
    params: {
      ...config.params,
    },
  };

  const provider = new WebsocketProvider(config.url, documentId, ydoc, options);
  provider.awareness.setLocalStateField('user', user);
  provider.awareness.on('update', (changes = {}) => {
    return awarenessHandler(superdocInstance, { changes, states: provider.awareness.getStates() });
  });
  return { provider, ydoc };
}

/**
 * @deprecated Use external provider instead. Pass { ydoc, provider } to modules.collaboration config.
 * @param {Object} param The config object
 * @param {Object} param.config The configuration object
 * @param {Object} param.ydoc The Yjs document
 * @param {Object} param.user The user object
 * @param {string} param.documentId The document ID
 * @returns {Object} The provider and socket
 */
function createHocuspocusProvider({ config, user, documentId, socket, superdocInstance }) {
  const ydoc = new YDoc({ gc: false });
  const options = {
    websocketProvider: socket,
    document: ydoc,
    name: documentId,
    token: config.token || '',
    preserveConnection: false,
    onAuthenticationFailed: () => onAuthenticationFailed(documentId),
    onConnect: () => onConnect(superdocInstance, documentId),
    onDisconnect: () => onDisconnect(superdocInstance, documentId),
    onDestroy: () => onDestroy(superdocInstance, documentId),
  };

  const provider = new HocuspocusProvider(options);
  provider.setAwarenessField('user', user);

  provider.on('awarenessUpdate', (params) => {
    return awarenessHandler(superdocInstance, {
      states: params.states,
    });
  });

  return { provider, ydoc };
}

const onAuthenticationFailed = (data, documentId) => {
  console.warn('🔒 [superdoc] Authentication failed', data, 'document', documentId);
};

const onConnect = (superdocInstance, documentId) => {
  console.warn('🔌 [superdoc] Connected -- ', documentId);
};

const onDisconnect = (superdocInstance, documentId) => {
  console.warn('🔌 [superdoc] Disconnected', documentId);
};

const onDestroy = (superdocInstance, documentId) => {
  console.warn('🔌 [superdoc] Destroyed', documentId);
};

/**
 * Setup awareness handler for external providers.
 * Wires up awareness 'change' events to emit superdoc 'awareness-update' events.
 *
 * @param {Object} provider The external provider (must have awareness property)
 * @param {Object} superdocInstance The SuperDoc instance
 * @param {Object} user The user object for local awareness state
 * @returns {() => void} Cleanup function that removes the awareness listener
 */
function setupAwarenessHandler(provider, superdocInstance, user) {
  const awareness = provider.awareness;
  if (!awareness) {
    console.warn('[superdoc] External provider missing awareness property');
    return () => {};
  }

  // Set local user state using standard Yjs awareness API
  if (user && awareness.setLocalStateField) {
    awareness.setLocalStateField('user', user);
  }

  // Listen to standard Yjs awareness 'change' event
  const handler = (changes = {}) => {
    awarenessHandler(superdocInstance, {
      changes,
      states: awareness.getStates(),
    });
  };
  awareness.on('change', handler);

  return () => {
    if (typeof awareness.off === 'function') {
      awareness.off('change', handler);
    }
  };
}

export { createProvider, setupAwarenessHandler };
