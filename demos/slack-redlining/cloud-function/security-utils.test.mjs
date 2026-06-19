import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublicHostnameLookup,
  isBlockedNetworkAddress,
  isBlockedNetworkHost,
  parseAllowedFileHosts,
  validateDownloadUrl,
} from "./security-utils.js";

test("validateDownloadUrl accepts an allowlisted HTTPS host", () => {
  const url = validateDownloadUrl("https://store.zapier.com/files/example.docx#fragment", {
    allowedHosts: new Set(["store.zapier.com"]),
  });

  assert.equal(url.href, "https://store.zapier.com/files/example.docx");
});

test("validateDownloadUrl rejects non-HTTPS URLs", () => {
  assert.throws(
    () =>
      validateDownloadUrl("http://store.zapier.com/files/example.docx", {
        allowedHosts: new Set(["store.zapier.com"]),
      }),
    /HTTPS/,
  );
});

test("validateDownloadUrl rejects credentialed URLs", () => {
  assert.throws(
    () =>
      validateDownloadUrl("https://user:pass@store.zapier.com/files/example.docx", {
        allowedHosts: new Set(["store.zapier.com"]),
      }),
    /credentials/,
  );
});

test("validateDownloadUrl rejects unallowlisted public hosts", () => {
  assert.throws(
    () =>
      validateDownloadUrl("https://example.com/files/example.docx", {
        allowedHosts: new Set(["store.zapier.com"]),
      }),
    /not allowed/,
  );
});

test("validateDownloadUrl rejects local and private hosts even if configured", () => {
  const blockedHosts = [
    "https://localhost/file.docx",
    "https://127.0.0.1/file.docx",
    "https://[::1]/file.docx",
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.1/file.docx",
    "https://172.16.0.1/file.docx",
    "https://192.168.0.1/file.docx",
  ];

  for (const fileUrl of blockedHosts) {
    const hostname = new URL(fileUrl).hostname;
    assert.throws(
      () => validateDownloadUrl(fileUrl, { allowedHosts: new Set([hostname]) }),
      /not allowed/,
      fileUrl,
    );
  }
});

test("parseAllowedFileHosts requires explicit configuration", () => {
  assert.throws(() => parseAllowedFileHosts(""), /must be configured/);
  assert.deepEqual(parseAllowedFileHosts(" STORE.ZAPIER.COM , files.example.com "), new Set(["store.zapier.com", "files.example.com"]));
});

test("network address blocking covers internal ranges", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.31.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "fe80::1",
    "fe90::1",
    "febf::1",
  ]) {
    assert.equal(isBlockedNetworkAddress(address), true, address);
  }

  for (const address of ["::ffff:7f00:1", "::ffff:a00:1", "::ffff:c0a8:1", "::ffff:a9fe:a9fe"]) {
    assert.equal(isBlockedNetworkAddress(address), true, address);
  }

  assert.equal(isBlockedNetworkAddress("8.8.8.8"), false);
  assert.equal(isBlockedNetworkHost("localhost"), true);
  assert.equal(isBlockedNetworkHost("store.zapier.com"), false);
});

test("public hostname lookup rejects connection-time private DNS results", async () => {
  const lookup = createPublicHostnameLookup(async () => ({ address: "169.254.169.254", family: 4 }));

  await assert.rejects(
    () =>
      new Promise((resolve, reject) => {
        lookup("store.zapier.com", {}, (error, address, family) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({ address, family });
        });
      }),
    /blocked network address/,
  );
});
