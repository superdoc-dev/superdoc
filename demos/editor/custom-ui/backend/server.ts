import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize OpenAI client lazily to avoid startup errors
// Set OPENAI_API_KEY environment variable before running
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// AI text replacement endpoint
app.post('/api/ai-replace', async (req, res) => {
  try {
    const { selectedText, prompt } = req.body;

    if (!selectedText || !prompt) {
      return res.status(400).json({
        error: 'Missing required fields: selectedText and prompt',
      });
    }

    const client = getOpenAI();

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a text transformation assistant. The user will provide text and instructions on how to modify it. Return ONLY the modified text, nothing else. No explanations, no quotes, no markdown formatting - just the transformed text itself.',
        },
        {
          role: 'user',
          content: `Text to transform:\n"${selectedText}"\n\nInstructions: ${prompt}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const replacementText = completion.choices[0]?.message?.content?.trim();

    if (!replacementText) {
      return res.status(500).json({
        error: 'No response from OpenAI',
      });
    }

    res.json({ text: replacementText });
  } catch (error) {
    console.error('OpenAI API error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process AI request',
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`AI backend server running on http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  Warning: OPENAI_API_KEY not set. API calls will fail.');
  }
});
