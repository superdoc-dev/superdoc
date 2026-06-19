import fs from "fs";
import { rm } from "fs/promises";
import { randomUUID } from "crypto";
import https from "https";
import path from "path";
import {
  assertDownloadHostnameIsPublic,
  createNetworkError,
  createPublicHostnameLookup,
  createValidationError,
  validateDownloadUrl,
} from "./security-utils.js";

export function createDownloadFileService({
  tempDir = path.resolve(process.cwd(), "temp"),
  maxDownloadBytes = 40 * 1024 * 1024,
  downloadTimeoutMs = 15000,
  httpsGet = https.get,
  createLookup = createPublicHostnameLookup,
  assertHostnameIsPublic = assertDownloadHostnameIsPublic,
  validateUrl = validateDownloadUrl,
  createNetworkErr = createNetworkError,
  createValidationErr = createValidationError,
} = {}) {
  const publicHostnameLookup = createLookup();

  async function cleanupFile(filePath) {
    try {
      assertPathInsideRoot(tempDir, filePath, createValidationErr);
      await rm(filePath, { force: true });
    } catch (error) {
      console.warn(`Failed to cleanup temporary file: ${filePath}`, error);
    }
  }

  async function downloadFile(downloadUrl, redirectCount = 0) {
    await assertHostnameIsPublic(downloadUrl);

    const filePath = createTempFilePath(tempDir, createValidationErr);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

    return new Promise((resolve, reject) => {
      let settled = false;
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(filePath);

      const cleanup = async () => {
        fileStream.destroy();
        await cleanupFile(filePath);
      };

      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        cleanup().finally(() => reject(error));
      };

      const resolveOnce = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const request = httpsGet(downloadUrl, { lookup: publicHostnameLookup }, (response) => {
        const statusCode = response.statusCode || 0;

        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume();
          cleanup()
            .then(() => {
              if (redirectCount >= 3) {
                throw createNetworkErr("Download failed: too many redirects");
              }
              const redirectUrl = validateUrl(new URL(response.headers.location, downloadUrl).href);
              return downloadFile(redirectUrl, redirectCount + 1);
            })
            .then(resolveOnce, rejectOnce);
          return;
        }

        if (statusCode !== 200) {
          response.resume();
          rejectOnce(createNetworkErr(`Download failed with status: ${statusCode}`));
          return;
        }

        response.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > maxDownloadBytes) {
            request.destroy(createNetworkErr(`Download exceeds max size: ${maxDownloadBytes} bytes`));
          }
        });

        response.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          resolveOnce(filePath);
        });
      });

      request.setTimeout(downloadTimeoutMs, () => {
        request.destroy(createNetworkErr("Download timed out"));
      });

      request.on("error", (error) => {
        rejectOnce(error.name === "NetworkError" ? error : createNetworkErr(`Network error: ${error.message}`));
      });

      fileStream.on("error", (error) => {
        rejectOnce(error);
      });
    });
  }

  return { downloadFile, cleanupFile };
}

function createTempFilePath(tempDir, createValidationErr) {
  const filePath = path.join(tempDir, `${randomUUID()}.docx`);
  assertPathInsideRoot(tempDir, filePath, createValidationErr);
  return filePath;
}

function assertPathInsideRoot(root, target, createValidationErr) {
  const relativePath = path.relative(path.resolve(root), path.resolve(target));
  if (relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
    return;
  }

  throw createValidationErr("Invalid temporary file path");
}
