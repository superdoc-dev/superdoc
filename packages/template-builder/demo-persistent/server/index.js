import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use volume path in production, local path in development
const DOCUMENTS_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'documents')
  : join(__dirname, '..', 'documents');
const DOCUMENT_PATH = join(DOCUMENTS_DIR, 'current.docx');

// Ensure documents directory exists
if (!existsSync(DOCUMENTS_DIR)) {
  mkdirSync(DOCUMENTS_DIR, { recursive: true });
}

const app = express();
app.use(cors());

// Serve static files in production
const DIST_DIR = join(__dirname, '..', 'dist');
console.log(`Checking for dist folder at: ${DIST_DIR}`);
console.log(`Dist folder exists: ${existsSync(DIST_DIR)}`);
if (existsSync(DIST_DIR)) {
  console.log('Serving static files from dist');
  app.use(express.static(DIST_DIR));
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOCUMENTS_DIR),
  filename: (_req, _file, cb) => cb(null, 'current.docx'),
});
const upload = multer({ storage });

// Check if a document exists
app.get('/api/document/exists', (_req, res) => {
  res.json({ exists: existsSync(DOCUMENT_PATH) });
});

// Get the current document
app.get('/api/document', (_req, res) => {
  if (!existsSync(DOCUMENT_PATH)) {
    return res.status(404).json({ error: 'No document found' });
  }
  res.sendFile(DOCUMENT_PATH);
});

// Upload/save a document
app.post('/api/document', upload.single('document'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  console.log(`Document saved: ${req.file.originalname} -> ${DOCUMENT_PATH}`);
  res.json({ success: true, path: DOCUMENT_PATH });
});

// Delete the current document
app.delete('/api/document', (_req, res) => {
  if (existsSync(DOCUMENT_PATH)) {
    unlinkSync(DOCUMENT_PATH);
    console.log(`Document deleted: ${DOCUMENT_PATH}`);
  }
  res.json({ success: true });
});

// SPA fallback - serve index.html for non-API routes
if (existsSync(DIST_DIR)) {
  app.get('*', (_req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Documents stored in: ${DOCUMENTS_DIR}`);
});
