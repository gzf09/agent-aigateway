import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  zhipuai: 'https://open.bigmodel.cn/api/paas/v4',
};

const MOCK_KEY_PATTERNS = [/^sk-mock/, /^mock-/, /^test-/, /^fake-/];

interface LLMConfig {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

export class LLMService {
  private config: LLMConfig;

  constructor() {
    const provider = process.env['LLM_PROVIDER'] || 'openai';
    const apiKey = process.env['LLM_API_KEY'] || '';
    const baseURL = process.env['LLM_BASE_URL'] || PROVIDER_BASE_URLS[provider] || PROVIDER_BASE_URLS['openai']!;
    const model = process.env['LLM_MODEL'] || 'gpt-4o';

    this.config = { provider, apiKey, baseURL, model };
  }

  isAvailable(): boolean {
    if (!this.config.apiKey) return false;
    return !MOCK_KEY_PATTERNS.some(p => p.test(this.config.apiKey));
  }

  getConfig(): { provider: string; model: string; available: boolean; baseURL: string } {
    return {
      provider: this.config.provider,
      model: this.config.model,
      available: this.isAvailable(),
      baseURL: this.config.baseURL,
    };
  }

  updateConfig(update: Partial<LLMConfig>): void {
    if (update.provider !== undefined) {
      this.config.provider = update.provider;
      // Update baseURL to match new provider if not explicitly set
      if (!update.baseURL) {
        this.config.baseURL = PROVIDER_BASE_URLS[update.provider] || this.config.baseURL;
      }
    }
    if (update.apiKey !== undefined) this.config.apiKey = update.apiKey;
    if (update.baseURL !== undefined) this.config.baseURL = update.baseURL;
    if (update.model !== undefined) this.config.model = update.model;
  }

  async chat(systemPrompt: string, messages: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('LLM service is not available: missing or invalid API key');
    }

    const openai = createOpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });

    const result = await generateText({
      model: openai(this.config.model),
      system: systemPrompt,
      messages,
    });

    return result.text;
  }
}
