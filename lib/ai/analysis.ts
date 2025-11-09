import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AIResponse } from './types';

// Lazy initialization to avoid build-time errors when env vars are not available
let geminiInstance: GoogleGenerativeAI | null = null;
let openaiInstance: OpenAI | null = null;
let anthropicInstance: Anthropic | null = null;

function getGemini(): GoogleGenerativeAI {
  if (!geminiInstance) {
    geminiInstance = new GoogleGenerativeAI(
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
    );
  }
  return geminiInstance;
}

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiInstance;
}

function getAnthropic(): Anthropic {
  if (!anthropicInstance) {
    anthropicInstance = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicInstance;
}

export interface AnalysisRequest {
  prompt: string;
  screenshots: string[]; // https urls or s3 signed GET urls the model can fetch
  provider: 'gemini' | 'openai' | 'anthropic';
  model?: string; // specific model to use (e.g., 'gemini-2.5-pro', 'gpt-4o', 'claude-opus-4-20250514')
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
      const modelName = req.model || 'gemini-2.5-pro';
      const model = getGemini().getGenerativeModel({ model: modelName });
      const parts: any[] = [{ text: req.prompt }];

      // Convert screenshots to base64 inline data
      for (const url of req.screenshots) {
        const response = await fetch(url);

        if (!response.ok) {
          console.error(
            `[Analysis] Failed to fetch screenshot: ${response.status} ${response.statusText}`
          );
          continue; // Skip this screenshot
        }

        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        let mimeType = response.headers.get('content-type') || 'image/png';

        // Fix incorrect MIME types from S3
        if (mimeType === 'application/xml' || mimeType === 'text/xml') {
          console.warn(
            `[Analysis] Got XML MIME type from S3, likely an error response. Defaulting to image/png`
          );
          mimeType = 'image/png';
        }

        // Ensure it's a valid image MIME type
        if (!mimeType.startsWith('image/')) {
          console.warn(`[Analysis] Non-image MIME type: ${mimeType}, defaulting to image/png`);
          mimeType = 'image/png';
        }

        console.log(`[Analysis] Screenshot MIME type: ${mimeType}`);

        parts.push({
          inlineData: {
            mimeType,
            data: base64,
          },
        });
      }

      const res = await model.generateContent({ contents: [{ role: 'user', parts }] });
      const text = res.response.text();
      const parsed = safeParseJson(text);
      return { model: modelName, raw: text, parsed };
    });
  } else if (req.provider === 'anthropic') {
    return withRetry(async () => {
      const modelName = req.model || 'claude-opus-4-20250514';

      // Convert screenshots to base64 content blocks
      const imageBlocks = await Promise.all(
        req.screenshots.map(async url => {
          const response = await fetch(url);
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mediaType = response.headers.get('content-type') || 'image/png';

          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64,
            },
          };
        })
      );

      const content: Anthropic.MessageParam['content'] = [
        { type: 'text', text: req.prompt },
        ...imageBlocks,
      ];

      const resp = await getAnthropic().messages.create({
        model: modelName,
        max_tokens: 4096,
        messages: [{ role: 'user', content }],
      });

      const textBlock = resp.content.find(block => block.type === 'text');
      const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '{}';
      const parsed = safeParseJson(raw);
      return { model: modelName, raw, parsed };
    });
  } else {
    return withRetry(async () => {
      const modelName = req.model || 'gpt-4o';
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: req.prompt },
            ...req.screenshots.map(u => ({ type: 'image_url' as const, image_url: { url: u } })),
          ],
        },
      ];
      const resp = await getOpenAI().chat.completions.create(
        {
          model: modelName,
          messages,
          response_format: { type: 'json_object' },
          max_tokens: 4096,
        },
        { signal }
      );
      const raw = resp.choices[0]?.message?.content || '{}';
      const parsed = safeParseJson(raw);
      return { model: modelName, raw, parsed };
    });
  }
}

function safeParseJson(text: string): AIResponse {
  try {
    // Remove markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const o = JSON.parse(cleaned);
    return o as AIResponse;
  } catch (err) {
    return {
      compliance_status: 'unclear',
      confidence: 'low',
      reasoning: `Unable to parse model response as JSON. ${err instanceof Error ? err.message : ''}`,
    };
  }
}
