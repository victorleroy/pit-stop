const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {'^~/(.*)$': '<rootDir>/src/$1'},
  setupFiles: ['reflect-metadata', '<rootDir>/test/setup.ts'],
};

module.exports = {
  projects: [
    {...base, displayName: 'unit', testMatch: ['<rootDir>/test/unit/**/*.test.ts']},
    {...base, displayName: 'integration', testMatch: ['<rootDir>/test/integration/**/*.test.ts']},
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/container.ts', '!src/index.ts'],
  coverageThreshold: {global: {branches: 80, functions: 80, lines: 80, statements: 80}},
};
