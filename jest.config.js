module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: ["app.js"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  verbose: true,
  testTimeout: 10000,
  forceExit: true,
  clearMocks: true,
  // Transform ES modules
  transformIgnorePatterns: ["node_modules/(?!(uuid)/)"],
  transform: {
    "^.+\\.js$": "babel-jest",
  },
  // Mock baileys module
  moduleNameMapper: {
    "^baileys$": "<rootDir>/tests/__mocks__/baileys.js",
  },
};
