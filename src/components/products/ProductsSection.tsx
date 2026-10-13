import { ProductsOverview } from "./ProductsOverview";

/** Home-page products: the same product lines as /products, with the Portfolio list trimmed. */
export function ProductsSection() {
  return <ProductsOverview variant="home" />;
}
