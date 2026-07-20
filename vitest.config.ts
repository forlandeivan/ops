import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Алиасы зеркалят tsconfig paths (@unica/* → packages, @shared/* → shared).
export default defineConfig({
  resolve: {
    alias: {
      "@shared/schema": fileURLToPath(new URL("./shared/schema.ts", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@unica/observability": fileURLToPath(new URL("./packages/observability/src", import.meta.url)),
      "@unica/cache": fileURLToPath(new URL("./packages/cache/src", import.meta.url)),
      "@unica/instrumentation": fileURLToPath(new URL("./packages/instrumentation/src", import.meta.url)),
      "@unica/blob-storage": fileURLToPath(new URL("./packages/blob-storage/src", import.meta.url)),
      "@unica/runtime-utils": fileURLToPath(new URL("./packages/runtime-utils/src", import.meta.url)),
      "@unica/postgres-client": fileURLToPath(new URL("./packages/postgres-client/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
