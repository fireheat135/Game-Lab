import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages serves from /<repo>/; set BASE_PATH there. Local dev uses "/".
  base: process.env.BASE_PATH ?? "/",
  test: { include: ["tests/**/*.test.ts"] },
});
