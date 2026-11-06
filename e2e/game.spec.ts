import { expect, test } from "@playwright/test";

test("game loads sprites, moves the ship, progresses and can retry", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#game");
  const data = async () => ({
    x: Number(await canvas.getAttribute("data-x")),
    score: Number(await canvas.getAttribute("data-score")),
    over: (await canvas.getAttribute("data-over")) === "true",
  });
  await expect(canvas).toHaveAttribute("data-sprites", "ready");

  const { x: x0 } = await data();
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowLeft");
  expect((await data()).x).toBeLessThan(x0);

  // Rocks are random: the run either scores or ends in a collision — both prove the loop runs.
  await expect.poll(async () => { const d = await data(); return d.score > 0 || d.over; }, { timeout: 30_000 }).toBe(true);
  await page.screenshot({ path: "test-results/game.png" });

  // Play until game over, then Space restarts with a fresh state.
  await expect.poll(async () => (await data()).over, { timeout: 60_000 }).toBe(true);
  await page.keyboard.press(" ");
  await expect.poll(async () => (await data()).over).toBe(false);
  expect((await data()).score).toBeLessThanOrEqual(1);
});
