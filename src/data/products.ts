/**
 * Seridian product showcase: Kanban, the core Seridian services and the
 * portfolio products.
 *
 * Facts only. A product is `live` when its public URL returned HTTP 200 when
 * this list was last checked (see PRODUCTS_CHECKED_ON). Everything else is
 * labelled honestly as `beta` or `in-development`. Do not add customers,
 * metrics, testimonials or prices here.
 */

export const PRODUCTS_CHECKED_ON = "2026-10-12";

export type ProductCategory = "core" | "portfolio";

export type ProductStatus = "live" | "beta" | "in-development";

/** Key used to pick an inline icon in ProductIcon. */
export type ProductIconKey =
  | "board"
  | "lock"
  | "chat"
  | "mail"
  | "calendar"
  | "signature"
  | "docs"
  | "pen"
  | "rocket"
  | "flow"
  | "building"
  | "package"
  | "wrench"
  | "pulse"
  | "video"
  | "pin"
  | "shield"
  | "paw";

export interface Product {
  /** Stable id, used for React keys and anchors. */
  id: string;
  name: string;
  /** One-line value statement. */
  value: string;
  status: ProductStatus;
  /** Public https URL. Required when status is `live`; omitted otherwise. */
  url?: string;
  category: ProductCategory;
  icon: ProductIconKey;
  /** Shown in the home-page teaser. Kanban is the flagship and is shown as a hero. */
  featured?: boolean;
  /** The sign-in and identity layer every Core service sits on. */
  foundation?: boolean;
}

/** The shared Core base that every Core service runs on. Not a sellable product. */
export const platformBase = {
  name: "Shared backend",
  value: "One backend for Seridian services: identity, Kanban and the core lanes.",
  status: "in-development" as ProductStatus,
};

export const products: Product[] = [
  // Portfolio
  {
    id: "kanban",
    name: "Kanban",
    value:
      "Plan epics, stories, dependencies and sprints on one board that people and coding agents both update.",
    status: "live",
    url: "https://kanban.seridian.dev",
    category: "portfolio",
    icon: "board",
  },
  {
    id: "property-portal",
    name: "Property Portal",
    value: "Maintenance ledger for landlords, tenants and technicians.",
    status: "live",
    url: "https://propertyportal.pro",
    category: "portfolio",
    icon: "building",
    featured: true,
  },
  {
    id: "pack-n-pick",
    name: "Pack n Pick",
    value:
      "Warehouse pick and pack: scan-to-confirm picking, packing, shipping and bin inventory.",
    status: "live",
    url: "https://packnpick.netlify.app",
    category: "portfolio",
    icon: "package",
    featured: true,
  },
  {
    id: "i-you-fix-it",
    name: "i-you-fix-it",
    value:
      "Construction punch lists: walk a building, photograph deficiencies, assign contractors and verify fixes.",
    status: "live",
    url: "https://iyoufixit.netlify.app",
    category: "portfolio",
    icon: "wrench",
  },
  {
    id: "pitline",
    name: "Pitline",
    value:
      "City and county issue desk: residents report street problems with GPS and crews work a dispatch board.",
    status: "live",
    url: "https://pitline-app.netlify.app",
    category: "portfolio",
    icon: "pin",
    featured: true,
  },
  {
    id: "seridian-vpn",
    name: "Seridian VPN",
    value:
      "Multi-tenant VPN service with managed or self-hosted nodes and a protocol builder.",
    status: "live",
    url: "https://seridian-vpn.netlify.app",
    category: "portfolio",
    icon: "shield",
  },
  {
    id: "petdocs",
    name: "PetDocs",
    value: "Pet document vault and care sharing.",
    status: "in-development",
    category: "portfolio",
    icon: "paw",
  },
  {
    id: "vaylo",
    name: "Vaylo",
    value: "AI video generation.",
    status: "in-development",
    category: "portfolio",
    icon: "video",
  },

  // Core Seridian services
  {
    id: "seridian-auth",
    name: "Seridian Auth",
    value:
      "Hosted white-label authentication: passwordless sign-in, passkeys, organizations and audit trails.",
    status: "live",
    url: "https://auth.seridian.dev",
    category: "core",
    icon: "lock",
    featured: true,
    foundation: true,
  },
  {
    id: "usermon",
    name: "Usermon",
    value: "Real-user and API monitoring across web, Android and iOS.",
    status: "live",
    url: "https://usermon-128.netlify.app",
    category: "core",
    icon: "pulse",
  },
  {
    id: "seridian-chat",
    name: "Seridian Chat",
    value: "Team chat with channels, direct messages, threads and search.",
    status: "in-development",
    category: "core",
    icon: "chat",
  },
  {
    id: "seridian-mail",
    name: "Seridian Mail",
    value: "Hosted email on your own domain.",
    status: "in-development",
    category: "core",
    icon: "mail",
  },
  {
    id: "seridian-sched",
    name: "Seridian Sched",
    value: "Shareable booking pages and appointment coordination.",
    status: "in-development",
    category: "core",
    icon: "calendar",
  },
  {
    id: "seridian-sign",
    name: "Seridian Sign",
    value: "Prepare, send and track electronic signatures.",
    status: "in-development",
    category: "core",
    icon: "signature",
  },
  {
    id: "seridian-docs",
    name: "Seridian Docs",
    value: "Shared documents and team knowledge in one place.",
    status: "in-development",
    category: "core",
    icon: "docs",
  },
  {
    id: "seridian-blog",
    name: "Seridian Blog",
    value: "Publish articles and updates for your audience.",
    status: "in-development",
    category: "core",
    icon: "pen",
  },
  {
    id: "seridian-deploy",
    name: "Seridian Deploy",
    value: "Git-push deploys, preview environments and custom domains.",
    status: "in-development",
    category: "core",
    icon: "rocket",
  },
  {
    id: "seridian-automations",
    name: "Seridian Automations",
    value: "Connect apps and build workflows that run routine work.",
    status: "in-development",
    category: "core",
    icon: "flow",
  },
];

export const productCategories: { id: ProductCategory; label: string; description: string }[] = [
  {
    id: "portfolio",
    label: "Portfolio",
    description: "Products Seridian has built and runs for itself and for clients.",
  },
  {
    id: "core",
    label: "Core services",
    description: "The shared platform services Seridian is building on one backend.",
  },
];

export const productStatusLabels: Record<ProductStatus, string> = {
  live: "Live",
  beta: "Beta",
  "in-development": "In development",
};

/** Kanban is shown first wherever products are listed. */
export function productsByCategory(category: ProductCategory): Product[] {
  return products.filter((product) => product.category === category);
}

export function getProduct(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}
