import { expect, test } from "@playwright/test";

// ?test exposes window.__gameTest (deterministic hooks); ?seed fixes the RNG.
test("game loads sprites, moves the ship, collides and can retry", async ({ page }) => {
  await page.goto("/?test&seed=1");
  const canvas = page.locator("#game");
  const data = async () => ({
    x: Number(await canvas.getAttribute("data-x")),
    score: Number(await canvas.getAttribute("data-score")),
    blocks: Number(await canvas.getAttribute("data-blocks")),
    over: (await canvas.getAttribute("data-over")) === "true",
  });
  await expect(canvas).toHaveAttribute("data-sprites", "ready");

  const { x: x0 } = await data();
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowLeft");
  expect((await data()).x).toBeLessThan(x0);

  // Rocks spawn over time (expected ~2.5/s; P(no spawn in 10s) ≈ e^-25).
  await expect.poll(async () => (await data()).blocks, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/game.png" });

  // Deterministic collision instead of waiting for a random hit.
  await page.evaluate(() => (window as unknown as { __gameTest: { hitPlayer(): void } }).__gameTest.hitPlayer());
  await expect.poll(async () => (await data()).over).toBe(true);

  await page.keyboard.press(" ");
  await expect.poll(async () => (await data()).over).toBe(false);
  expect((await data()).score).toBe(0);
});
