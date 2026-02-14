import { describe, it, expect } from 'vitest';
import {
  LLM_PROVIDER_TYPES,
  WRITE_TOOLS,
  READ_TOOLS,
  TOOL_TO_RESOURCE_TYPE,
  TOOL_TO_OPERATION_TYPE,
  ROLLBACK_TRIGGERS,
} from '../constants/index.js';

describe('LLM_PROVIDER_TYPES', () => {
  it('should contain 26 provider types', () => {
    expect(LLM_PROVIDER_TYPES).toHaveLength(26);
  });

  it('should include common providers', () => {
    expect(LLM_PROVIDER_TYPES).toContain('openai');
    expect(LLM_PROVIDER_TYPES).toContain('deepseek');
    expect(LLM_PROVIDER_TYPES).toContain('qwen');
    expect(LLM_PROVIDER_TYPES).toContain('claude');
  });
});

describe('WRITE_TOOLS and READ_TOOLS', () => {
  it('should not overlap', () => {
    for (const tool of WRITE_TOOLS) {
      expect(READ_TOOLS.has(tool)).toBe(false);
    }
    for (const tool of READ_TOOLS) {
      expect(WRITE_TOOLS.has(tool)).toBe(false);
    }
  });

  it('WRITE_TOOLS should contain add/update/delete operations', () => {
    expect(WRITE_TOOLS.has('add-ai-provider')).toBe(true);
    expect(WRITE_TOOLS.has('update-ai-provider')).toBe(true);
    expect(WRITE_TOOLS.has('delete-ai-provider')).toBe(true);
    expect(WRITE_TOOLS.has('add-ai-route')).toBe(true);
    expect(WRITE_TOOLS.has('delete-ai-route')).toBe(true);
  });

  it('READ_TOOLS should contain list/get operations', () => {
    expect(READ_TOOLS.has('list-ai-providers')).toBe(true);
    expect(READ_TOOLS.has('get-ai-provider')).toBe(true);
    expect(READ_TOOLS.has('list-ai-routes')).toBe(true);
    expect(READ_TOOLS.has('get-ai-route')).toBe(true);
  });
});

describe('TOOL_TO_RESOURCE_TYPE', () => {
  it('should map AI provider tools to ai-provider', () => {
    expect(TOOL_TO_RESOURCE_TYPE['add-ai-provider']).toBe('ai-provider');
    expect(TOOL_TO_RESOURCE_TYPE['update-ai-provider']).toBe('ai-provider');
    expect(TOOL_TO_RESOURCE_TYPE['delete-ai-provider']).toBe('ai-provider');
  });

  it('should map AI route tools to ai-route', () => {
    expect(TOOL_TO_RESOURCE_TYPE['add-ai-route']).toBe('ai-route');
    expect(TOOL_TO_RESOURCE_TYPE['update-ai-route']).toBe('ai-route');
    expect(TOOL_TO_RESOURCE_TYPE['delete-ai-route']).toBe('ai-route');
  });
});

describe('TOOL_TO_OPERATION_TYPE', () => {
  it('should correctly map tools to operation types', () => {
    expect(TOOL_TO_OPERATION_TYPE['add-ai-provider']).toBe('create');
    expect(TOOL_TO_OPERATION_TYPE['update-ai-provider']).toBe('update');
    expect(TOOL_TO_OPERATION_TYPE['delete-ai-provider']).toBe('delete');
    expect(TOOL_TO_OPERATION_TYPE['add-ai-route']).toBe('create');
    expect(TOOL_TO_OPERATION_TYPE['update-ai-route']).toBe('update');
    expect(TOOL_TO_OPERATION_TYPE['delete-ai-route']).toBe('delete');
  });
});

describe('ROLLBACK_TRIGGERS', () => {
  it('should contain Chinese rollback trigger words', () => {
    expect(ROLLBACK_TRIGGERS).toContain('回滚');
    expect(ROLLBACK_TRIGGERS).toContain('撤销');
    expect(ROLLBACK_TRIGGERS).toContain('回滚上一步');
  });

  it('should contain English rollback trigger words', () => {
    expect(ROLLBACK_TRIGGERS).toContain('undo');
    expect(ROLLBACK_TRIGGERS).toContain('rollback');
  });
});
