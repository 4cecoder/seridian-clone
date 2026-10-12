import type { Product } from "@/data/products";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products, labelledBy }: { products: Product[]; labelledBy?: string }) {
  return (
    <ul
      data-product-grid
      aria-labelledby={labelledBy}
      className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {products.map((product) => (
        <li key={product.id} className="flex flex-col">
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
