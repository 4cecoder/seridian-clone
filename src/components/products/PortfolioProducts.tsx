import Link from "next/link";
import { Badge, Button } from "@bytecats/ui-kit";
import { productsByCategory } from "@/data/products";
import { KanbanHero } from "./KanbanHero";
import { ProductGrid } from "./ProductGrid";

/**
 * Portfolio zone: Kanban as the flagship hero, then product cards.
 * `variant="home"` shows only featured products with a link to the full list.
 */
export function PortfolioProducts({ id = "portfolio", variant = "page" }: { id?: string; variant?: "home" | "page" }) {
  const portfolio = productsByCategory("portfolio");
  const others = portfolio.filter((product) => product.id !== "kanban");
  const shown = variant === "home" ? others.filter((product) => product.featured) : others;

  return (
    <section
      id={id}
      aria-labelledby="portfolio-heading"
      className="scroll-mt-24 border-t border-white/5 bg-slate-925 py-24"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 max-w-2xl">
          <Badge
            variant="secondary"
            className="border-white/10 bg-white/5 text-slate-300 uppercase tracking-wider"
          >
            Portfolio
          </Badge>
          <h2 id="portfolio-heading" className="font-display mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
            Portfolio products
          </h2>
          <p className="mt-4 text-slate-400">
            Standalone products, each with its own identity, built for the people who use them
            every day.
          </p>
        </div>

        <KanbanHero />

        <div className="mt-16">
          <p className="mb-6 font-mono text-xs uppercase tracking-wider text-slate-500">More products</p>
          <ProductGrid products={shown} />
        </div>

        {variant === "home" && (
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
        )}
      </div>
    </section>
  );
}
