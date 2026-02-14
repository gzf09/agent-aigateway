import { describe, it, expect } from 'vitest';
import { maskApiKey, maskForLog, generateId, formatTimestamp } from '../utils/index.js';

describe('maskApiKey', () => {
  it('should mask a normal API key keeping first 3 and last 3 chars', () => {
    const result = maskApiKey('sk-abcdefghijk');
    expect(result).toBe('sk-•••ijk');
  });

  it('should return bullets for short keys (<=8 chars)', () => {
    expect(maskApiKey('short')).toBe('••••••••');
    expect(maskApiKey('12345678')).toBe('••••••••');
  });

  it('should handle 9 char boundary correctly', () => {
    const result = maskApiKey('123456789');
    expect(result).toBe('123•••789');
  });

  it('should return bullets for empty string', () => {
    expect(maskApiKey('')).toBe('••••••••');
  });
});

describe('maskForLog', () => {
  it('should always return [REDACTED]', () => {
    expect(maskForLog('sk-test123')).toBe('[REDACTED]');
    expect(maskForLog('')).toBe('[REDACTED]');
    expect(maskForLog('anything')).toBe('[REDACTED]');
  });
});

describe('generateId', () => {
  it('should generate a UUID v4 format string', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('formatTimestamp', () => {
  it('should return a formatted time string', () => {
    const ts = new Date('2024-01-15T14:30:45.000Z').getTime();
    const result = formatTimestamp(ts);
    // Should contain HH:MM:SS pattern
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
