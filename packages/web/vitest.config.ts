import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const _root = dirname(fileURLToPath(import.meta.url));

/** Hook tests use `*.hook.test.ts` + `@vitest-environment jsdom` (no JSX → no React Vite plugin). */
export default defineConfig({
  resolve: {
    alias: {
      "@rr/shared": resolve(_root, "../shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
