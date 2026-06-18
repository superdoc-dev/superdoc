import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  buildForwardRequest,
  isValidBranch,
  isValidDocumentId,
  parseActivityPath,
  parseClientPath,
  writeSseEvent,
} from './server-utils.mjs';

function createUpgradeRequest(overrides = {}) {
  return {
    method: 'GET',
    httpVersion: '1.1',
    rawHeaders: [
      'Host',
      'public.example',
      'Connection',
      'Upgrade',
      'Upgrade',
      'websocket',
      'Sec-WebSocket-Key',
      'abc123==',
      'Sec-WebSocket-Version',
      '13',
      'User-Agent',
      'test-client',
    ],
    ...overrides,
  };
}

describe('parseClientPath', () => {
  test('rejects document ids with control characters', () => {
    assert.deepEqual(parseClientPath('/v1/collaboration/room%0Dbad'), {
      ok: false,
      statusCode: 400,
      reason: 'invalid documentId',
    });
  });

  test('accepts the default example room', () => {
    assert.deepEqual(parseClientPath('/v1/collaboration/superdoc-dev-room'), {
      ok: true,
      documentId: 'superdoc-dev-room',
      targetPath: '/ws/superdoc/superdoc-dev-room',
    });
  });

  test('preserves encoded slashes in document ids', () => {
    assert.deepEqual(parseClientPath('/v1/collaboration/room%2Fchild'), {
      ok: true,
      documentId: 'room/child',
      targetPath: '/ws/superdoc/room%2Fchild',
    });
  });

  test('preserves query params in the target path', () => {
    assert.deepEqual(parseClientPath('/v1/collaboration/superdoc-dev-room?token=abc'), {
      ok: true,
      documentId: 'superdoc-dev-room',
      targetPath: '/ws/superdoc/superdoc-dev-room?token=abc',
    });
  });
});

describe('parseActivityPath', () => {
  test('rejects document ids with control characters', () => {
    assert.deepEqual(
      parseActivityPath('/v1/collaboration/room%0Aevent%3Aevil/activity/stream', '/activity/stream'),
      {
        ok: false,
        statusCode: 400,
        reason: 'invalid documentId',
      },
    );
  });

  test('rejects branches with control characters', () => {
    assert.deepEqual(
      parseActivityPath('/v1/collaboration/room/activity/stream?branch=main%0Adata%3Aevil', '/activity/stream'),
      {
        ok: false,
        statusCode: 400,
        reason: 'invalid branch',
      },
    );
  });

  test('accepts the default example room and branch', () => {
    assert.deepEqual(
      parseActivityPath('/v1/collaboration/superdoc-dev-room/activity/stream?branch=main', '/activity/stream'),
      {
        ok: true,
        documentId: 'superdoc-dev-room',
        branch: 'main',
      },
    );
  });
});

describe('SSE utilities', () => {
  test('rejects invalid event names', () => {
    assert.throws(() => writeSseEvent({ write() {} }, 'bad\nevent', {}), /Invalid SSE event name/);
  });

  test('escapes payload newlines through JSON serialization', () => {
    const chunks = [];
    writeSseEvent({ write: (chunk) => chunks.push(chunk) }, 'connected', {
      room: { docid: 'x\nevent:evil' },
    });

    assert.equal(chunks.filter((chunk) => chunk.startsWith('event:')).length, 1);
    assert.equal(chunks.filter((chunk) => chunk.startsWith('data:')).length, 1);
    const output = chunks.join('');
    assert.match(output, /^event: connected\ndata: /);
    assert.doesNotMatch(output, /\ndata: .*\nevent:evil/s);
    assert.match(output, /x\\nevent:evil/);
  });
});

describe('room validation helpers', () => {
  test('reject length overflows', () => {
    assert.equal(isValidDocumentId('a'.repeat(201)), false);
    assert.equal(isValidBranch('b'.repeat(101)), false);
  });

  test('accepts normal document ids and branches', () => {
    assert.equal(isValidDocumentId('superdoc-dev-room'), true);
    assert.equal(isValidBranch('main'), true);
  });
});

describe('buildForwardRequest', () => {
  test('rejects unsupported methods', () => {
    assert.throws(
      () => buildForwardRequest(createUpgradeRequest({ method: 'POST' }), '/ws/superdoc/room'),
      /Invalid HTTP method/,
    );
  });

  test('rejects invalid HTTP versions', () => {
    assert.throws(
      () => buildForwardRequest(createUpgradeRequest({ httpVersion: '1.1\r\nX: y' }), '/ws/superdoc/room'),
      /Invalid HTTP version/,
    );
  });

  test('rejects target paths with control characters', () => {
    assert.throws(
      () => buildForwardRequest(createUpgradeRequest(), '/ws/superdoc/room\r\nX: y'),
      /targetPath contains HTTP control characters/,
    );
  });

  test('rejects invalid header names', () => {
    assert.throws(
      () => buildForwardRequest(createUpgradeRequest({ rawHeaders: ['Bad Header', 'value'] }), '/ws/superdoc/room'),
      /Invalid HTTP header name/,
    );
    assert.throws(
      () => buildForwardRequest(createUpgradeRequest({ rawHeaders: ['Bad:Header', 'value'] }), '/ws/superdoc/room'),
      /Invalid HTTP header name/,
    );
  });

  test('rejects header values with control characters', () => {
    assert.throws(
      () => buildForwardRequest(createUpgradeRequest({ rawHeaders: ['Sec-WebSocket-Key', 'abc\r\nX: y'] }), '/ws/superdoc/room'),
      /contains HTTP control characters/,
    );
  });

  test('reconstructs required websocket headers and drops incoming host', () => {
    const forwarded = buildForwardRequest(createUpgradeRequest(), '/ws/superdoc/superdoc-dev-room?token=abc');

    assert.ok(forwarded.startsWith('GET /ws/superdoc/superdoc-dev-room?token=abc HTTP/1.1\r\n'));
    assert.match(forwarded, /\r\nHost: 127\.0\.0\.1:8082\r\n/);
    assert.match(forwarded, /\r\nConnection: Upgrade\r\n/);
    assert.match(forwarded, /\r\nUpgrade: websocket\r\n/);
    assert.match(forwarded, /\r\nSec-WebSocket-Key: abc123==\r\n/);
    assert.match(forwarded, /\r\nSec-WebSocket-Version: 13\r\n/);
    assert.match(forwarded, /\r\nUser-Agent: test-client\r\n/);
    assert.ok(forwarded.endsWith('\r\n\r\n'));
    assert.doesNotMatch(forwarded.replaceAll('\r\n', ''), /\n/);
  });
});
