import { Card, CardContent, CardDescription, CardHeader } from "@bytecats/ui-kit";
import type { Product } from "@/data/products";
import { ProductIcon } from "./ProductIcon";
import { StatusBadge } from "./StatusBadge";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Card className="card-glow group flex h-full flex-col rounded-xl border-white/5 bg-slate-850/30 p-6 transition-all hover:border-seridian-500/20">
      <CardHeader className="flex-row items-start justify-between gap-3 p-0">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-seridian-500/10 text-seridian-400">
          <ProductIcon icon={product.icon} />
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
