import { describe, it, expect, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../engine/orchestrator.js';
import { MockMCPClient, mockProviders, mockRoutes } from '@aigateway/mcp-client';
import type { AgentResponseChunk } from '@aigateway/shared';

async function collectChunks(gen: AsyncGenerator<AgentResponseChunk>): Promise<AgentResponseChunk[]> {
  const chunks: AgentResponseChunk[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  const sessionId = 'test-session';

  beforeEach(() => {
    mockProviders.clear();
    mockRoutes.clear();
    const mcpClient = new MockMCPClient();
    orchestrator = new AgentOrchestrator(mcpClient);
  });

  describe('Intent recognition', () => {
    it('should recognize "列出所有提供商" as list providers', async () => {
      const chunks = await collectChunks(orchestrator.processMessage(sessionId, '列出所有提供商'));
      const textChunks = chunks.filter(c => c.type === 'text');
      expect(textChunks.length).toBeGreaterThan(0);
      // Should contain provider list text
      const text = textChunks.map(c => (c as { content: string }).content).join('');
      expect(text).toContain('提供商');
    });

    it('should recognize "列出所有路由" as list routes', async () => {
      const chunks = await collectChunks(orchestrator.processMessage(sessionId, '列出所有路由'));
      const textChunks = chunks.filter(c => c.type === 'text');
      expect(textChunks.length).toBeGreaterThan(0);
      const text = textChunks.map(c => (c as { content: string }).content).join('');
      expect(text).toContain('路由');
    });

    it('should recognize provider creation with key and show confirm card', async () => {
      const chunks = await collectChunks(
        orchestrator.processMessage(sessionId, '配置 OpenAI 接入，Key 是 sk-test12345')
      );
      const confirmCards = chunks.filter(c => c.type === 'confirm_card');
      expect(confirmCards).toHaveLength(1);
    });

    it('should recognize route creation and show confirm card', async () => {
      const chunks = await collectChunks(
        orchestrator.processMessage(sessionId, '创建 AI 路由，70% OpenAI 30% DeepSeek')
      );
      const confirmCards = chunks.filter(c => c.type === 'confirm_card');
      expect(confirmCards).toHaveLength(1);
    });

    it('should return default response for unrecognized messages', async () => {
      const chunks = await collectChunks(
        orchestrator.processMessage(sessionId, '你好')
      );
      const textChunks = chunks.filter(c => c.type === 'text');
      expect(textChunks.length).toBeGreaterThan(0);
      const text = textChunks.map(c => (c as { content: string }).content).join('');
      expect(text).toContain('AIGateway Agent');
    });
  });

  describe('Confirm/Cancel flow', () => {
    it('should cancel pending operation', async () => {
      // First trigger a write operation
      await collectChunks(
        orchestrator.processMessage(sessionId, '配置 OpenAI 接入，Key 是 sk-test12345')
      );

      // Cancel it
      const chunks = await collectChunks(
        orchestrator.handleConfirm(sessionId, 'cancel')
      );
      const textChunks = chunks.filter(c => c.type === 'text');
      const text = textChunks.map(c => (c as { content: string }).content).join('');
      expect(text).toContain('取消');
    });

    it('should report no pending operation when none exists', async () => {
      const chunks = await collectChunks(
        orchestrator.handleConfirm(sessionId, 'accept')
      );
      const textChunks = chunks.filter(c => c.type === 'text');
      const text = textChunks.map(c => (c as { content: string }).content).join('');
      expect(text).toContain('没有待确认');
    });

    it('should execute operation on accept', async () => {
      // Trigger a provider creation
      await collectChunks(
        orchestrator.processMessage(sessionId, '配置 OpenAI 接入，Key 是 sk-test12345')
      );

      // Accept it
      const chunks = await collectChunks(
        orchestrator.handleConfirm(sessionId, 'accept')
      );
      const toolResults = chunks.filter(c => c.type === 'tool_result');
      expect(toolResults.length).toBeGreaterThan(0);
    });
  });

  describe('Rollback', () => {
    it('should trigger rollback on Chinese rollback keyword', async () => {
      const chunks = await collectChunks(
        orchestrator.processMessage(sessionId, '回滚上一步')
      );
      const textChunks = chunks.filter(c => c.type === 'text');
      expect(textChunks.length).toBeGreaterThan(0);
      // Should mention failure since no operations to rollback
      const text = textChunks.map(c => (c as { content: string }).content).join('');
      expect(text).toMatch(/回滚|失败|没有/);
    });

    it('should trigger rollback on "undo"', async () => {
      const chunks = await collectChunks(
        orchestrator.processMessage(sessionId, 'undo')
      );
      const textChunks = chunks.filter(c => c.type === 'text');
      expect(textChunks.length).toBeGreaterThan(0);
    });
  });
});
