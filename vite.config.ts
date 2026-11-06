import { existsSync, readdirSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Every games/<name>/index.html becomes a page at /games/<name>/ — adding a game needs no config change.
const games = Object.fromEntries(
  readdirSync("games", { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(`games/${d.name}/index.html`))
    .map(d => [d.name, `games/${d.name}/index.html`]),
);

export default defineConfig({
  // GitHub Pages serves from /<repo>/; set BASE_PATH there. Cloudflare and local dev use "/".
  base: process.env.BASE_PATH ?? "/",
  build: { rolldownOptions: { input: { main: "index.html", ...games } } },
  test: { include: ["tests/**/*.test.ts"] },
});
