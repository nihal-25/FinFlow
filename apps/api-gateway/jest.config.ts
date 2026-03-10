import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@finflow/types$": "<rootDir>/../../packages/types/src/index.ts",
    "^@finflow/database$": "<rootDir>/../../packages/database/src/index.ts",
    "^@finflow/redis$": "<rootDir>/../../packages/redis/src/index.ts",
  },
  setupFilesAfterEach: [],
  globalSetup: "./__tests__/setup.ts",
  globalTeardown: "./__tests__/teardown.ts",
};

export default config;
