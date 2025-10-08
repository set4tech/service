# Screenshot OCR Feature

## Overview

Automatically extracts text from screenshot images using vision-capable LLMs (Gemini 2.0 Flash or GPT-4o-mini). The extracted text is stored in the `screenshots.extracted_text` column and indexed for full-text search.

## How It Works

1. **Screenshot Capture**: User captures a screenshot in the PDF viewer
2. **Upload to S3**: Screenshot is uploaded to S3 with a presigned URL
3. **Database Insert**: Screenshot metadata is saved to `screenshots` table
4. **Background OCR** (if enabled): An async request is made to `/api/screenshots/[id]/extract-text`
5. **Vision API Call**: Image is downloaded from S3 and sent to Gemini or OpenAI
6. **Text Extraction**: LLM extracts all visible text including handwritten notes
7. **Database Update**: Extracted text is saved to `screenshots.extracted_text`
8. **Full-Text Search**: Text is automatically indexed by PostgreSQL GIN index

## Configuration

### Environment Variables

```bash
# Enable/disable OCR feature (default: false)
export ENABLE_SCREENSHOT_OCR=true

# Google Gemini API key (primary OCR provider)
export GOOGLE_API_KEY=your_google_api_key

# OpenAI API key (fallback OCR provider)
export OPENAI_API_KEY=your_openai_api_key

# App URL for internal API calls
export NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Feature Flag

The OCR feature is controlled by the `ENABLE_SCREENSHOT_OCR` environment variable:

- `true`: OCR runs automatically for all new screenshots
- `false` or unset: OCR is disabled

## API Endpoints

### POST /api/screenshots/[id]/extract-text

Manually trigger OCR extraction for a screenshot.

**Request:**

```bash
curl -X POST http://localhost:3000/api/screenshots/<screenshot-id>/extract-text
```

**Response:**

```json
{
  "message": "Text extracted successfully",
  "text": "Extracted text content...",
  "provider": "gemini",
  "length": 245
}
```

## LLM Providers

### Primary: Gemini 2.0 Flash

- **Model**: `gemini-2.0-flash-exp`
- **Cost**: ~$0.075 per 1K images
- **Speed**: ~1-2 seconds per screenshot
- **Accuracy**: Excellent for architectural drawings

### Fallback: OpenAI GPT-4o-mini

- **Model**: `gpt-4o-mini`
- **Cost**: ~$0.15 per 1K images
- **Speed**: ~1-3 seconds per screenshot
- **Accuracy**: Very good for general OCR

The system tries Gemini first, then falls back to OpenAI if Gemini fails or is not configured.

## Database Schema

```sql
-- screenshots table
CREATE TABLE screenshots (
  id UUID PRIMARY KEY,
  screenshot_url TEXT NOT NULL,
  extracted_text TEXT,  -- <-- OCR results stored here
  ...
);

-- Full-text search index (already exists)
CREATE INDEX idx_screenshots_text_search ON screenshots
USING gin(to_tsvector('english',
  COALESCE(caption, '') || ' ' || COALESCE(extracted_text, '')
));
```

## What Gets Extracted

The OCR prompt instructs the LLM to extract:

- ✅ Room labels and dimensions
- ✅ Notes and annotations (including handwritten)
- ✅ Code section references
- ✅ Measurement callouts
- ✅ Legend and key information
- ✅ Any other visible text

## Benefits

1. **Better Search**: Search screenshots by text content, not just captions
2. **Handwritten Notes**: Captures hand-written annotations on drawings
3. **Scanned Documents**: Works with scanned PDFs and photos
4. **AI Context**: Provides more context for AI compliance analysis
5. **Non-Blocking**: Runs asynchronously, doesn't slow down workflow

## Cost Estimate

For a typical project with 100 screenshots:

- **Gemini 2.0 Flash**: $0.0075 (less than a penny!)
- **GPT-4o-mini**: $0.015 (1.5 cents)

Very affordable for the value it provides.

## Monitoring

Check logs for OCR activity:

```bash
# Successful extraction
[OCR] Starting text extraction for screenshot: abc-123
[OCR] Calling vision OCR...
[OCR] Gemini extracted: 245 characters
[OCR] Successfully extracted and saved text: 245 characters

# Feature disabled
[OCR] Feature disabled via ENABLE_SCREENSHOT_OCR env var

# Error handling
[OCR] Vision OCR failed: API rate limit exceeded
```

## Limitations

- Requires valid API keys for Gemini or OpenAI
- Processing takes 1-3 seconds per screenshot (async)
- Does not process existing screenshots (only new ones)
- Skips screenshots that already have `extracted_text`

## Manual Re-processing

To re-process an existing screenshot:

```bash
# Clear extracted text first
psql -c "UPDATE screenshots SET extracted_text = NULL WHERE id = 'screenshot-id'"

# Trigger OCR
curl -X POST http://localhost:3000/api/screenshots/screenshot-id/extract-text
```

## Future Enhancements

- [ ] Bulk re-processing endpoint for existing screenshots
- [ ] OCR confidence scores
- [ ] Language detection
- [ ] Custom prompts per screenshot type
- [ ] UI indicator for OCR processing status
- [ ] Display extracted text in screenshot modal
