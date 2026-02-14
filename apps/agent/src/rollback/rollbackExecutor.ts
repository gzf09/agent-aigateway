import type { RollbackResult, ChangeLogEntry } from '@aigateway/shared';
import { ChangelogManager } from './changelogManager.js';
import { HigressMCPClient } from '@aigateway/mcp-client';

export class RollbackExecutor {
  constructor(
    private changelog: ChangelogManager,
    private mcpClient: HigressMCPClient,
  ) {}

  async rollbackLast(sessionId: string): Promise<RollbackResult> {
    const entry = await this.changelog.getLatestEntry(sessionId);
    if (!entry) {
      return { success: false, fromVersion: 0, toVersion: 0, stepsRolledBack: 0, failedAt: { versionId: 0, error: '没有可回滚的操作' } };
    }
    return this.rollbackEntry(sessionId, entry);
  }

  async rollbackToVersion(sessionId: string, targetVersionId: number): Promise<RollbackResult> {
    const currentVersion = await this.changelog.getCurrentVersion(sessionId);
    if (targetVersionId >= currentVersion) {
      return { success: false, fromVersion: currentVersion, toVersion: targetVersionId, stepsRolledBack: 0, failedAt: { versionId: targetVersionId, error: '目标版本无效' } };
    }

    let stepsRolledBack = 0;
    for (let v = currentVersion; v > targetVersionId; v--) {
      const entry = await this.changelog.getEntry(sessionId, v);
      if (!entry || entry.rollbackStatus !== 'active') continue;

      const result = await this.rollbackEntry(sessionId, entry);
      if (!result.success) {
        return { success: false, fromVersion: currentVersion, toVersion: v, stepsRolledBack, failedAt: result.failedAt };
      }
      stepsRolledBack++;
    }

    return { success: true, fromVersion: currentVersion, toVersion: targetVersionId, stepsRolledBack };
  }

  private async rollbackEntry(sessionId: string, entry: ChangeLogEntry): Promise<RollbackResult> {
    try {
      let result;
      switch (entry.operationType) {
        case 'create':
          result = await this.mcpClient.callTool(`delete-${entry.resourceType.replace('ai-', 'ai-')}`, { name: entry.resourceName });
          break;
        case 'update':
          if (!entry.beforeState) throw new Error('无法回滚：缺少变更前状态');
          result = await this.mcpClient.callTool(`update-${entry.resourceType}`, entry.beforeState);
          break;
        case 'delete':
          if (!entry.beforeState) throw new Error('无法回滚：缺少变更前状态');
          result = await this.mcpClient.callTool(`add-${entry.resourceType}`, entry.beforeState);
          break;
      }

      if (result && !result.success) {
        return { success: false, fromVersion: entry.versionId, toVersion: entry.versionId - 1, stepsRolledBack: 0, failedAt: { versionId: entry.versionId, error: result.error || '回滚操作失败' } };
      }

      await this.changelog.updateEntry(sessionId, entry.versionId, { rollbackStatus: 'rolled_back' });
      return { success: true, fromVersion: entry.versionId, toVersion: entry.versionId - 1, stepsRolledBack: 1 };
    } catch (e: unknown) {
      return { success: false, fromVersion: entry.versionId, toVersion: entry.versionId - 1, stepsRolledBack: 0, failedAt: { versionId: entry.versionId, error: (e as Error).message } };
    }
  }

  async getTimeline(sessionId: string, limit?: number) {
    return this.changelog.getTimeline(sessionId, limit);
  }
}
