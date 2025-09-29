import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { AIResponse } from './types';

const gemini = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface AnalysisRequest {
  prompt: string;
  screenshots: string[]; // https urls or s3 signed GET urls the model can fetch
  provider: 'gemini' | 'openai';
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's a rate limit error
      const isRateLimit =
        error?.status === 429 ||
        error?.message?.toLowerCase().includes('rate') ||
        error?.message?.toLowerCase().includes('quota') ||
        error?.error?.code === 'rate_limit_exceeded';

      if (!isRateLimit || attempt === maxAttempts) {
        throw error;
      }

      // Calculate exponential backoff with jitter
      const baseDelay = initialDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * baseDelay * 0.1; // 10% jitter
      const delay = Math.min(baseDelay + jitter, 60000); // Max 60 seconds

      // Rate limited, retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function runAI(
  req: AnalysisRequest,
  signal?: AbortSignal
): Promise<{ model: string; raw: string; parsed: AIResponse }> {
  if (req.provider === 'gemini') {
    return withRetry(async () => {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash-exp' }); // adjust if you need Pro
      const parts: any[] = [{ text: req.prompt }];
      for (const url of req.screenshots)
        parts.push({ fileData: { fileUri: url, mimeType: 'image/png' } });

      const res = await model.generateContent({ contents: [{ role: 'user', parts }] });
      const text = res.response.text();
      const parsed = safeParseJson(text);
      return { model: 'gemini-2.0-flash-exp', raw: text, parsed };
    });
  } else {
    return withRetry(async () => {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: req.prompt },
            ...req.screenshots.map(u => ({ type: 'image_url' as const, image_url: { url: u } })),
          ],
        },
      ];
      const resp = await openai.chat.completions.create(
        {
          model: 'gpt-4-vision-preview',
          messages,
          response_format: { type: 'json_object' },
          max_tokens: 1800,
        },
        { signal }
      );
      const raw = resp.choices[0]?.message?.content || '{}';
      const parsed = safeParseJson(raw);
      return { model: 'gpt-4-vision-preview', raw, parsed };
    });
  }
}

function safeParseJson(text: string): AIResponse {
  try {
    const o = JSON.parse(text);
    return o as AIResponse;
  } catch {
    return {
      compliance_status: 'unclear',
      confidence: 'low',
      reasoning: 'Unable to parse model response as JSON.',
    };
  }
}
