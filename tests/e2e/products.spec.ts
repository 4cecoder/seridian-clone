import { expect, test, type Page } from "@playwright/test";
import { products } from "../../src/data/products";

const tierNav = (page: Page) => page.getByRole("navigation", { name: "Product tiers" });

test.describe("home products section", () => {
  test("shows both tiers with their headings", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#core").getByRole("heading", { level: 2, name: "Core platform" })).toBeVisible();
    await expect(page.locator("#portfolio").getByRole("heading", { level: 2, name: "Portfolio products" })).toBeVisible();
  });

  test("shows the Kanban flagship card with a Try Kanban CTA and loaded screenshot", async ({ page }) => {
    await page.goto("/");
    const flagship = page.locator("#portfolio").getByTestId("kanban-hero");
    await expect(flagship.getByRole("heading", { level: 3, name: "Kanban" })).toBeVisible();

    const cta = flagship.getByRole("link", { name: /Try Kanban/ });
    await expect(cta).toHaveAttribute("href", "https://kanban.seridian.dev");
    await expect(cta).toHaveAttribute("target", "_blank");
    await expect(cta).toHaveAttribute("rel", /noopener/);

    const screenshot = flagship.getByRole("img", { name: /Kanban project board/ });
    await screenshot.scrollIntoViewIfNeeded();
    await expect
      .poll(() => screenshot.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  });

  test("anchor nav moves to the Portfolio zone", async ({ page }) => {
    await page.goto("/");
    await tierNav(page).getByRole("link", { name: "Portfolio" }).click();
    await expect(page).toHaveURL(/#portfolio$/);
    await expect(page.locator("#portfolio")).toBeInViewport();
  });

  test("links to the full products page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "See all products" }).click();
    await expect(page).toHaveURL(/\/products$/, { timeout: 30_000 });
  });
});

test.describe("products page", () => {
  test("shows both tiers, a tier nav, and every product", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(tierNav(page)).toBeVisible();
    await expect(page.locator("#core").getByRole("heading", { level: 2, name: "Core platform" })).toBeVisible();
    await expect(page.locator("#portfolio").getByRole("heading", { level: 2, name: "Portfolio products" })).toBeVisible();

    for (const product of products) {
      await expect(page.getByRole("heading", { name: product.name, level: 3 })).toBeVisible();
    }

    const liveCount = products.filter((product) => product.status === "live").length;
    await expect(page.getByText("Live", { exact: true })).toHaveCount(liveCount);
  });

  test("tier nav scrolls to each zone", async ({ page }) => {
    await page.goto("/products");
    await tierNav(page).getByRole("link", { name: "Core" }).click();
    await expect(page).toHaveURL(/#core$/);
    await expect(page.locator("#core")).toBeInViewport();

    await tierNav(page).getByRole("link", { name: "Portfolio" }).click();
    await expect(page).toHaveURL(/#portfolio$/);
    await expect(page.locator("#portfolio")).toBeInViewport();
  });

  test("opens live product links in a new tab with safe rel", async ({ page }) => {
    await page.goto("/products");
    const link = page.locator("#portfolio").getByRole("link", { name: /Try Kanban/ });
    await expect(link).toHaveAttribute("href", "https://kanban.seridian.dev");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("gives every card in a zone grid the same width at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/products");
    const grids = page.locator("ul[data-product-grid]");
    const count = await grids.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let g = 0; g < count; g++) {
      const widths = await grids
        .nth(g)
        .locator(":scope > li > *")
        .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().width)));
      expect(widths.length).toBeGreaterThan(0);
      expect(new Set(widths).size, `grid ${g} widths ${widths.join(",")}`).toBe(1);
    }
  });

  test("has no horizontal page scroll", async ({ page }) => {
    await page.goto("/products");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
