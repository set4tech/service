// AI Provider and Model Configuration
export const AI_PROVIDERS = {
  GEMINI: 'gemini',
  OPENAI: 'openai',
} as const;

export const AI_MODELS = {
  // Gemini models
  GEMINI_FLASH_EXP: 'gemini-2.0-flash-exp',
  GEMINI_PRO: 'gemini-1.5-pro',
  GEMINI_FLASH: 'gemini-1.5-flash',

  // OpenAI models
  GPT4_VISION: 'gpt-4-vision-preview',
  GPT4_TURBO: 'gpt-4-turbo-preview',
  GPT4O: 'gpt-4o',
  GPT35_TURBO: 'gpt-3.5-turbo',
} as const;

// Default models for each provider
export const DEFAULT_MODELS = {
  [AI_PROVIDERS.GEMINI]: AI_MODELS.GEMINI_FLASH_EXP,
  [AI_PROVIDERS.OPENAI]: AI_MODELS.GPT4_VISION,
} as const;

// Model capabilities
export const MODEL_CAPABILITIES = {
  [AI_MODELS.GEMINI_FLASH_EXP]: { vision: true, maxTokens: 8192 },
  [AI_MODELS.GEMINI_PRO]: { vision: true, maxTokens: 32768 },
  [AI_MODELS.GEMINI_FLASH]: { vision: true, maxTokens: 8192 },
  [AI_MODELS.GPT4_VISION]: { vision: true, maxTokens: 4096 },
  [AI_MODELS.GPT4_TURBO]: { vision: false, maxTokens: 4096 },
  [AI_MODELS.GPT4O]: { vision: true, maxTokens: 4096 },
  [AI_MODELS.GPT35_TURBO]: { vision: false, maxTokens: 4096 },
} as const;

export type AIProvider = typeof AI_PROVIDERS[keyof typeof AI_PROVIDERS];
export type AIModel = typeof AI_MODELS[keyof typeof AI_MODELS];