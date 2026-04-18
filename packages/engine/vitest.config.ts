import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@rr/engine": path.join(rootDir, "src/index.ts"),
    },
  },
  test: {
    globals: false,
    include: ["test/**/*.test.ts"],
  },
});
