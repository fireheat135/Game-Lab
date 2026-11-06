import { expect, test, type Page } from "@playwright/test";

// ?test exposes window.__abyssTest (e2e build only); ?seed fixes the swarm and the deck order.
type Hooks = Record<string, (...a: number[]) => unknown>;
const hook = (page: Page, fn: string, ...args: number[]) =>
  page.evaluate(([f, a]) => ((window as unknown as { __abyssTest: Hooks }).__abyssTest[f as string])(...(a as number[])), [fn, args] as const);
const num = async (page: Page, k: string) => Number(await page.locator("#game").getAttribute(`data-${k}`));
const phase = (page: Page) => page.locator("#game").getAttribute("data-phase");

/** Enter until `want` (advancing is ignored for 350 ms after each screen change). */
async function confirmUntil(page: Page, want: string) {
  await expect.poll(async () => { if ((await phase(page)) !== want) await page.keyboard.press("Enter"); return phase(page); }, { intervals: [150] }).toBe(want);
}
async function clearSwarm(page: Page) {
  for (let i = 0; i < 300 && (await phase(page)) === "play"; i++) {
    const col = (await hook(page, "firstColumn")) as number;
    if (col < 0) break;
    await hook(page, "shoot", col);
  }
}

test("desktop: real bullets pop groups; clear → shop → buy → next swarm", async ({ page }) => {
  await page.goto("/games/abyss/?test&seed=5&shotDrop=0&shuffleDrop=0&drift=0");
  await expect(page.locator("#game")).toHaveAttribute("data-sprites", "ready");
  await page.screenshot({ path: "test-results/abyss-preview.png" });
  await confirmUntil(page, "play");
  await hook(page, "calm");
  const alive = await num(page, "alive");
  await page.keyboard.down(" "); await page.waitForTimeout(150); await page.keyboard.up(" ");
  await expect.poll(() => num(page, "alive")).toBeLessThan(alive);
  await page.screenshot({ path: "test-results/abyss-play.png" });

  await clearSwarm(page);
  await expect.poll(() => phase(page)).toBe("clear");
  await confirmUntil(page, "shop");
  await expect(page.locator("#shop")).toBeVisible();
  await hook(page, "gold", 50);
  const deck = await num(page, "deck");
  await page.locator("#shop button").first().click(); // first bullet offer
  await expect.poll(() => num(page, "deck")).toBe(deck + 1);
  await page.screenshot({ path: "test-results/abyss-shop.png" });
  await page.getByRole("button", { name: /次の群れへ潜る/ }).click();
  await expect.poll(() => phase(page)).toBe("preview");
  expect(await num(page, "stage")).toBe(1);
  await expect(page.locator("#shop")).toBeHidden();
});

test("query params change the rules (deck, rows)", async ({ page }) => {
  await page.goto("/games/abyss/?test&seed=5&deck.shot=1&deck.spread=0&deck.pierce=0&deck.bomb=0&rows.1=2");
  expect(await num(page, "deck")).toBe(1);
  expect(await num(page, "alive")).toBe(2 * 7);
});

test("losing all shields ends the run with a report; Enter restarts", async ({ page }) => {
  await page.goto("/games/abyss/?test&seed=5&shields=1");
  await confirmUntil(page, "play");
  await hook(page, "calm");
  await hook(page, "hitPlayer");
  await expect.poll(() => phase(page)).toBe("over");
  await expect(page.locator("#report")).toContainText("ゲームオーバー");
  await confirmUntil(page, "preview");
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("fits the screen, tap starts, drag-and-release fires one shot", async ({ page }) => {
    await page.goto("/games/abyss/?test&seed=5&shotDrop=0&drift=0");
    await expect(page.locator("#game")).toHaveAttribute("data-sprites", "ready");
    const fits = await page.evaluate(() => {
      const pad = document.querySelector("#pad")!.getBoundingClientRect();
      return { noHScroll: document.documentElement.scrollWidth <= innerWidth, padBottom: pad.bottom, vh: innerHeight };
    });
    expect(fits.noHScroll).toBe(true);
    expect(fits.padBottom).toBeLessThanOrEqual(fits.vh); // game + buttons visible without scrolling
    const box = (await page.locator("#game").boundingBox())!;
    await expect.poll(async () => { await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.8); return phase(page); }, { intervals: [400] }).toBe("play");
    await hook(page, "calm");
    const alive = await num(page, "alive");
    // drag from the left to the middle of the swarm, then lift → the ship moves there and fires once
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => num(page, "alive"), { timeout: 5000 }).toBeLessThan(alive);
    await page.screenshot({ path: "test-results/abyss-phone.png" });
  });
});

test("desktop: holding Space fires once (each shot is a decision)", async ({ page }) => {
  await page.goto("/games/abyss/?test&seed=5&shotDrop=0&drift=0&cd=0.05");
  await confirmUntil(page, "play");
  await hook(page, "calm");
  await page.keyboard.down(" "); await page.waitForTimeout(800); await page.keyboard.up(" ");
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __abyssTest: Hooks }).__abyssTest.shots())) as number).toBe(1);
});

test.describe("phone shop", () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });
  test("the dive button is visible without scrolling; repair works", async ({ page }) => {
    await page.goto("/games/abyss/?test&seed=5&shields=3");
    await confirmUntil(page, "play");
    await hook(page, "calm");
    await clearSwarm(page);
    await confirmUntil(page, "shop");
    await hook(page, "gold", 50);
    await hook(page, "damage");
    const dive = page.getByRole("button", { name: /次の群れへ潜る/ });
    await expect(dive).toBeInViewport();
    await page.getByRole("button", { name: /シールド修理/ }).click();
    await expect.poll(() => num(page, "shields")).toBe(3);
    await page.screenshot({ path: "test-results/abyss-phone-shop.png" });
  });
});

test.describe("phone landscape", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  test("the whole game fits the screen height", async ({ page }) => {
    await page.goto("/games/abyss/?test&seed=5");
    await expect(page.locator("#game")).toHaveAttribute("data-sprites", "ready");
    const r = await page.evaluate(() => ({ stage: document.querySelector("#stage")!.getBoundingClientRect().bottom, vh: innerHeight, hscroll: document.documentElement.scrollWidth > innerWidth }));
    expect(r.stage).toBeLessThanOrEqual(r.vh);
    expect(r.hscroll).toBe(false);
    await page.screenshot({ path: "test-results/abyss-landscape.png" });
  });
});
