import { describe, it, expect } from 'vitest';
import { assessRisk, buildConfirmCard } from '../safety/riskAssessor.js';
import type { PlannedToolCall, PreprocessorResult } from '@aigateway/shared';

describe('assessRisk', () => {
  const defaultPPResult: PreprocessorResult = { allowed: true };

  it('should return low for create operations', () => {
    const toolCalls: PlannedToolCall[] = [{ toolName: 'add-ai-provider', args: { name: 'openai' } }];
    expect(assessRisk(toolCalls, defaultPPResult)).toBe('low');
  });

  it('should return medium for update operations', () => {
    const toolCalls: PlannedToolCall[] = [{ toolName: 'update-ai-provider', args: { name: 'openai' } }];
    expect(assessRisk(toolCalls, defaultPPResult)).toBe('medium');
  });

  it('should return high for delete operations', () => {
    const toolCalls: PlannedToolCall[] = [{ toolName: 'delete-ai-provider', args: { name: 'openai' } }];
    expect(assessRisk(toolCalls, defaultPPResult)).toBe('high');
  });

  it('should respect preprocessor riskOverride to high', () => {
    const toolCalls: PlannedToolCall[] = [{ toolName: 'update-ai-route', args: { name: 'route' } }];
    const ppResult: PreprocessorResult = { allowed: true, riskOverride: 'high' };
    expect(assessRisk(toolCalls, ppResult)).toBe('high');
  });

  it('should respect preprocessor riskOverride to medium', () => {
    const toolCalls: PlannedToolCall[] = [{ toolName: 'add-ai-provider', args: { name: 'openai' } }];
    const ppResult: PreprocessorResult = { allowed: true, riskOverride: 'medium' };
    expect(assessRisk(toolCalls, ppResult)).toBe('medium');
  });
});

describe('buildConfirmCard', () => {
  it('should build summary card for create operations', () => {
    const card = buildConfirmCard(
      'add-ai-provider',
      { name: 'openai', type: 'openai', tokens: ['sk-test123'], protocol: 'openai/v1' },
      null,
      'low',
    );
    expect(card.type).toBe('summary');
    expect(card.riskLevel).toBe('low');
    expect(card.resourceName).toBe('openai');
  });

  it('should build diff card for update operations with current state', () => {
    const card = buildConfirmCard(
      'update-ai-route',
      { name: 'test-route', upstreams: [{ provider: 'deepseek', weight: 100 }] },
      { name: 'test-route', upstreams: [{ provider: 'openai', weight: 100 }] },
      'medium',
    );
    expect(card.type).toBe('diff');
    expect(card.riskLevel).toBe('medium');
  });

  it('should build name_input card for delete operations', () => {
    const card = buildConfirmCard(
      'delete-ai-provider',
      { name: 'openai' },
      { name: 'openai', type: 'openai', tokens: ['sk-test'] },
      'high',
    );
    expect(card.type).toBe('name_input');
    expect(card.riskLevel).toBe('high');
    expect(card.resourceName).toBe('openai');
  });
});
