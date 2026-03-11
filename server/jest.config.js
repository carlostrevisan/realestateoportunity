/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.js"],
  collectCoverageFrom: [
    "routes/**/*.js",
    "!node_modules/**",
  ],
  coverageReporters: ["text", "lcov"],
  // Reset module registry between test files so mocks don't bleed across files
  clearMocks: true,
  resetModules: true,
};
