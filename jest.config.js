// See: https://jestjs.io/docs/configuration

/** @type {import('jest').Config} */
const jestConfig = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',

  // Run tests in Node environment (use 'jsdom' for browser code)
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],

  // Where to look for test files
  roots: ['<rootDir>'],

  // Match test files - supports both .test.ts and .spec.ts conventions
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],

  // Map TypeScript path aliases to Jest module resolution
  moduleNameMapper: {
    '^src/*(.*)$': ['<rootDir>/src/$1'],
    '^fixtures/*(.*)$': ['<rootDir>/tests/fixtures/$1'],
    '^setup$': ['<rootDir>/tests/setup'],
  },

  transformIgnorePatterns: ['<rootDir>/node_modules/'],
  moduleFileExtensions: ['js', 'ts'],
  testPathIgnorePatterns: ['/dist/', '/node_modules/'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
        useESM: true,
      },
    ],
  },
  verbose: true,

  // Cache transformed files between runs
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',

  // Run tests in parallel (default behavior, but be explicit)
  maxWorkers: '50%', // Use half of available CPU cores

  // Only run tests related to changed files in watch mode
  watchPathIgnorePatterns: ['node_modules', 'dist'],

  // Setup files (optional - for global test setup)
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
}

export default jestConfig
