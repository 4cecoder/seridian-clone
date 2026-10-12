/** One-strip explanation of the two tiers, plus the in-page tier switch. */
export function TierIntro({ id }: { id?: string }) {
  return (
    <section
      id={id}
      aria-labelledby="tier-intro-heading"
      className="scroll-mt-24 border-t border-white/5 bg-slate-950 py-12"
    >
      <div className="mx-auto max-w-6xl px-6">
        <h2 id="tier-intro-heading" className="sr-only">
          How our products are organised
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex gap-4 rounded-2xl border border-seridian-500/20 bg-gradient-to-br from-seridian-500/10 to-transparent p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset]">
            <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-seridian-500/15 font-mono text-sm font-bold text-seridian-300">
              C
            </span>
            <p className="text-sm leading-relaxed text-slate-300">
              <span className="font-display font-semibold text-white">Seridian Core is the platform.</span>{" "}
              One account across every service, signed in through Seridian Auth, with many apps
              built on it.
            </p>
          </div>
          <div className="flex gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
            <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 font-mono text-sm font-bold text-slate-300">
              P
            </span>
            <p className="text-sm leading-relaxed text-slate-300">
              <span className="font-display font-semibold text-white">Portfolio is standalone products and builds.</span>{" "}
              Each one is its own product with its own identity. Some are built on Core.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Segmented in-page switch between the two tiers. */
export function TierNav() {
  const links = [
    { href: "#core", label: "Core" },
    { href: "#portfolio", label: "Portfolio" },
  ];
  return (
    <nav aria-label="Product tiers" className="flex justify-center">
      <ul className="inline-flex rounded-full border border-white/10 bg-slate-900/80 p-1 shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)]">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="block rounded-full px-5 py-2 text-sm font-medium text-slate-300 outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-seridian-500/50"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
