import type { Config } from 'jest';

const config: Config = {
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'babel',

  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // Handle ESM imports
  },

  // A preset that is used as a base for Jest's configuration
  preset: 'ts-jest',

  // Run tests from one or more projects
  projects: [
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['**/src/**/*.spec.tsx'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
      },
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      transformIgnorePatterns: ['node_modules/(?!(@workos-inc|jose)/)'],
    },
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/src/**/*.spec.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
        '^.+\\.jsx?$': ['ts-jest', { useESM: true }],
      },
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      setupFiles: ['<rootDir>/jest.setup.ts'],
      transformIgnorePatterns: ['node_modules/(?!(@workos-inc|jose)/)'],
    },
  ],

  // Indicates whether each individual test should be reported during the run
  verbose: true,

  // Optionally, add these for better TypeScript support
  extensionsToTreatAsEsm: ['.ts'],

  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
