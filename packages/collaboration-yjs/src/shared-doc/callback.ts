import http from 'node:http';
import * as number from 'lib0/number';
import { createLogger } from '@superdoc/common/logger';
import type { SharedSuperDoc } from './shared-doc.js';

const log = createLogger('callback');

type CallbackObjects = Record<string, string>;
type CallbackPayload = {
  room: string;
  data: Record<string, { type: string; content: unknown }>;
};

const CALLBACK_URL = process.env.CALLBACK_URL ? new URL(process.env.CALLBACK_URL) : null;
const CALLBACK_TIMEOUT = number.parseInt(process.env.CALLBACK_TIMEOUT || '5000');
const CALLBACK_OBJECTS: CallbackObjects = (() => {
  try {
    return process.env.CALLBACK_OBJECTS ? JSON.parse(process.env.CALLBACK_OBJECTS) : {};
  } catch {
    return {};
  }
})();

export const isCallbackSet = Boolean(CALLBACK_URL);

export const callbackHandler = (doc: SharedSuperDoc) => {
  const room = doc.name;
  const dataToSend: CallbackPayload = {
    room,
    data: {},
  };
  const sharedObjectList = Object.keys(CALLBACK_OBJECTS);
  sharedObjectList.forEach((sharedObjectName) => {
    const sharedObjectType = CALLBACK_OBJECTS[sharedObjectName];
    dataToSend.data[sharedObjectName] = {
      type: sharedObjectType,
      content: getContent(sharedObjectName, sharedObjectType, doc).toJSON(),
    };
  });
  if (CALLBACK_URL) {
    callbackRequest(CALLBACK_URL, CALLBACK_TIMEOUT, dataToSend);
  }
};

const callbackRequest = (url: URL, timeout: number, data: CallbackPayload) => {
  const serialized = JSON.stringify(data);
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    timeout,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(serialized),
    },
  };
  const req = http.request(options);
  req.on('timeout', () => {
    log.warn('Callback request timed out.');
    req.abort();
  });
  req.on('error', (e) => {
    const sanitizedError = String(e).replace(/\n|\r/g, '');
    log.error('Callback request error:', sanitizedError);
    req.abort();
  });
  req.write(serialized);
  req.end();
};

type SerializableDocContent =
  | ReturnType<SharedSuperDoc['getArray']>
  | ReturnType<SharedSuperDoc['getMap']>
  | ReturnType<SharedSuperDoc['getText']>
  | ReturnType<SharedSuperDoc['getXmlFragment']>
  | ReturnType<SharedSuperDoc['getXmlElement']>
  | Record<string, never>;

const getContent = (objName: string, objType: string, doc: SharedSuperDoc): SerializableDocContent => {
  switch (objType) {
    case 'Array':
      return doc.getArray(objName);
    case 'Map':
      return doc.getMap(objName);
    case 'Text':
      return doc.getText(objName);
    case 'XmlFragment':
      return doc.getXmlFragment(objName);
    case 'XmlElement':
      return doc.getXmlElement(objName);
    default:
      return {};
  }
};
