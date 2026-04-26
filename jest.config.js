// Lightweight Jest config scoped to the prompt-pipeline tests in
// __tests__/. Deliberately NOT using jest-expo or React Native's full
// preset — those are heavy and would force us to mock every native
// module just to run a snapshot of a string. Our prompt code is pure
// TypeScript with no React, no native, no async, so ts-jest preset
// gets us a 1-second test run.
//
// If we ever want to test React components or RN-specific code, switch
// to jest-expo (see https://docs.expo.dev/guides/testing-with-jest/)
// and accept the heavier setup.

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Match only files in __tests__/ — keeps the runner from trying to
  // pull in app/ or hook/ files that import RN modules.
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  // Mirror the tsconfig path alias so `@/lib/prompts` resolves the
  // same way it does in the app build. Without this, ts-jest would
  // fail on the alias because it doesn't read `paths` from tsconfig
  // by default.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
