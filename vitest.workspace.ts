import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/shared',
  'packages/mcp-client',
  'apps/agent',
  'apps/bff',
]);
