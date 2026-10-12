import { Badge } from "@bytecats/ui-kit";
import { productStatusLabels, type ProductStatus } from "@/data/products";

const statusClass: Record<ProductStatus, string> = {
  live: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  beta: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  "in-development": "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  return (
    <Badge variant="outline" className={`${statusClass[status]} text-xs uppercase tracking-wider`}>
      {productStatusLabels[status]}
    </Badge>
  );
}
