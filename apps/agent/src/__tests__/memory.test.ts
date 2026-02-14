import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationMemory } from '../conversation/memory.js';

describe('ConversationMemory', () => {
  let memory: ConversationMemory;

  beforeEach(() => {
    memory = new ConversationMemory('test-session');
  });

  it('should add messages', () => {
    memory.addMessage('user', 'Hello');
    memory.addMessage('assistant', 'Hi there');
    expect(memory.messages).toHaveLength(2);
    expect(memory.messages[0]!.role).toBe('user');
    expect(memory.messages[0]!.content).toBe('Hello');
  });

  it('should assign unique IDs to messages', () => {
    const m1 = memory.addMessage('user', 'msg1');
    const m2 = memory.addMessage('user', 'msg2');
    expect(m1.id).not.toBe(m2.id);
  });

  it('should build LLM messages from recent 20 messages', () => {
    for (let i = 0; i < 30; i++) {
      memory.addMessage(i % 2 === 0 ? 'user' : 'assistant', `message ${i}`);
    }
    const llmMessages = memory.buildLLMMessages();
    expect(llmMessages).toHaveLength(20);
    expect(llmMessages[0]!.content).toBe('message 10');
    expect(llmMessages[19]!.content).toBe('message 29');
  });

  it('should auto-trim messages at 100 limit (keep last 80)', () => {
    for (let i = 0; i < 105; i++) {
      memory.addMessage('user', `msg ${i}`);
    }
    // After 100 messages, it trims to 80, then adds 5 more = 85
    // Actually: at message 101 (index 100), trim happens: 101 messages -> keep last 80 = 80
    // Then add 4 more: 84 messages total + the 101st itself after trim = 80, then 102-105 = 84
    expect(memory.messages.length).toBeLessThanOrEqual(85);
    expect(memory.messages.length).toBeGreaterThanOrEqual(80);
  });

  it('should track resource references', () => {
    memory.addResourceReference('ai-provider', 'openai');
    memory.addResourceReference('ai-route', 'my-route');
    expect(memory.recentResources).toHaveLength(2);
  });

  it('should resolve provider reference', () => {
    memory.addResourceReference('ai-provider', 'openai');
    memory.addResourceReference('ai-route', 'my-route');

    const ref = memory.resolveReference('提供商');
    expect(ref).not.toBeNull();
    expect(ref!.name).toBe('openai');
    expect(ref!.type).toBe('ai-provider');
  });

  it('should resolve route reference', () => {
    memory.addResourceReference('ai-provider', 'openai');
    memory.addResourceReference('ai-route', 'my-route');

    const ref = memory.resolveReference('路由');
    expect(ref).not.toBeNull();
    expect(ref!.name).toBe('my-route');
    expect(ref!.type).toBe('ai-route');
  });

  it('should return null for empty references', () => {
    const ref = memory.resolveReference('提供商');
    expect(ref).toBeNull();
  });
});
