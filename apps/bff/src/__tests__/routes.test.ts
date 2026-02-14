import { describe, it, expect } from 'vitest';
import { sessionRoutes } from '../routes/session.js';
import { dashboardRoutes } from '../routes/dashboard.js';

describe('BFF Routes', () => {
  describe('sessionRoutes', () => {
    it('should export a function that returns a router', () => {
      expect(typeof sessionRoutes).toBe('function');
      const router = sessionRoutes('http://localhost:4000');
      expect(router).toBeDefined();
      expect(typeof router).toBe('function'); // Express router is a function
    });
  });

  describe('dashboardRoutes', () => {
    it('should export a function that returns a router', () => {
      expect(typeof dashboardRoutes).toBe('function');
      const router = dashboardRoutes('http://localhost:4000');
      expect(router).toBeDefined();
      expect(typeof router).toBe('function');
    });
  });
});
