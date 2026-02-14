import { describe, it, expect } from 'vitest';
import { ALL_TOOLS, AI_PROVIDER_TOOLS, AI_ROUTE_TOOLS } from '../tools.js';

describe('Tool definitions', () => {
  it('should have 10 total tools (5 provider + 5 route)', () => {
    expect(AI_PROVIDER_TOOLS).toHaveLength(5);
    expect(AI_ROUTE_TOOLS).toHaveLength(5);
    expect(ALL_TOOLS).toHaveLength(10);
  });

  it('ALL_TOOLS should be the union of provider and route tools', () => {
    expect(ALL_TOOLS).toEqual([...AI_PROVIDER_TOOLS, ...AI_ROUTE_TOOLS]);
  });

  it('all tools should have required fields', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);

      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe('string');

      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema['type']).toBe('object');
    }
  });

  it('tool names should follow kebab-case naming convention', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('provider tools should include list, get, add, update, delete', () => {
    const names = AI_PROVIDER_TOOLS.map(t => t.name);
    expect(names).toContain('list-ai-providers');
    expect(names).toContain('get-ai-provider');
    expect(names).toContain('add-ai-provider');
    expect(names).toContain('update-ai-provider');
    expect(names).toContain('delete-ai-provider');
  });

  it('route tools should include list, get, add, update, delete', () => {
    const names = AI_ROUTE_TOOLS.map(t => t.name);
    expect(names).toContain('list-ai-routes');
    expect(names).toContain('get-ai-route');
    expect(names).toContain('add-ai-route');
    expect(names).toContain('update-ai-route');
    expect(names).toContain('delete-ai-route');
  });

  it('add-ai-provider should require name, type, tokens', () => {
    const addProvider = ALL_TOOLS.find(t => t.name === 'add-ai-provider')!;
    const required = addProvider.inputSchema['required'] as string[];
    expect(required).toContain('name');
    expect(required).toContain('type');
    expect(required).toContain('tokens');
  });

  it('add-ai-route should require name, upstreams', () => {
    const addRoute = ALL_TOOLS.find(t => t.name === 'add-ai-route')!;
    const required = addRoute.inputSchema['required'] as string[];
    expect(required).toContain('name');
    expect(required).toContain('upstreams');
  });
});
