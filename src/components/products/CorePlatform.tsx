import { Badge } from "@bytecats/ui-kit";
import { productsByCategory, type Product } from "@/data/products";
import { ProductIcon } from "./ProductIcon";
import { StatusBadge } from "./StatusBadge";

function ModuleTile({ product }: { product: Product }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-gradient-to-b from-slate-850/70 to-slate-925 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,0_10px_20px_-12px_rgba(0,0,0,0.6)] transition duration-300 hover:-translate-y-0.5 hover:border-seridian-500/25 motion-reduce:transition-none">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-seridian-500/10 text-seridian-400">
          <ProductIcon icon={product.icon} className="h-5 w-5" />
        </span>
        <StatusBadge status={product.status} />
      </div>
      <h3 className="font-display mt-4 text-base font-semibold text-white">{product.name}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{product.value}</p>
      <div className="mt-auto pt-4">
        {product.url ? (
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-seridian-400 outline-none hover:text-seridian-300 focus-visible:ring-2 focus-visible:ring-seridian-500/50"
          >
            Visit {product.name}
            <span aria-hidden="true">&rarr;</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <p className="text-sm text-slate-500">Not yet public</p>
        )}
      </div>
    </div>
  );
}

/** Seridian apps: every app shown as its own product, side by side. */
export function CorePlatform({ id = "core" }: { id?: string }) {
  const apps = productsByCategory("core");

  return (
    <section
      id={id}
      aria-labelledby="core-heading"
      className="relative scroll-mt-24 overflow-hidden border-t border-white/5 bg-slate-950 py-24"
    >
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
      <div className="glow-orb pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 opacity-40" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="secondary"
            className="border-seridian-500/30 bg-seridian-500/10 text-seridian-300 uppercase tracking-wider"
          >
            Seridian
          </Badge>
          <h2 id="core-heading" className="font-display mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
            Seridian apps
          </h2>
          <p className="mt-4 text-slate-400">
            Sign-in, chat, mail, scheduling, signatures, docs and more: everyday apps for
            running a team. Each app shows its own status.
          </p>
        </div>

        <div className="mt-14 rounded-3xl border border-seridian-500/15 bg-slate-900/60 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,0_40px_80px_-32px_rgba(6,182,212,0.25)] md:p-10">
          <p className="font-mono text-xs uppercase tracking-wider text-slate-500">Apps</p>
          <ul data-product-grid className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((product) => (
              <li key={product.id} className="flex flex-col">
                <ModuleTile product={product} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
