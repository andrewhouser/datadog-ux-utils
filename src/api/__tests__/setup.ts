// Global setup for Vitest
// Add global mocks, environment variables, or polyfills here

// Example: Polyfill fetch for Node.js
globalThis.fetch =
  globalThis.fetch || (() => Promise.reject("fetch not implemented"));

// Example: Set up global test variables
// globalThis.TEST_ENV = 'test';

// You can import this file in vitest.config.ts using setupFiles
