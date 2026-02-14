import { describe, it, expect } from 'vitest';
import { StaticRulePreprocessor } from '../safety/preprocessor.js';
import type { PlannedToolCall } from '@aigateway/shared';

describe('StaticRulePreprocessor', () => {
  const preprocessor = new StaticRulePreprocessor();

  describe('R001: Full traffic switch detection', () => {
    it('should detect weight=100 as high risk', () => {
      const toolCalls: PlannedToolCall[] = [{
        toolName: 'update-ai-route',
        args: { name: 'test-route', upstreams: [{ provider: 'openai', weight: 100 }] },
      }];
      const result = preprocessor.evaluate(toolCalls);
      expect(result.allowed).toBe(true);
      expect(result.riskOverride).toBe('high');
      expect(result.additionalWarnings?.some(w => w.includes('全部流量'))).toBe(true);
    });

    it('should detect weight=0 as high risk', () => {
      const toolCalls: PlannedToolCall[] = [{
        toolName: 'update-ai-route',
        args: {
          name: 'test-route',
          upstreams: [
            { provider: 'openai', weight: 0 },
            { provider: 'deepseek', weight: 100 },
          ],
        },
      }];
      const result = preprocessor.evaluate(toolCalls);
      expect(result.allowed).toBe(true);
      expect(result.riskOverride).toBe('high');
    });
  });

  describe('R002: Production route deletion', () => {
    it('should detect prod route deletion as high risk', () => {
      const toolCalls: PlannedToolCall[] = [{
        toolName: 'delete-ai-route',
        args: { name: 'prod-main-route' },
      }];
      const result = preprocessor.evaluate(toolCalls);
      expect(result.allowed).toBe(true);
      expect(result.riskOverride).toBe('high');
      expect(result.additionalWarnings?.some(w => w.includes('生产路由'))).toBe(true);
    });

    it('should not flag non-prod route deletion', () => {
      const toolCalls: PlannedToolCall[] = [{
        toolName: 'delete-ai-route',
        args: { name: 'test-route' },
      }];
      const result = preprocessor.evaluate(toolCalls);
      expect(result.riskOverride).toBeUndefined();
    });
  });

  describe('R003: API Key change detection', () => {
    it('should warn on API key change', () => {
      const toolCalls: PlannedToolCall[] = [{
        toolName: 'update-ai-provider',
        args: { name: 'openai', tokens: ['sk-new-key'] },
      }];
      const result = preprocessor.evaluate(toolCalls);
      expect(result.allowed).toBe(true);
      expect(result.additionalWarnings?.some(w => w.includes('API Key'))).toBe(true);
    });
  });

  describe('R005: Weight sum validation', () => {
    it('should block when weight sum is not 100', () => {
      const toolCalls: PlannedToolCall[] = [{
        toolName: 'add-ai-route',
        args: {
          name: 'test-route',
          upstreams: [
            { provider: 'openai', weight: 50 },
            { provider: 'deepseek', weight: 30 },
          ],
        },
      }];
      const result = preprocessor.evaluate(toolCalls);
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toContain('80');
      expect(result.blockReason).toContain('100');
    });

    it('should allow when weight sum is 100', () => {
      const toolCalls: PlannedToolCall[] = [{
        toolName: 'add-ai-route',
        args: {
          name: 'test-route',
          upstreams: [
            { provider: 'openai', weight: 70 },
            { provider: 'deepseek', weight: 30 },
          ],
        },
      }];
      const result = preprocessor.evaluate(toolCalls);
      expect(result.allowed).toBe(true);
    });
  });

  describe('R007: Batch operations detection', () => {
    it('should warn on 3+ write operations', () => {
      const toolCalls: PlannedToolCall[] = [
        { toolName: 'add-ai-provider', args: { name: 'p1', type: 'openai', tokens: ['sk-1'] } },
        { toolName: 'add-ai-provider', args: { name: 'p2', type: 'deepseek', tokens: ['sk-2'] } },
        { toolName: 'add-ai-route', args: { name: 'route', upstreams: [{ provider: 'p1', weight: 50 }, { provider: 'p2', weight: 50 }] } },
      ];
      const result = preprocessor.evaluate(toolCalls);
      expect(result.allowed).toBe(true);
      expect(result.additionalWarnings?.some(w => w.includes('批量操作'))).toBe(true);
    });
  });

  describe('Read-only operations', () => {
    it('should not trigger any rules for read operations', () => {
      const toolCalls: PlannedToolCall[] = [
        { toolName: 'list-ai-providers', args: {} },
      ];
      const result = preprocessor.evaluate(toolCalls);
      expect(result.allowed).toBe(true);
      expect(result.riskOverride).toBeUndefined();
      expect(result.additionalWarnings).toBeUndefined();
    });
  });
});
