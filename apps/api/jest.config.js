/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  transform: {
    "^.+\\.[tjm]sx?$": ["ts-jest", { useESM: true, tsconfig: { allowJs: true } }],
  },
  extensionsToTreatAsEsm: [".ts"],
  transformIgnorePatterns: [],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@app/shared$": "<rootDir>/../../packages/shared/src/index.ts",
    "^@app/shared/server$": "<rootDir>/../../packages/shared/src/server.ts",
    "^@app/shared/web$": "<rootDir>/../../packages/shared/src/web.ts",
    "^better-auth/adapters/prisma$": "<rootDir>/test/__mocks__/better-auth-prisma-adapter.ts",
    "^better-auth/plugins/access$": "<rootDir>/test/__mocks__/better-auth-access.ts",
    "^better-auth/plugins/organization/access$":
      "<rootDir>/test/__mocks__/better-auth-org-access.ts",
    "^better-auth/plugins$": "<rootDir>/test/__mocks__/better-auth-plugins.ts",
    "^better-auth$": "<rootDir>/test/__mocks__/better-auth.ts",
  },
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  forceExit: true,
};
