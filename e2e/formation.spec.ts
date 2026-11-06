import { expect, test, type Page } from "@playwright/test";

// ?test exposes window.__formationTest (e2e build only); ?seed fixes the formation.
type Hooks = { __formationTest: { kill(col: number): void; hitPlayer(): void; calm(): void } };
const hook = (page: Page, fn: string, ...args: number[]) =>
  page.evaluate(([f, a]) => ((window as unknown as Hooks).__formationTest as unknown as Record<string, (...x: number[]) => void>)[f as string](...(a as number[])), [fn, args] as const);

async function data(page: Page) {
  const c = page.locator("#game");
  const get = async (k: string) => (await c.getAttribute(`data-${k}`)) ?? "";
  return {
    phase: await get("phase"), score: Number(await get("score")), queue: Number(await get("queue")),
    shields: Number(await get("shields")), cancels: Number(await get("cancels")), alive: Number(await get("alive")),
    stage: Number(await get("stage")), x: Number(await get("x")), hand: await get("hand"), seed: await get("seed"),
  };
}

test("preview → play, move, shoot a real bullet into the formation", async ({ page }) => {
  await page.goto("/formation/?test&seed=3");
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "preview");
  await expect(page.locator("#game")).toHaveAttribute("data-sprites", "ready");
  await page.screenshot({ path: "test-results/formation-preview.png" });
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await data(page)).phase).toBe("play");
  await hook(page, "calm");

  const x0 = (await data(page)).x;
  await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(250); await page.keyboard.up("ArrowLeft");
  expect((await data(page)).x).toBeLessThan(x0);

  // Holding Space fires; the formation spans the middle of the screen, so a shot from the
  // centre must hit something.
  await page.keyboard.down("ArrowRight"); await page.waitForTimeout(250); await page.keyboard.up("ArrowRight");
  await page.keyboard.down(" ");
  await expect.poll(async () => (await data(page)).alive, { timeout: 5_000 }).toBeLessThan(25);
  await page.keyboard.up(" ");
  expect((await data(page)).queue).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/formation-play.png" });
});

test("five kills score a hand; X cancels the queue", async ({ page }) => {
  await page.goto("/formation/?test&seed=3&k=1000");
  await page.keyboard.press("Enter");
  await hook(page, "calm");
  for (const col of [0, 1]) await hook(page, "kill", col);
  // data-* attributes refresh on the next frame, so always poll after a hook call.
  await expect.poll(async () => (await data(page)).queue).toBe(2);
  await page.keyboard.press("x");
  await expect.poll(async () => (await data(page)).queue).toBe(0);
  expect((await data(page)).cancels).toBe(2);
  for (const col of [0, 1, 2, 3, 4]) await hook(page, "kill", col);
  await expect.poll(async () => (await data(page)).score).toBeGreaterThan(0);
  const d = await data(page);
  expect(d.queue).toBe(0);
  expect(d.hand).not.toBe("");
  await page.screenshot({ path: "test-results/formation-hand.png" });
});

test("query params change the rules: queue=3 scores after three kills", async ({ page }) => {
  await page.goto("/formation/?test&seed=3&queue=3&k=1000");
  await page.keyboard.press("Enter");
  await hook(page, "calm");
  for (const col of [0, 1, 2]) await hook(page, "kill", col);
  await expect.poll(async () => (await data(page)).score).toBeGreaterThan(0);
  expect((await data(page)).queue).toBe(0);
});

test("reaching the target clears the stage and advances", async ({ page }) => {
  await page.goto("/formation/?test&seed=3&k=0.001");
  await page.keyboard.press("Enter");
  await hook(page, "calm");
  for (const col of [0, 1, 2, 3, 4]) await hook(page, "kill", col);
  await expect.poll(async () => (await data(page)).phase).toBe("clear");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await data(page)).stage).toBe(1);
  expect((await data(page)).phase).toBe("preview");
});

test("losing every shield ends the run with a report; Enter restarts", async ({ page }) => {
  await page.goto("/formation/?test&seed=3&shields=1");
  await page.keyboard.press("Enter");
  await hook(page, "calm");
  await hook(page, "hitPlayer");
  await expect.poll(async () => (await data(page)).phase).toBe("over");
  await expect(page.locator("#report")).toContainText("ゲームオーバー");
  await page.screenshot({ path: "test-results/formation-over.png" });
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await data(page)).phase).toBe("preview");
  expect((await data(page)).shields).toBe(1);
});

test("the panel edits the URL query", async ({ page }) => {
  await page.goto("/formation/?test&seed=3");
  const input = page.locator('#param-table input[name="queue"]');
  await expect(input).toHaveValue("5");
  await input.fill("4");
  await page.locator("#apply").click();
  await expect(page).toHaveURL(/queue=4/);
  await expect(page).toHaveURL(/seed=3/);
  await expect(page.locator('#param-table input[name="queue"]')).toHaveValue("4");
  await expect(page.locator("#query")).toContainText("queue=4");
});
