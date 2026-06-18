import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createDownloadFileService } from "./download-file.js";
import { validateDownloadUrl } from "./security-utils.js";

function createFakeHttpsGet(specs, calls) {
  return (url, options, onResponse) => {
    const spec = specs.shift();
    assert.ok(spec, `unexpected https.get call for ${String(url)}`);

    const request = new EventEmitter();
    request.setTimeout = (timeoutMs, handler) => {
      request.timeoutMs = timeoutMs;
      request.timeoutHandler = handler;
    };
    request.destroy = (error) => {
      request.destroyedWith = error;
      queueMicrotask(() => request.emit("error", error));
    };

    calls.push({
      url: url instanceof URL ? url.href : String(url),
      options,
      request,
    });

    const response = new PassThrough();
    response.statusCode = spec.statusCode;
    response.headers = spec.headers ?? {};
    const originalResume = response.resume.bind(response);
    response.resume = () => {
      response.resumed = true;
      return originalResume();
    };

    queueMicrotask(() => {
      onResponse(response);
      for (const chunk of spec.bodyChunks ?? []) {
        if (response.destroyed || response.writableEnded) break;
        response.write(chunk);
      }
      if (!response.destroyed && !response.writableEnded) {
        response.end();
      }
    });

    return request;
  };
}

function createValidateUrlWithAllowedHosts(allowedHosts) {
  const hostSet = new Set(allowedHosts);
  return (fileUrl) => validateDownloadUrl(fileUrl, { allowedHosts: hostSet });
}

test("downloadFile revalidates redirect targets before following them", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sd-slack-redlining-"));
  const calls = [];
  const lookup = () => {};
  const downloadService = createDownloadFileService({
    tempDir,
    httpsGet: createFakeHttpsGet(
      [
        {
          statusCode: 302,
          headers: { location: "https://example.com/files/blocked.docx" },
        },
      ],
      calls,
    ),
    createLookup: () => lookup,
    assertHostnameIsPublic: async () => {},
    validateUrl: createValidateUrlWithAllowedHosts(["store.zapier.com"]),
  });

  try {
    await assert.rejects(
      () => downloadService.downloadFile(new URL("https://store.zapier.com/files/source.docx")),
      /not allowed/,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://store.zapier.com/files/source.docx");
    assert.equal(calls[0].options.lookup, lookup);
    assert.deepEqual(await readdir(tempDir), []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("downloadFile keeps lookup pinning across redirects and aborts oversized responses", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sd-slack-redlining-"));
  const calls = [];
  const lookup = () => {};
  const downloadService = createDownloadFileService({
    tempDir,
    maxDownloadBytes: 8,
    httpsGet: createFakeHttpsGet(
      [
        {
          statusCode: 302,
          headers: { location: "https://store.zapier.com/files/redirected.docx" },
        },
        {
          statusCode: 200,
          bodyChunks: [Buffer.from("123456789")],
        },
      ],
      calls,
    ),
    createLookup: () => lookup,
    assertHostnameIsPublic: async () => {},
    validateUrl: createValidateUrlWithAllowedHosts(["store.zapier.com"]),
  });

  try {
    await assert.rejects(
      () => downloadService.downloadFile(new URL("https://store.zapier.com/files/source.docx")),
      /exceeds max size/,
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.lookup, lookup);
    assert.equal(calls[1].options.lookup, lookup);
    assert.equal(calls[1].url, "https://store.zapier.com/files/redirected.docx");
    assert.equal(calls[1].request.destroyedWith?.name, "NetworkError");
    assert.match(calls[1].request.destroyedWith?.message ?? "", /exceeds max size/);
    assert.deepEqual(await readdir(tempDir), []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
