import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.d.ts",
        // test files excluded from coverage via pattern below
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.config.ts",
        "**/types.ts",
      ],
    },
    setupFiles: [
      "./src/api/__tests__/setup.ts",
      "./src/react/__tests__/setupReact.ts",
    ],
  },
});
