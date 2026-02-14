import { describe, it, expect, beforeEach } from 'vitest';
import { ChangelogManager } from '../rollback/changelogManager.js';

describe('ChangelogManager (in-memory)', () => {
  let changelog: ChangelogManager;
  const sessionId = 'test-session';

  beforeEach(() => {
    // Create with no Redis URL to use in-memory storage
    changelog = new ChangelogManager();
  });

  it('should start with version 0', async () => {
    const version = await changelog.getCurrentVersion(sessionId);
    expect(version).toBe(0);
  });

  it('should add entry and increment version', async () => {
    const entry = await changelog.addEntry(sessionId, {
      sessionId,
      operationType: 'create',
      resourceType: 'ai-provider',
      resourceName: 'openai',
      beforeState: null,
      afterState: { name: 'openai', type: 'openai' },
      changeSummary: 'Added openai provider',
    });

    expect(entry.versionId).toBe(1);
    expect(entry.rollbackStatus).toBe('active');
    expect(entry.operationType).toBe('create');

    const version = await changelog.getCurrentVersion(sessionId);
    expect(version).toBe(1);
  });

  it('should get latest entry', async () => {
    await changelog.addEntry(sessionId, {
      sessionId, operationType: 'create', resourceType: 'ai-provider',
      resourceName: 'openai', beforeState: null, afterState: null, changeSummary: 'first',
    });
    await changelog.addEntry(sessionId, {
      sessionId, operationType: 'create', resourceType: 'ai-provider',
      resourceName: 'deepseek', beforeState: null, afterState: null, changeSummary: 'second',
    });

    const latest = await changelog.getLatestEntry(sessionId);
    expect(latest).not.toBeNull();
    expect(latest!.resourceName).toBe('deepseek');
    expect(latest!.versionId).toBe(2);
  });

  it('should get entry by version', async () => {
    await changelog.addEntry(sessionId, {
      sessionId, operationType: 'create', resourceType: 'ai-provider',
      resourceName: 'openai', beforeState: null, afterState: null, changeSummary: 'first',
    });
    await changelog.addEntry(sessionId, {
      sessionId, operationType: 'create', resourceType: 'ai-route',
      resourceName: 'route1', beforeState: null, afterState: null, changeSummary: 'second',
    });

    const entry = await changelog.getEntry(sessionId, 1);
    expect(entry).not.toBeNull();
    expect(entry!.resourceName).toBe('openai');
  });

  it('should update entry status', async () => {
    await changelog.addEntry(sessionId, {
      sessionId, operationType: 'create', resourceType: 'ai-provider',
      resourceName: 'openai', beforeState: null, afterState: null, changeSummary: 'test',
    });

    await changelog.updateEntry(sessionId, 1, { rollbackStatus: 'rolled_back' });

    const entry = await changelog.getEntry(sessionId, 1);
    expect(entry!.rollbackStatus).toBe('rolled_back');
  });

  it('should get timeline in reverse order', async () => {
    await changelog.addEntry(sessionId, {
      sessionId, operationType: 'create', resourceType: 'ai-provider',
      resourceName: 'openai', beforeState: null, afterState: null, changeSummary: 'first',
    });
    await changelog.addEntry(sessionId, {
      sessionId, operationType: 'create', resourceType: 'ai-route',
      resourceName: 'route1', beforeState: null, afterState: null, changeSummary: 'second',
    });
    await changelog.addEntry(sessionId, {
      sessionId, operationType: 'update', resourceType: 'ai-route',
      resourceName: 'route1', beforeState: null, afterState: null, changeSummary: 'third',
    });

    const timeline = await changelog.getTimeline(sessionId);
    expect(timeline).toHaveLength(3);
    // In-memory returns reversed (newest first)
    expect(timeline[0]!.changeSummary).toBe('third');
    expect(timeline[2]!.changeSummary).toBe('first');
  });

  it('should isolate sessions', async () => {
    await changelog.addEntry('session-1', {
      sessionId: 'session-1', operationType: 'create', resourceType: 'ai-provider',
      resourceName: 'openai', beforeState: null, afterState: null, changeSummary: 's1',
    });
    await changelog.addEntry('session-2', {
      sessionId: 'session-2', operationType: 'create', resourceType: 'ai-route',
      resourceName: 'route1', beforeState: null, afterState: null, changeSummary: 's2',
    });

    const t1 = await changelog.getTimeline('session-1');
    const t2 = await changelog.getTimeline('session-2');
    expect(t1).toHaveLength(1);
    expect(t2).toHaveLength(1);
    expect(t1[0]!.resourceName).toBe('openai');
    expect(t2[0]!.resourceName).toBe('route1');
  });

  it('should return null for getLatestEntry on empty session', async () => {
    const entry = await changelog.getLatestEntry('empty-session');
    expect(entry).toBeNull();
  });
});
