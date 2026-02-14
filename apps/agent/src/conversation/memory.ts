import type { ChatMessage, ResourceReference } from '@aigateway/shared';
import { generateId } from '@aigateway/shared';

export class ConversationMemory {
  sessionId: string;
  messages: ChatMessage[] = [];
  maxContextTokens = 8000;
  recentResources: ResourceReference[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  addMessage(role: 'user' | 'assistant' | 'system', content: string, metadata?: ChatMessage['metadata']): ChatMessage {
    const msg: ChatMessage = { id: generateId(), role, content, timestamp: Date.now(), metadata };
    this.messages.push(msg);
    if (this.messages.length > 100) this.messages = this.messages.slice(-80);
    return msg;
  }

  buildLLMMessages(): { role: 'user' | 'assistant' | 'system'; content: string }[] {
    const result: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
    const recentMessages = this.messages.slice(-20);
    for (const msg of recentMessages) {
      result.push({ role: msg.role, content: msg.content });
    }
    return result;
  }

  addResourceReference(type: ResourceReference['type'], name: string) {
    this.recentResources.push({ type, name, timestamp: Date.now() });
    if (this.recentResources.length > 20) this.recentResources = this.recentResources.slice(-10);
  }

  resolveReference(reference: string): ResourceReference | null {
    if (this.recentResources.length === 0) return null;
    const lower = reference.toLowerCase();
    if (lower.includes('路由') || lower.includes('route')) {
      return this.recentResources.findLast(r => r.type === 'ai-route' || r.type === 'route') || null;
    }
    if (lower.includes('提供商') || lower.includes('provider')) {
      return this.recentResources.findLast(r => r.type === 'ai-provider') || null;
    }
    return this.recentResources[this.recentResources.length - 1] || null;
  }
}
