import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      // Multiple entry points for subpath exports
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        react: resolve(__dirname, "src/react/index.ts"),
        perf: resolve(__dirname, "src/perf/index.ts"),
        api: resolve(__dirname, "src/api/index.ts"),
        env: resolve(__dirname, "src/env/index.ts"),
        errors: resolve(__dirname, "src/errors/index.ts"),
        telemetry: resolve(__dirname, "src/telemetry/index.ts"),
        ux: resolve(__dirname, "src/ux/index.ts"),
      },
      name: "DatadogUXUtils",
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "mjs" : "js"}`,
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "@datadog/browser-rum",
        "@datadog/browser-logs",
        "web-vitals",
        "immutability-helper",
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "@datadog/browser-rum": "datadogRum",
          "@datadog/browser-logs": "datadogLogs",
          "immutability-helper": "immutabilityHelper",
        },
      },
    },
    sourcemap: true,
    minify: true,
    target: "es2020",
  },
  plugins: [
    dts({
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    }),
  ],
});
