export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/5 bg-slate-950 py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2.5">
            <span
              aria-label="Seridian logo"
              className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-white/10"
            >
              <img
                src="/assets/images/seridian-logo-sm.gif"
                alt=""
                className="h-full w-full object-contain"
                aria-hidden="true"
              />
            </span>
            <span className="font-display text-sm font-semibold text-white">Seridian</span>
          </div>

          <p className="text-sm text-slate-500">
            Cloud infrastructure & application development consulting.
          </p>

          <p className="text-sm text-slate-600">
            &copy; {currentYear} Seridian. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}