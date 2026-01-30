import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const SUPERDOC_SERVICES_API_KEY = process.env.SUPERDOC_SERVICES_API_KEY;
const SUPERDOC_SERVICES_BASE_URL =
  process.env.SUPERDOC_SERVICES_BASE_URL || 'https://api.superdoc.dev';
const CONSENT_FIELD_IDS = new Set(['consent_agreement', 'terms', 'email', '406948812']);
const SIGNATURE_FIELD_ID = '789012';
const IP_ADDRESS = '127.0.0.1'; // Replace with real client IP once available
const DEMO_USER = {
  name: 'Demo User',
  email: 'demo@superdoc.dev',
  userAgent: 'demo-user-agent',
};

app.use(
  cors({
    origin: 'https://esign.superdoc.dev',
  }),
);
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const normalizeFields = (fieldsPayload = {}, signatureMode = 'annotate') => {
  const documentFields = Array.isArray(fieldsPayload.document) ? fieldsPayload.document : [];
  const signerFields = Array.isArray(fieldsPayload.signer) ? fieldsPayload.signer : [];

  return [...documentFields, ...signerFields]
    .filter((field) => field?.id && !CONSENT_FIELD_IDS.has(field.id))
    .map((field) => {
      const isSignatureField = field.id === SIGNATURE_FIELD_ID;
      const value = field.value ?? '';
      const signatureType = signatureMode === 'sign' ? 'signature' : 'image';
      const type = isSignatureField ? signatureType : 'text';

      const normalized = { id: field.id, value, type };
      if (type === 'signature') {
        normalized.options = {
          bottomLabel: { text: `ip: ${IP_ADDRESS}`, color: '#666' },
        };
      }
      return normalized;
    });
};

const annotateDocument = async ({ documentUrl, fields }) => {
  const response = await fetch(`${SUPERDOC_SERVICES_BASE_URL}/v1/annotate?to=pdf`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPERDOC_SERVICES_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      document: { url: documentUrl },
      fields: fields || [],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to annotate document');
  }

  const data = await response.json();
  return {
    base64: data?.document?.base64,
    contentType: data?.document?.contentType || 'application/pdf',
  };
};

const sendPdfBuffer = (res, base64, fileName, contentType = 'application/pdf') => {
  const buffer = Buffer.from(base64, 'base64');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(buffer);
};

app.post('/v1/download', async (req, res) => {
  try {
    const { document, fields = {}, fileName = 'document.pdf', signatureMode = 'annotate' } =
      req.body || {};

    if (!SUPERDOC_SERVICES_API_KEY) {
      return res.status(500).json({ error: 'Missing SUPERDOC_SERVICES_API_KEY on the server' });
    }

    if (!document?.url) {
      return res.status(400).json({ error: 'document.url is required' });
    }

    const annotatedFields = normalizeFields(fields, signatureMode);

    const { base64, contentType } = await annotateDocument({
      documentUrl: document.url,
      fields: annotatedFields,
    });

    if (!base64) {
      return res.status(502).json({
        error: 'Annotate response missing PDF content',
      });
    }

    sendPdfBuffer(res, base64, fileName || 'document.pdf', contentType);
  } catch (error) {
    console.error('Error processing download:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

app.post('/v1/sign', async (req, res) => {
  try {
    const {
      document,
      documentFields = [],
      signerFields = [],
      auditTrail = [],
      eventId,
      certificate,
      metadata,
      fileName = 'signed-document.pdf',
      signatureMode = 'sign',
    } = req.body || {};

    if (!SUPERDOC_SERVICES_API_KEY) {
      return res.status(500).json({ error: 'Missing SUPERDOC_SERVICES_API_KEY on the server' });
    }

    if (!document?.url) {
      return res.status(400).json({ error: 'document.url is required' });
    }

    const annotatedFields = normalizeFields(
      {
        document: documentFields,
        signer: signerFields,
      },
      signatureMode,
    );

    const { base64: annotatedBase64 } = await annotateDocument({
      documentUrl: document.url,
      fields: annotatedFields,
    });

    if (!annotatedBase64) {
      return res.status(502).json({
        error: 'Annotate response missing document content',
      });
    }

    const signPayload = {
      eventId,
      document: { base64: annotatedBase64 },
      auditTrail,
      signer: {
        name: DEMO_USER.name,
        email: DEMO_USER.email,
        ip: IP_ADDRESS,
        userAgent: DEMO_USER.userAgent,
      },
      certificate,
      metadata,
    };

    const signResponse = await fetch(`${SUPERDOC_SERVICES_BASE_URL}/v1/sign`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPERDOC_SERVICES_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(signPayload),
    });

    if (!signResponse.ok) {
      const error = await signResponse.text();
      console.error('SuperDoc sign error:', error);
      return res.status(signResponse.status).json({
        error: 'Failed to sign document',
        details: error,
      });
    }

    const signData = await signResponse.json();
    const signedBase64 = signData?.document?.base64;
    const contentType = signData?.document?.contentType || 'application/pdf';

    if (!signedBase64) {
      return res.status(502).json({
        error: 'Sign response missing document content',
      });
    }

    sendPdfBuffer(res, signedBase64, fileName, contentType);
  } catch (error) {
    console.error('Error signing document:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
