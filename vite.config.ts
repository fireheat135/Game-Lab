import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages serves from /<repo>/; set BASE_PATH there. Local dev uses "/".
  base: process.env.BASE_PATH ?? "/",
  // Multi-page: / = meteor dodge, /formation/ = FORMATION HAND.
  build: { rolldownOptions: { input: { main: "index.html", formation: "formation/index.html" } } },
  test: { include: ["tests/**/*.test.ts"] },
});
