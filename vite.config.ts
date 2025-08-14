import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "DatadogUXUtils",
      fileName: (format) => `index.${format === "es" ? "mjs" : "js"}`,
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: ["immutability-helper"],
      output: {
        globals: {
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
