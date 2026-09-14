"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "\u2302" },
  { href: "/dashboard/issues", label: "Issues", icon: "\u2610" },
  { href: "/dashboard/clients", label: "Clients", icon: "\u25CE" },
  { href: "/dashboard/bookings", label: "Bookings", icon: "\u25F7" },
  { href: "/dashboard/sales", label: "Sales", icon: "\u25AD" },
  { href: "/dashboard/proposals", label: "Proposals", icon: "\u229E" },
  { href: "/dashboard/templates", label: "Templates", icon: "\u2709" },
  { href: "/dashboard/files", label: "Files", icon: "\u{1F4C4}" },
  { href: "/dashboard/sync", label: "Sync", icon: "\u21BB" },
  { href: "/dashboard/chat", label: "Chat", icon: "\u{1F4AC}" },
];

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <nav
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-white/5 bg-slate-950 transition-transform duration-300 ease-in-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        role="navigation"
        aria-label="Mobile navigation"
      >
        <div className="flex h-14 items-center justify-between border-b border-white/5 px-4">
          <Link href="/" className="flex items-center gap-2.5" onClick={onClose}>
            <span
              aria-label="Seridian logo"
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-white/10"
            >
              <img
                src="/assets/images/seridian-logo-sm.gif"
                alt=""
                className="h-full w-full object-contain"
                aria-hidden="true"
              />
            </span>
            <span className="font-display text-base font-semibold tracking-tight text-white">
              Seridian
            </span>
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
            aria-label="Close navigation"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-0.5 px-2 py-3">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors min-h-[44px]",
                  isActive
                    ? "bg-seridian-500/10 text-seridian-400"
                    : "text-slate-400 hover:bg-white/5 hover:text-white",
                )}
                onClick={onClose}
              >
                <span className="text-base shrink-0" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
