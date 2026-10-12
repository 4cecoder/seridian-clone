import { Card, CardContent, CardDescription, CardHeader } from "@bytecats/ui-kit";
import type { Product } from "@/data/products";
import { ProductIcon } from "./ProductIcon";
import { StatusBadge } from "./StatusBadge";

/** Portfolio product card: lifts on hover, layered shadow, hairline border. */
export function ProductCard({ product }: { product: Product }) {
  return (
    <Card className="group flex h-full flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-slate-850/70 to-slate-925 p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,0_1px_2px_rgba(0,0,0,0.4),0_12px_24px_-12px_rgba(0,0,0,0.6)] transition duration-300 hover:-translate-y-1 hover:border-seridian-500/30 hover:shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_2px_4px_rgba(0,0,0,0.4),0_24px_48px_-16px_rgba(6,182,212,0.18)] motion-reduce:transition-none motion-reduce:hover:transform-none">
      <CardHeader className="flex-row items-start justify-between gap-3 p-0">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-seridian-500/20 bg-seridian-500/10 text-seridian-400 shadow-[0_0_24px_-6px_rgba(6,182,212,0.5)]">
          <ProductIcon icon={product.icon} className="h-6 w-6" />
        </span>
        <StatusBadge status={product.status} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-0 pt-5">
        <h3 className="font-display text-lg font-semibold text-white">{product.name}</h3>
        <CardDescription className="mt-2 text-sm leading-relaxed text-slate-400">
          {product.value}
        </CardDescription>
        <div className="mt-auto pt-5">
          {product.url ? (
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-seridian-400 outline-none transition-colors hover:text-seridian-300 focus-visible:ring-2 focus-visible:ring-seridian-500/50"
            >
              Visit {product.name}
              <span aria-hidden="true">&rarr;</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <p className="text-sm text-slate-500">Not yet public</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
