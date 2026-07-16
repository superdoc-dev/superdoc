import { readFile } from "fs/promises";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { validateDownloadUrl } from "./security-utils.js";
import { createDownloadFileService } from "./download-file.js";
import {
  getAIResponse,
  generateUploadDownloadUrls,
  getDataFromAIResponse,
  uploadToSignedUrl,
  insertSuggestion,
  getEditor,
  getDataFromStreamedResult,
} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
// Deployed behind GCP's load balancer (see README), so the real caller IP arrives
// in X-Forwarded-For. Trust the first proxy hop so the rate limiter below keys on
// the client instead of the proxy address (which would be a single shared bucket).
app.set("trust proxy", 1);
app.use(helmet());

// Throttle the expensive document-processing route (POST "/" below) ahead of its
// body parser, so over-limit requests are rejected before the body is parsed. The
// health check stays on its own unthrottled path.
const documentRateLimit = rateLimit({ windowMs: 60_000, limit: 20 });

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const TEMP_DIR = path.resolve(__dirname, "temp");
const MAX_DOWNLOAD_BYTES = parsePositiveInteger(process.env.SLACK_REDLINING_MAX_DOWNLOAD_BYTES, 40 * 1024 * 1024);
const DOWNLOAD_TIMEOUT_MS = parsePositiveInteger(process.env.SLACK_REDLINING_DOWNLOAD_TIMEOUT_MS, 15000);
const { downloadFile, cleanupFile: cleanupDownloadedFile } = createDownloadFileService({
  tempDir: TEMP_DIR,
  maxDownloadBytes: MAX_DOWNLOAD_BYTES,
  downloadTimeoutMs: DOWNLOAD_TIMEOUT_MS,
});

// Health check endpoint
app.get("/", (req, res) => {
  res.status(200).json({ status: "OK", message: "Document processing service is running" });
});

// Main document processing endpoint
app.post("/", documentRateLimit, express.json(), async (req, res) => {
  let filePath = null;
  
  try {
    const { clauseType, fileUrl } = req.body;
    
    // Validate required fields
    if (!clauseType || !fileUrl) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: clauseType and fileUrl are required",
      });
    }

    const sourceFileUrl = validateDownloadUrl(fileUrl);

    // Download file
    filePath = await downloadFile(sourceFileUrl);
    
    // Process document
    const documentData = await readFile(filePath);
    const editor = await initializeEditor(documentData);
    
    // Generate clause content
    const clause = await generateClause(clauseType);
    
    // Find insertion position
    const xml = editor.state.doc.textContent;
    const { clauseBefore, clauseAfter, position } = await findInsertionPosition(xml, clause, editor);
    
    // Insert clause
    insertSuggestion({ editor, position, clause });
    
    // Export and upload document
    const zipBuffer = await exportDocument(editor);
    const uploadedFileName = path.basename(filePath);
    const { upload: uploadUrl, download: downloadUrl } = await generateUploadDownloadUrls(uploadedFileName);
    
    await uploadToSignedUrl(uploadUrl, Buffer.from(zipBuffer));

    // Send success response
    res.status(200).json({
      success: true,
      file: downloadUrl,
      clauseBefore,
      clause,
      clauseAfter,
    });

  } catch (error) {
    console.error("Error processing document:", error);
    
    // Send appropriate error response
    if (error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    } else if (error.name === 'NetworkError') {
      res.status(502).json({
        success: false,
        error: "Failed to download or upload file",
      });
    } else {
      res.status(500).json({
        success: false,
        error: "An unexpected error occurred while processing the document",
      });
    }
  } finally {
    // Clean up temporary file
    if (filePath) {
      await cleanupDownloadedFile(filePath);
    }
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

async function initializeEditor(documentData) {
  try {
    return await getEditor(documentData);
  } catch (error) {
    const editorError = new Error("Failed to initialize document editor");
    editorError.name = 'ValidationError';
    throw editorError;
  }
}

async function generateClause(clauseType) {
  const clausePrompt = `
    Generate a body of text without placeholders or templating based on the following clause type: ${clauseType}
    Return the generated text in a single string without any other text.
  `;
  
  try {
    const clauseResponse = await getAIResponse(clausePrompt);
    return await getDataFromStreamedResult(clauseResponse);
  } catch (error) {
    throw new Error(`Failed to generate clause for type: ${clauseType}`);
  }
}

async function findInsertionPosition(xml, clause, editor) {
  const prompt = `
    Refer to this text as "clause": ${clause}
    Find the phrase after which the clause should be inserted in this document text: "${xml}"
    
    Return your results in a JSON response like this:
    {
      "clauseBefore": "text that comes before the insertion point",
      "clauseAfter": "text that comes after the insertion point"
    }
  `;

  try {
    const AIResponse = await getAIResponse(prompt);
    return await getDataFromAIResponse({ AIResponse, editor });
  } catch (error) {
    throw new Error("Failed to determine clause insertion position");
  }
}

async function exportDocument(editor) {
  try {
    return await editor.exportDocx();
  } catch (error) {
    console.error("Error exporting document:", error);
    throw new Error("Failed to export document");
  }
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? `${fallback}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Document processing server running on ${HOST}:${PORT}`);
});

export default app;
