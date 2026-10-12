import type { Metadata } from "next";
import { Badge } from "@bytecats/ui-kit";
import { ProductGrid } from "@/components/products/ProductGrid";
import { productCategories, productsByCategory } from "@/data/products";

export const metadata: Metadata = {
  title: "Products | Seridian",
  description:
    "Kanban, Seridian's core platform services and our portfolio products, with live status for each.",
  openGraph: {
    title: "Products | Seridian",
    description:
      "Kanban, Seridian's core platform services and our portfolio products, with live status for each.",
    type: "website",
  },
};

export default function ProductsPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-white/5 bg-slate-950 pt-16">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="glow-orb pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[700px] -translate-x-1/2 opacity-50" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-20 md:pb-20 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-6 inline-flex items-center gap-2 rounded-full border-seridian-500/20 bg-seridian-500/5 px-4 py-1.5 text-seridian-300"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-seridian-400" />
              <span className="font-mono text-sm">Products</span>
            </Badge>

            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
              What we build. <span className="gradient-text">What runs today.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
              Our portfolio products and the core Seridian services. Each one shows its status,
              and only products with a public site are marked live.
            </p>
          </div>
        </div>
      </section>

      {productCategories.map((category, index) => {
        const headingId = `${category.id}-products-heading`;
        return (
          <section
            key={category.id}
            aria-labelledby={headingId}
            className={`border-b border-white/5 py-24 ${index % 2 === 0 ? "bg-slate-925" : "bg-slate-950"}`}
          >
            <div className="mx-auto max-w-6xl px-6">
              <div className="mb-10 max-w-2xl">
                <h2 id={headingId} className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {category.label}
                </h2>
                <p className="mt-3 text-slate-400">{category.description}</p>
              </div>
              <ProductGrid products={productsByCategory(category.id)} labelledBy={headingId} />
            </div>
          </section>
        );
      })}
    </>
  );
}
