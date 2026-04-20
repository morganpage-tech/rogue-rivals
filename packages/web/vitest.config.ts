import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const _root = dirname(fileURLToPath(import.meta.url));

/** No React plugin: tests are Node-only; avoids Vite major-version skew with Vitest. */
export default defineConfig({
  resolve: {
    alias: {
      "@rr/engine2": resolve(_root, "../engine2/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
