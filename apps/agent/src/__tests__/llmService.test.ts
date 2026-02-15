import { describe, it, expect, beforeEach } from 'vitest';
import { LLMService } from '../llm/llmService.js';

describe('LLMService', () => {
  let service: LLMService;

  beforeEach(() => {
    // Reset env for each test
    process.env['LLM_PROVIDER'] = 'qwen';
    process.env['LLM_API_KEY'] = '';
    process.env['LLM_BASE_URL'] = '';
    process.env['LLM_MODEL'] = 'qwen-plus';
    service = new LLMService();
  });

  describe('initialization', () => {
    it('should initialize with correct provider and model from env', () => {
      const config = service.getConfig();
      expect(config.provider).toBe('qwen');
      expect(config.model).toBe('qwen-plus');
    });

    it('should use default baseURL for known providers', () => {
      const config = service.getConfig();
      expect(config.baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    });

    it('should default to openai provider when env is empty', () => {
      process.env['LLM_PROVIDER'] = '';
      const s = new LLMService();
      const config = s.getConfig();
      expect(config.provider).toBe('openai');
      expect(config.baseURL).toContain('openai');
    });
  });

  describe('isAvailable', () => {
    it('should return false when API key is empty', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should return false for mock keys', () => {
      process.env['LLM_API_KEY'] = 'sk-mock-key-for-dev';
      const s = new LLMService();
      expect(s.isAvailable()).toBe(false);
    });

    it('should return false for test keys', () => {
      process.env['LLM_API_KEY'] = 'test-key-12345';
      const s = new LLMService();
      expect(s.isAvailable()).toBe(false);
    });

    it('should return true for real-looking keys', () => {
      process.env['LLM_API_KEY'] = 'sk-abcdef1234567890abcdef1234567890';
      const s = new LLMService();
      expect(s.isAvailable()).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return correct structure', () => {
      const config = service.getConfig();
      expect(config).toHaveProperty('provider');
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('available');
      expect(config).toHaveProperty('baseURL');
      expect(typeof config.available).toBe('boolean');
    });
  });

  describe('updateConfig', () => {
    it('should update provider and auto-resolve baseURL', () => {
      service.updateConfig({ provider: 'deepseek' });
      const config = service.getConfig();
      expect(config.provider).toBe('deepseek');
      expect(config.baseURL).toBe('https://api.deepseek.com/v1');
    });

    it('should update apiKey and reflect in isAvailable', () => {
      expect(service.isAvailable()).toBe(false);
      service.updateConfig({ apiKey: 'sk-real-production-key-123456' });
      expect(service.isAvailable()).toBe(true);
    });

    it('should update model', () => {
      service.updateConfig({ model: 'gpt-4o' });
      expect(service.getConfig().model).toBe('gpt-4o');
    });

    it('should allow explicit baseURL override', () => {
      service.updateConfig({ provider: 'openai', baseURL: 'https://custom-proxy.example.com/v1' });
      expect(service.getConfig().baseURL).toBe('https://custom-proxy.example.com/v1');
    });
  });
});
