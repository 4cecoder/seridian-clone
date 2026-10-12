import { expect, test } from "@playwright/test";
import { products } from "../../src/data/products";

test.describe("home products section", () => {
  test("shows Kanban featured with a Try Kanban CTA and loaded screenshots", async ({ page }) => {
    await page.goto("/");
    const kanban = page.locator("#kanban");
    await expect(kanban.getByRole("heading", { level: 2 })).toContainText("Kanban");

    const cta = kanban.getByRole("link", { name: /Try Kanban/ });
    await expect(cta).toHaveAttribute("href", "https://kanban.seridian.dev");
    await expect(cta).toHaveAttribute("target", "_blank");
    await expect(cta).toHaveAttribute("rel", /noopener/);

    const screenshot = kanban.getByRole("img", { name: /Kanban project board/ });
    await screenshot.scrollIntoViewIfNeeded();
    await expect(screenshot).toBeVisible();
    await expect
      .poll(() => screenshot.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  });

  test("links to the full products page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "See all products" }).click();
    await expect(page).toHaveURL(/\/products$/);
  });
});

test.describe("products page", () => {
  test("lists every product with a status badge and sections for each category", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Portfolio", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Core services", level: 2 })).toBeVisible();

    for (const product of products) {
      await expect(page.getByRole("heading", { name: product.name, level: 3 })).toBeVisible();
    }

    const liveCount = products.filter((product) => product.status === "live").length;
    await expect(page.getByText("Live", { exact: true })).toHaveCount(liveCount);
  });

  test("opens live product links in a new tab with safe rel", async ({ page }) => {
    await page.goto("/products");
    const link = page.getByRole("link", { name: /Visit Kanban/ });
    await expect(link).toHaveAttribute("href", "https://kanban.seridian.dev");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("is keyboard reachable", async ({ page }) => {
    await page.goto("/products");
    const link = page.getByRole("link", { name: /Visit Kanban/ });
    await link.focus();
    await expect(link).toBeFocused();
    await expect(link).toBeVisible();
  });

  test("gives every card in a section the same width at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/products");
    const sections = page.locator("section ul");
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let s = 0; s < count; s++) {
      const widths = await sections
        .nth(s)
        .locator(":scope > li > *")
        .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().width)));
      expect(widths.length).toBeGreaterThan(0);
      expect(new Set(widths).size, `section ${s} widths ${widths.join(",")}`).toBe(1);
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
