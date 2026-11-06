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

/** Presses Enter until `done` holds. Advancing is ignored for 350 ms after each screen change (anti-mash guard). */
async function confirmUntil(page: Page, done: (d: Awaited<ReturnType<typeof data>>) => boolean) {
  await expect.poll(async () => { if (!done(await data(page))) await page.keyboard.press("Enter"); return done(await data(page)); }, { intervals: [150] }).toBe(true);
}
/** Start the stage and wait until play (hooks ignore other phases). */
const start = (page: Page) => confirmUntil(page, d => d.phase === "play");

test("preview → play, move, shoot a real bullet into the formation", async ({ page }) => {
  await page.goto("/games/formation/?test&seed=3");
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "preview");
  await expect(page.locator("#game")).toHaveAttribute("data-sprites", "ready");
  await page.screenshot({ path: "test-results/formation-preview.png" });
  await start(page);
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
  await page.goto("/games/formation/?test&seed=3&k=1000");
  await start(page);
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
  await page.goto("/games/formation/?test&seed=3&queue=3&k=1000");
  await start(page);
  await hook(page, "calm");
  for (const col of [0, 1, 2]) await hook(page, "kill", col);
  await expect.poll(async () => (await data(page)).score).toBeGreaterThan(0);
  expect((await data(page)).queue).toBe(0);
});

test("reaching the target clears the stage and advances", async ({ page }) => {
  await page.goto("/games/formation/?test&seed=3&k=0.001");
  await start(page);
  await hook(page, "calm");
  for (const col of [0, 1, 2, 3, 4]) await hook(page, "kill", col);
  await expect.poll(async () => (await data(page)).phase).toBe("clear");
  await page.waitForTimeout(500);
  await page.keyboard.press(" ");
  await page.waitForTimeout(250);
  expect((await data(page)).phase).toBe("clear"); // results stay readable
  await confirmUntil(page, d => d.stage === 1);
  expect((await data(page)).phase).toBe("preview");
  // Space must not advance, even after the 350 ms guard (mashing fire would skip the next target)
  await page.waitForTimeout(500);
  await page.keyboard.press(" ");
  await page.waitForTimeout(250);
  expect((await data(page)).phase).toBe("preview");
});

test("losing every shield ends the run with a report; Enter restarts", async ({ page }) => {
  await page.goto("/games/formation/?test&seed=3&shields=1");
  await start(page);
  await hook(page, "calm");
  await hook(page, "hitPlayer");
  await expect.poll(async () => (await data(page)).phase).toBe("over");
  await expect(page.locator("#report")).toContainText("ゲームオーバー");
  await page.screenshot({ path: "test-results/formation-over.png" });
  await confirmUntil(page, d => d.phase === "preview");
  expect((await data(page)).shields).toBe(1);
});

test("the panel edits the URL query", async ({ page }) => {
  await page.goto("/games/formation/?test&seed=3");
  const input = page.locator('#params-body input[name="queue"]');
  await expect(input).toHaveValue("5");
  await input.fill("4");
  await page.getByRole("button", { name: "適用して再読み込み" }).click();
  await expect(page).toHaveURL(/queue=4/);
  await expect(page).toHaveURL(/seed=3/);
  await expect(page.locator('#params-body input[name="queue"]')).toHaveValue("4");
  await expect(page.locator("#query")).toContainText("queue=4");
});

test("P pauses and resumes; the hint outline needs no input", async ({ page }) => {
  await page.goto("/games/formation/?test&seed=3");
  await start(page);
  await page.keyboard.press("p");
  await expect(page.locator("#game")).toHaveAttribute("data-paused", "true");
  await page.screenshot({ path: "test-results/formation-paused.png" });
  await page.keyboard.press("p");
  await expect(page.locator("#game")).toHaveAttribute("data-paused", "false");
});

test("hand table lists current values from the query", async ({ page }) => {
  await page.goto("/games/formation/?flush.chips=777");
  await page.locator("#hands-box summary").click();
  await expect(page.locator("#hands")).toContainText("777");
});

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  test("fits without horizontal scroll and shows a large fire button", async ({ page }) => {
    await page.goto("/games/formation/?test&seed=3");
    await expect(page.locator("#game")).toHaveAttribute("data-sprites", "ready");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const fire = page.locator('#pad [data-action="fire"]');
    await expect(fire).toBeVisible();
    const box = (await fire.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(64);
    expect(box.height).toBeGreaterThanOrEqual(56);
    await page.screenshot({ path: "test-results/formation-phone.png" });
  });
});

test("pad buttons work from the keyboard (Tab + Enter), e.g. 決定 starts the stage", async ({ page }) => {
  await page.goto("/games/formation/?test&seed=3");
  await expect(page.locator("#game")).toHaveAttribute("data-phase", "preview");
  await page.waitForTimeout(500); // past the anti-mash guard
  await page.locator('#pad [data-action="confirm"]').focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await data(page)).phase).toBe("play");
  await page.locator('#pad [data-action="pause"]').focus();
  await page.keyboard.press(" ");
  await expect(page.locator("#game")).toHaveAttribute("data-paused", "true");
});
