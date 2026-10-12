import type { ProductIconKey } from "@/data/products";

const paths: Record<ProductIconKey, string[]> = {
  board: ["M4 5h4v14H4z", "M10 5h4v9h-4z", "M16 5h4v6h-4z"],
  lock: ["M6 11h12v9H6z", "M8 11V7a4 4 0 0 1 8 0v4"],
  chat: ["M4 5h16v11H9l-5 4z"],
  mail: ["M3 6h18v12H3z", "M3 7l9 6 9-6"],
  calendar: ["M4 5h16v15H4z", "M4 10h16", "M8 3v4", "M16 3v4"],
  signature: ["M4 18c3-6 4-10 6-10s0 8 2 8 3-4 4-4 1 2 4 2"],
  docs: ["M6 3h9l4 4v14H6z", "M9 12h7", "M9 16h7"],
  pen: ["M4 20l4-1L19 8l-3-3L5 16z"],
  rocket: ["M12 3c3 2 4 6 4 10l-4 4-4-4c0-4 1-8 4-10z", "M8 15l-3 3", "M16 15l3 3"],
  flow: ["M4 6h5v5H4z", "M15 13h5v5h-5z", "M9 8.5h3a3 3 0 0 1 3 3v1.5"],
  building: ["M4 21h16", "M6 21V5h9v16", "M15 10h3v11", "M9 9h2", "M9 13h2", "M9 17h2"],
  package: ["M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z", "M3 7.5l9 4.5 9-4.5", "M12 12v9"],
  wrench: ["M14 6a4 4 0 0 0 4 4l-8 8a2 2 0 0 1-4-4l8-8z"],
  pulse: ["M3 13h4l3-7 4 14 3-7h4"],
  video: ["M3 6h12v12H3z", "M15 10l6-3v10l-6-3"],
  pin: ["M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z", "M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  shield: ["M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z"],
  paw: ["M8 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M16 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M12 19c-3 0-4-2-4-3.5S9.5 13 12 13s4 1.5 4 2.5S15 19 12 19z"],
};

export function ProductIcon({ icon, className }: { icon: ProductIconKey; className?: string }) {
  return (
    <svg
      className={className ?? "h-6 w-6"}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[icon].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
