/**
 * Vision OCR using LLMs (Gemini 2.0 Flash or GPT-4o-mini)
 * Extracts text from screenshot images for searchability and AI analysis
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

interface OcrResult {
  text: string;
  provider: 'gemini' | 'openai';
  error?: string;
}

/**
 * Extract text from an image using vision-capable LLMs
 * @param imageUrl - S3 URL or data URL of the image
 * @param imageData - Optional base64 image data (if not using URL)
 * @returns Extracted text
 */
export async function extractTextFromImage(
  imageUrl?: string,
  imageData?: string
): Promise<OcrResult> {
  // Feature flag check
  if (process.env.ENABLE_SCREENSHOT_OCR !== 'true') {
    console.log('[OCR] Feature disabled via ENABLE_SCREENSHOT_OCR env var');
    return { text: '', provider: 'gemini', error: 'Feature disabled' };
  }

  // Try Gemini first (faster and cheaper)
  if (process.env.GOOGLE_API_KEY) {
    try {
      const result = await extractWithGemini(imageUrl, imageData);
      return { text: result, provider: 'gemini' };
    } catch (error) {
      console.error('[OCR] Gemini failed:', error);
      // Fall through to OpenAI if Gemini fails
    }
  }

  // Fallback to OpenAI GPT-4o-mini
  if (process.env.OPENAI_API_KEY) {
    try {
      const result = await extractWithOpenAI(imageUrl, imageData);
      return { text: result, provider: 'openai' };
    } catch (error) {
      console.error('[OCR] OpenAI failed:', error);
      return { text: '', provider: 'openai', error: String(error) };
    }
  }

  console.error('[OCR] No API keys configured for vision OCR');
  return { text: '', provider: 'gemini', error: 'No API keys configured' };
}

/**
 * Extract text using Google Gemini 2.0 Flash
 */
async function extractWithGemini(imageUrl?: string, imageData?: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const prompt = `Extract all visible text from this architectural drawing or screenshot.
Include:
- Room labels and dimensions
- Notes and annotations (including handwritten)
- Code section references
- Any other visible text

Return only the extracted text, organized logically. If there's no text, return an empty response.`;

  let imagePart;
  if (imageData) {
    // Use provided base64 data
    const base64Data = imageData.includes('base64,') ? imageData.split('base64,')[1] : imageData;
    imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: 'image/png',
      },
    };
  } else if (imageUrl) {
    // Fetch image from URL
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    imagePart = {
      inlineData: {
        data: base64,
        mimeType: 'image/png',
      },
    };
  } else {
    throw new Error('Either imageUrl or imageData must be provided');
  }

  const result = await model.generateContent([prompt, imagePart]);
  const text = result.response.text();

  console.log('[OCR] Gemini extracted:', text.length, 'characters');
  return text.trim();
}

/**
 * Extract text using OpenAI GPT-4o-mini
 */
async function extractWithOpenAI(imageUrl?: string, imageData?: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `Extract all visible text from this architectural drawing or screenshot.
Include:
- Room labels and dimensions
- Notes and annotations (including handwritten)
- Code section references
- Any other visible text

Return only the extracted text, organized logically. If there's no text, return an empty response.`;

  let imageContent: string;
  if (imageData) {
    // Use provided data URL
    imageContent = imageData.startsWith('data:') ? imageData : `data:image/png;base64,${imageData}`;
  } else if (imageUrl) {
    imageContent = imageUrl;
  } else {
    throw new Error('Either imageUrl or imageData must be provided');
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageContent } },
        ],
      },
    ],
    max_tokens: 1000,
  });

  const text = response.choices[0]?.message?.content || '';
  console.log('[OCR] OpenAI extracted:', text.length, 'characters');
  return text.trim();
}
