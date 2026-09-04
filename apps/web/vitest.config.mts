import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["dist/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" -> "./src/*" path mapping for vitest's resolver.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
