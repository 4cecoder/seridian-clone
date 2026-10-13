import { CorePlatform } from "./CorePlatform";
import { PortfolioProducts } from "./PortfolioProducts";
import { TierIntro, TierNav } from "./TierIntro";

/** The products view (Seridian apps and Portfolio), used by the home page and /products. */
export function ProductsOverview({ variant }: { variant: "home" | "page" }) {
  return (
    <>
      <TierIntro id="products" />
      <div className="border-b border-white/5 bg-slate-950 pb-10">
        <TierNav />
      </div>
      <CorePlatform />
      <PortfolioProducts variant={variant} />
    </>
  );
}
