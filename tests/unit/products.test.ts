import { describe, expect, it } from "vitest";
import {
  getProduct,
  productCategories,
  productStatusLabels,
  productsByCategory,
  products,
  type ProductStatus,
} from "../../src/data/products";

const validStatuses: ProductStatus[] = ["live", "beta", "in-development"];
const validCategories = productCategories.map((category) => category.id);

describe("products data", () => {
  it("has unique ids", () => {
    const ids = products.map((product) => product.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only valid statuses and categories", () => {
    for (const product of products) {
      expect(validStatuses).toContain(product.status);
      expect(validCategories).toContain(product.category);
      expect(productStatusLabels[product.status]).toBeTruthy();
    }
  });

  it("gives every live product a public https URL", () => {
    const live = products.filter((product) => product.status === "live");
    expect(live.length).toBeGreaterThan(0);
    for (const product of live) {
      expect(product.url, product.id).toBeDefined();
      const url = new URL(product.url as string);
      expect(url.protocol, product.id).toBe("https:");
      expect(url.hostname, product.id).not.toBe("");
    }
  });

  it("gives every product URL, when present, an https URL", () => {
    for (const product of products.filter((item) => item.url)) {
      expect(new URL(product.url as string).protocol, product.id).toBe("https:");
    }
  });

  it("features Kanban first in the portfolio with its live URL", () => {
    const portfolio = productsByCategory("portfolio");
    expect(portfolio[0].id).toBe("kanban");
    expect(getProduct("kanban")).toMatchObject({
      status: "live",
      url: "https://kanban.seridian.dev",
    });
  });

  it("lists the core services named in the product plan", () => {
    const core = productsByCategory("core").map((product) => product.name);
    for (const name of [
      "Seridian Auth",
      "Seridian Chat",
      "Seridian Mail",
      "Seridian Sched",
      "Seridian Sign",
      "Seridian Docs",
      "Seridian Blog",
      "Seridian Deploy",
      "Seridian Automations",
    ]) {
      expect(core).toContain(name);
    }
  });

  it("does not invent prices, percentages or customer counts in product copy", () => {
    for (const product of products) {
      expect(product.value, product.id).not.toMatch(/\$|%|\d\+?\s*(customers|users|clients)/i);
    }
  });
});
