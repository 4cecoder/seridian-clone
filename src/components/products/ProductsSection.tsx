import { ProductsOverview } from "./ProductsOverview";

/** Home-page products: the same two tiers as /products, with the Portfolio list trimmed. */
export function ProductsSection() {
  return <ProductsOverview variant="home" />;
}
