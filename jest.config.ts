/**
 * @file jest.config.ts
 * @description Jest test runner configuration.
 *
 * WHY ts-jest?
 * Jest is a JavaScript test runner. It can't understand TypeScript natively.
 * ts-jest is a preprocessor that compiles TypeScript files before Jest runs them.
 * This gives us full TypeScript support in tests — type checking, intellisense,
 * and proper error messages that point to TypeScript source lines.
 *
 * WHY MODULE NAME MAPPER?
 * Our tsconfig.json defines path aliases (@config/*, @utils/*, etc.).
 * Jest has its own module resolution — it doesn't read tsconfig paths.
 * moduleNameMapper tells Jest to resolve these aliases the same way TypeScript does.
 *
 * WHY --runInBand IN TEST SCRIPT?
 * By default, Jest runs test suites in parallel using worker threads.
 * For integration tests that share a database, parallel execution causes
 * race conditions — tests interfere with each other's data.
 * --runInBand forces serial execution: one suite at a time.
 */

import type { Config } from 'jest';

const config: Config = {
  // Use ts-jest to handle TypeScript compilation
  preset: 'ts-jest',

  // Run tests in Node.js environment (not browser/jsdom)
  testEnvironment: 'node',

  // Test file patterns — matches *.test.ts and *.spec.ts files
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.spec.ts', '**/?(*.)+(spec|test).ts'],

  // Files to exclude from test discovery
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // TypeScript path aliases — must mirror tsconfig.json paths
  // Format: alias pattern → relative path from project root
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@repositories/(.*)$': '<rootDir>/src/repositories/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@validators/(.*)$': '<rootDir>/src/validators/$1',
    '^@routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@constants/(.*)$': '<rootDir>/src/constants/$1',
    '^@interfaces/(.*)$': '<rootDir>/src/interfaces/$1',
  },

  // ts-jest configuration
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Point to our tsconfig for type checking in tests
        tsconfig: 'tsconfig.json',
        // Enable type checking in tests (slower but catches real bugs)
        diagnostics: true,
      },
    ],
  },

  // Coverage collection configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',       // Exclude type declaration files
    '!src/server.ts',       // Exclude entry point (not unit-testable)
    '!src/config/index.ts', // Exclude barrel exports
    '!src/utils/index.ts',
    '!src/middleware/index.ts',
  ],

  // Coverage thresholds — CI fails if coverage drops below these
  // Start at 0 and increase as the codebase grows
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Coverage report formats
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',

  // Set NODE_ENV to 'test' for all test runs.
  // This disables certain features (rate limiting, pino-pretty, etc.)
  // and enables test-specific behaviour in our config modules.
  testTimeout: 30000, // 30 seconds — generous for DB integration tests
  setupFilesAfterEnv: [], // Add global test setup files here later

  // Verbose output — shows each test name and result individually
  verbose: true,
};

export default config;
