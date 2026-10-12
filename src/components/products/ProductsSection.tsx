import Link from "next/link";
import { Badge, Button } from "@bytecats/ui-kit";
import { products } from "@/data/products";
import { KanbanFeature } from "./KanbanFeature";
import { ProductGrid } from "./ProductGrid";

/** Home-page products: Kanban first, then a short teaser of other featured products. */
export function ProductsSection() {
  const teaser = products.filter((product) => product.featured && product.id !== "kanban");

  return (
    <>
      <KanbanFeature />
      <section id="products" aria-labelledby="products-heading" className="border-t border-white/5 bg-slate-925 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge
              variant="secondary"
              className="border-seridian-500/20 bg-seridian-500/10 text-seridian-400 uppercase tracking-wider"
            >
              Products
            </Badge>
            <h2
              id="products-heading"
              className="font-display mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl"
            >
              Products we build and run
            </h2>
            <p className="mt-4 text-slate-400">
              Our own portfolio products and the core services we are building on one shared
              platform, with honest status for each.
            </p>
          </div>

          <div className="mt-16">
            <ProductGrid products={teaser} labelledBy="products-heading" />
          </div>

          <div className="mt-12 flex justify-center">
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-auto rounded-lg border-white/10 bg-white/5 px-8 py-3 text-sm font-semibold text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/products">See all products</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
