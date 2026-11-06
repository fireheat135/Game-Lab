import { expect, test } from "@playwright/test";

// ?test exposes window.__gameTest (only in the e2e build, VITE_E2E=1); ?seed fixes the RNG.
type Hooks = { __gameTest: { hitPlayer(): void; spawn(x: number, y: number, speed: number): void; calm(): void } };
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

  // Rocks fall and score when they leave the screen: a rock placed near the bottom, far from
  // the ship (now at the left), must pass off-screen and raise the score.
  // calm() stops random spawns and clears the field so no random rock can end the game here.
  await page.evaluate(() => (window as unknown as Hooks).__gameTest.calm());
  const before = (await data()).score;
  await page.evaluate(() => (window as unknown as Hooks).__gameTest.spawn(440, 300, 200));
  await expect.poll(async () => (await data()).score, { timeout: 5_000 }).toBeGreaterThan(before);

  // Deterministic collision instead of waiting for a random hit.
  await page.evaluate(() => (window as unknown as Hooks).__gameTest.hitPlayer());
  await expect.poll(async () => (await data()).over).toBe(true);

  await page.keyboard.press(" ");
  await expect.poll(async () => (await data()).over).toBe(false);
  expect((await data()).score).toBe(0);
});
