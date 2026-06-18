import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { handleRequest } from "./server.js";

test("word baseline sidecar returns 404 for the removed local-path endpoint", async () => {
  const response = await invokeHandler({
    method: "POST",
    url: "/api/word-baseline/from-path",
    body: JSON.stringify({ localPath: "/tmp/example.docx" }),
  });

  assert.equal(response.statusCode, 404);
});

test("word baseline sidecar still handles the base64 endpoint", async () => {
  const response = await invokeHandler({
    method: "POST",
    url: "/api/word-baseline",
    body: JSON.stringify({ fileName: "example.docx" }),
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 400);
  assert.equal(payload.error, "docxBase64 is required");
});

function invokeHandler({ method, url, body = "" }) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.url = url;
  req.headers = {
    host: "127.0.0.1:9185",
    "content-type": "application/json",
  };

  return new Promise((resolve, reject) => {
    const headers = {};
    const chunks = [];
    const res = {
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
      writeHead(statusCode, nextHeaders = {}) {
        this.statusCode = statusCode;
        for (const [name, value] of Object.entries(nextHeaders)) {
          this.setHeader(name, value);
        }
      },
      end(chunk = "") {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        resolve({
          statusCode: this.statusCode,
          headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      },
    };

    Promise.resolve(handleRequest(req, res)).catch(reject);
  });
}
