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

  it("places every product in the right tier", () => {
    const core = productsByCategory("core").map((product) => product.id).sort();
    const portfolio = productsByCategory("portfolio").map((product) => product.id).sort();
    expect(core).toEqual(
      [
        "seridian-auth",
        "seridian-chat",
        "seridian-mail",
        "seridian-sched",
        "seridian-sign",
        "seridian-docs",
        "seridian-blog",
        "seridian-deploy",
        "seridian-automations",
        "usermon",
      ].sort(),
    );
    expect(portfolio).toEqual(
      [
        "kanban",
        "property-portal",
        "petdocs",
        "vaylo",
        "pitline",
        "pack-n-pick",
        "i-you-fix-it",
        "seridian-vpn",
      ].sort(),
    );
    expect(core.length + portfolio.length).toBe(products.length);
  });

  it("marks exactly one foundation, and it is a Core service", () => {
    const foundations = products.filter((product) => product.foundation);
    expect(foundations.map((product) => product.id)).toEqual(["seridian-auth"]);
    expect(foundations[0].category).toBe("core");
  });

  it("@regression SER-11 public product copy does not describe internal architecture", () => {
    // Founder 2026-10-12: don't publish backend/infrastructure details on the marketing site.
    const forbidden = /shared backend|one backend|base layer|core lanes|convex/i;
    const copy = [
      ...products.flatMap((product) => [product.name, product.value]),
      ...productCategories.map((category) => `${category.label} ${category.description}`),
    ].join("\n");
    expect(copy).not.toMatch(forbidden);
  });
});
