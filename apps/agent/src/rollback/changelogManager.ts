import type { ChangeLogEntry, ResourceType } from '@aigateway/shared';
import { generateId } from '@aigateway/shared';
import Redis from 'ioredis';

const TTL = 7200; // 2 hours

export class ChangelogManager {
  private redis: Redis | null;

  constructor(redisUrl?: string) {
    try {
      this.redis = redisUrl ? new Redis(redisUrl) : null;
    } catch {
      this.redis = null;
    }
    // In-memory fallback
    if (!this.redis) {
      this.inMemory = new Map();
      this.inMemoryVersions = new Map();
    }
  }

  private inMemory?: Map<string, ChangeLogEntry[]>;
  private inMemoryVersions?: Map<string, number>;

  async addEntry(sessionId: string, entry: Omit<ChangeLogEntry, 'id' | 'versionId' | 'createdAt' | 'rollbackStatus'>): Promise<ChangeLogEntry> {
    const versionId = await this.nextVersion(sessionId);
    const full: ChangeLogEntry = {
      ...entry, id: generateId(), versionId, createdAt: Date.now(), rollbackStatus: 'active',
    };

    if (this.redis) {
      await this.redis.set(`changelog:entry:${sessionId}:${versionId}`, JSON.stringify(full), 'EX', TTL);
      await this.redis.zadd(`changelog:timeline:${sessionId}`, full.createdAt, String(versionId));
      await this.redis.expire(`changelog:timeline:${sessionId}`, TTL);
    } else {
      const entries = this.inMemory!.get(sessionId) || [];
      entries.push(full);
      this.inMemory!.set(sessionId, entries);
    }
    return full;
  }

  async getLatestEntry(sessionId: string): Promise<ChangeLogEntry | null> {
    const version = await this.getCurrentVersion(sessionId);
    if (version === 0) return null;

    if (this.redis) {
      const data = await this.redis.get(`changelog:entry:${sessionId}:${version}`);
      return data ? JSON.parse(data) : null;
    }
    const entries = this.inMemory?.get(sessionId) || [];
    return entries.findLast(e => e.rollbackStatus === 'active') || null;
  }

  async getEntry(sessionId: string, versionId: number): Promise<ChangeLogEntry | null> {
    if (this.redis) {
      const data = await this.redis.get(`changelog:entry:${sessionId}:${versionId}`);
      return data ? JSON.parse(data) : null;
    }
    const entries = this.inMemory?.get(sessionId) || [];
    return entries.find(e => e.versionId === versionId) || null;
  }

  async updateEntry(sessionId: string, versionId: number, update: Partial<ChangeLogEntry>): Promise<void> {
    const entry = await this.getEntry(sessionId, versionId);
    if (!entry) return;
    const updated = { ...entry, ...update };
    if (this.redis) {
      await this.redis.set(`changelog:entry:${sessionId}:${versionId}`, JSON.stringify(updated), 'EX', TTL);
    } else {
      const entries = this.inMemory?.get(sessionId) || [];
      const idx = entries.findIndex(e => e.versionId === versionId);
      if (idx >= 0) entries[idx] = updated;
    }
  }

  async getTimeline(sessionId: string, limit = 50): Promise<ChangeLogEntry[]> {
    if (this.redis) {
      const versionIds = await this.redis.zrevrange(`changelog:timeline:${sessionId}`, 0, limit - 1);
      const entries: ChangeLogEntry[] = [];
      for (const vid of versionIds) {
        const data = await this.redis.get(`changelog:entry:${sessionId}:${vid}`);
        if (data) entries.push(JSON.parse(data));
      }
      return entries;
    }
    return (this.inMemory?.get(sessionId) || []).slice(-limit).reverse();
  }

  async getCurrentVersion(sessionId: string): Promise<number> {
    if (this.redis) {
      const v = await this.redis.get(`changelog:version:${sessionId}`);
      return v ? parseInt(v, 10) : 0;
    }
    return this.inMemoryVersions?.get(sessionId) || 0;
  }

  private async nextVersion(sessionId: string): Promise<number> {
    if (this.redis) {
      const v = await this.redis.incr(`changelog:version:${sessionId}`);
      await this.redis.expire(`changelog:version:${sessionId}`, TTL);
      return v;
    }
    const current = this.inMemoryVersions?.get(sessionId) || 0;
    const next = current + 1;
    this.inMemoryVersions!.set(sessionId, next);
    return next;
  }
}
