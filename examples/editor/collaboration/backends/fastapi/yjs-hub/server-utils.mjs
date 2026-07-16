export const YHUB_INTERNAL_PORT = Number(process.env.YHUB_INTERNAL_PORT ?? 8082);
export const YHUB_INTERNAL_HOST = process.env.YHUB_INTERNAL_HOST ?? '127.0.0.1';
export const BASE_PATH = '/v1/collaboration';
export const ORG = process.env.YHUB_ORG ?? 'superdoc';

const HTTP_CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const MAX_DOCUMENT_ID_LENGTH = 200;
const MAX_BRANCH_LENGTH = 100;
const SSE_EVENT_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const HTTP_VERSION_PATTERN = /^1\.[01]$/;
const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export function hasHttpControlChars(value) {
  return HTTP_CONTROL_CHARS.test(String(value ?? ''));
}

export function isValidDocumentId(value) {
  const text = String(value ?? '');
  return text.length > 0 && text.length <= MAX_DOCUMENT_ID_LENGTH && !hasHttpControlChars(text);
}

export function isValidBranch(value) {
  const text = String(value ?? '');
  return text.length > 0 && text.length <= MAX_BRANCH_LENGTH && !hasHttpControlChars(text);
}

export function assertSseEventName(eventName) {
  if (!SSE_EVENT_NAME_PATTERN.test(String(eventName ?? ''))) {
    throw new Error(`Invalid SSE event name: ${eventName}`);
  }
}

function assertNoHttpControlChars(name, value) {
  if (hasHttpControlChars(value)) {
    throw new Error(`${name} contains HTTP control characters`);
  }
}

export function formatRoom(room) {
  const org = room?.org ?? 'unknown-org';
  const docid = room?.docid ?? 'unknown-doc';
  const branch = room?.branch ?? 'main';
  return `${org}/${docid}@${branch}`;
}

export function writeSseEvent(response, eventName, payload) {
  assertSseEventName(eventName);
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function parseClientPath(requestUrl) {
  const url = new URL(requestUrl, 'http://localhost');
  const prefix = `${BASE_PATH}/`;
  if (!url.pathname.startsWith(prefix)) {
    return { ok: false, statusCode: 404, reason: 'expected /v1/collaboration/:documentId' };
  }

  const encodedDocumentId = url.pathname.slice(prefix.length);
  if (!encodedDocumentId) {
    return { ok: false, statusCode: 400, reason: 'missing documentId path segment' };
  }

  try {
    const documentId = decodeURIComponent(encodedDocumentId);
    if (!documentId) {
      return { ok: false, statusCode: 400, reason: 'empty documentId' };
    }
    if (!isValidDocumentId(documentId)) {
      return { ok: false, statusCode: 400, reason: 'invalid documentId' };
    }

    const targetPath = `/ws/${encodeURIComponent(ORG)}/${encodeURIComponent(documentId)}${url.search}`;
    return { ok: true, documentId, targetPath };
  } catch {
    return { ok: false, statusCode: 400, reason: 'invalid encoded documentId' };
  }
}

export function parseActivityPath(requestUrl, tailSegment) {
  const url = new URL(requestUrl, 'http://localhost');
  const prefix = `${BASE_PATH}/`;
  if (!url.pathname.startsWith(prefix) || !url.pathname.endsWith(tailSegment)) {
    return { ok: false };
  }

  const encodedDocumentId = url.pathname.slice(prefix.length, url.pathname.length - tailSegment.length);
  if (!encodedDocumentId) {
    return { ok: false, statusCode: 400, reason: 'missing documentId path segment' };
  }

  try {
    const documentId = decodeURIComponent(encodedDocumentId);
    if (!documentId) {
      return { ok: false, statusCode: 400, reason: 'empty documentId' };
    }
    if (!isValidDocumentId(documentId)) {
      return { ok: false, statusCode: 400, reason: 'invalid documentId' };
    }
    const branch = url.searchParams.get('branch') || 'main';
    if (!isValidBranch(branch)) {
      return { ok: false, statusCode: 400, reason: 'invalid branch' };
    }
    return { ok: true, documentId, branch };
  } catch {
    return { ok: false, statusCode: 400, reason: 'invalid encoded documentId' };
  }
}

export function buildForwardRequest(request, targetPath) {
  if (request.method !== 'GET') {
    throw new Error('Invalid HTTP method');
  }
  if (!HTTP_VERSION_PATTERN.test(String(request.httpVersion ?? ''))) {
    throw new Error('Invalid HTTP version');
  }
  assertNoHttpControlChars('targetPath', targetPath);

  const headerLines = [
    `Host: ${YHUB_INTERNAL_HOST}:${YHUB_INTERNAL_PORT}`,
    'Connection: Upgrade',
    'Upgrade: websocket',
  ];
  const rawHeaders = request.rawHeaders ?? [];

  for (let i = 0; i < rawHeaders.length; i += 2) {
    const key = String(rawHeaders[i] ?? '');
    const value = String(rawHeaders[i + 1] ?? '');
    const lowerKey = key.toLowerCase();

    if (!HTTP_HEADER_NAME_PATTERN.test(key)) {
      throw new Error(`Invalid HTTP header name: ${key}`);
    }
    assertNoHttpControlChars(`HTTP header ${key}`, value);
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) {
      continue;
    }

    headerLines.push(`${key}: ${value}`);
  }

  return `GET ${targetPath} HTTP/${request.httpVersion}\r\n${headerLines.join('\r\n')}\r\n\r\n`;
}
