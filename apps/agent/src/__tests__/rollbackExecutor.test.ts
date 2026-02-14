import { describe, it, expect, beforeEach } from 'vitest';
import { RollbackExecutor } from '../rollback/rollbackExecutor.js';
import { ChangelogManager } from '../rollback/changelogManager.js';
import { HigressMCPClient, mockProviders, mockRoutes } from '@aigateway/mcp-client';

describe('RollbackExecutor', () => {
  let changelog: ChangelogManager;
  let mcpClient: HigressMCPClient;
  let executor: RollbackExecutor;
  const sessionId = 'test-session';

  beforeEach(() => {
    mockProviders.clear();
    mockRoutes.clear();
    changelog = new ChangelogManager();
    mcpClient = new HigressMCPClient({
      serverUrl: '', higressConsoleUrl: 'http://localhost:8080', mockMode: true,
    });
    executor = new RollbackExecutor(changelog, mcpClient);
  });

  it('should fail rollback when no records exist', async () => {
    const result = await executor.rollbackLast(sessionId);
    expect(result.success).toBe(false);
    expect(result.failedAt?.error).toContain('没有可回滚的操作');
  });

  it('should rollback a create operation by executing delete', async () => {
    // Simulate: add a provider, then record in changelog
    await mcpClient.callTool('add-ai-provider', {
      name: 'openai', type: 'openai', tokens: ['sk-test'], protocol: 'openai/v1',
    });
    await changelog.addEntry(sessionId, {
      sessionId, operationType: 'create', resourceType: 'ai-provider',
      resourceName: 'openai', beforeState: null,
      afterState: { name: 'openai', type: 'openai' },
      changeSummary: 'Added openai',
    });

    const result = await executor.rollbackLast(sessionId);
    expect(result.success).toBe(true);
    expect(result.stepsRolledBack).toBe(1);

    // Provider should be deleted
    const listResult = await mcpClient.callTool('list-ai-providers', {});
    expect((listResult.data as { data: unknown[] }).data).toHaveLength(0);
  });

  it('should rollback multiple steps with rollbackToVersion', async () => {
    // Create 3 providers
    for (const name of ['p1', 'p2', 'p3']) {
      await mcpClient.callTool('add-ai-provider', {
        name, type: 'openai', tokens: ['sk-test'], protocol: 'openai/v1',
      });
      await changelog.addEntry(sessionId, {
        sessionId, operationType: 'create', resourceType: 'ai-provider',
        resourceName: name, beforeState: null, afterState: { name },
        changeSummary: `Added ${name}`,
      });
    }

    // Rollback to version 1 (should undo v3 and v2)
    const result = await executor.rollbackToVersion(sessionId, 1);
    expect(result.success).toBe(true);
    expect(result.stepsRolledBack).toBe(2);

    // Only p1 should remain
    const listResult = await mcpClient.callTool('list-ai-providers', {});
    const providers = (listResult.data as { data: { name: string }[] }).data;
    expect(providers).toHaveLength(1);
    expect(providers[0]!.name).toBe('p1');
  });

  it('should get timeline', async () => {
    await changelog.addEntry(sessionId, {
      sessionId, operationType: 'create', resourceType: 'ai-provider',
      resourceName: 'openai', beforeState: null, afterState: null, changeSummary: 'test',
    });

    const timeline = await executor.getTimeline(sessionId);
    expect(timeline).toHaveLength(1);
  });
});
