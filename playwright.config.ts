import { defineConfig } from "@playwright/test";

// PW_CHROMIUM_PATH: use a preinstalled Chromium (e.g. Claude cloud: /opt/pw-browsers/chromium).
// Unset in CI, where `npx playwright install chromium` provides the browser.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:4173", launchOptions: { executablePath } },
  webServer: { command: "npm run build && npx vite preview --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: !process.env.CI },
});
