import Image from "next/image";
import { Button } from "@bytecats/ui-kit";
import { getProduct } from "@/data/products";
import { StatusBadge } from "./StatusBadge";

const kanban = getProduct("kanban");

const humanPoints = [
  "A calm board for epics, stories, tasks and subtasks, with dependencies between them.",
  "Sprints and a plan view that shows what is ready, blocked and in review.",
  "A changelog generated from finished work.",
];

const agentPoints = [
  "A CLI that agents use to find the next ready card and move it through its status.",
  "Progress notes and comments that stay attached to the card they describe.",
  "Optional GitHub issue sync, with Kanban as the source of truth.",
];

function PointList({ title, points }: { title: string; points: string[] }) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-950/60 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
      <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-seridian-300">{title}</h4>
      <ul className="mt-4 space-y-3">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-300">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-seridian-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
              focusable="false"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Flagship hero card for Kanban, the first Portfolio product. */
export function KanbanHero() {
  return (
    <article
      data-testid="kanban-hero"
      aria-labelledby="kanban-title"
      className="relative overflow-hidden rounded-3xl border border-seridian-500/20 bg-gradient-to-br from-slate-850 via-slate-900 to-slate-950 p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_30px_60px_-24px_rgba(6,182,212,0.25)] md:p-10"
    >
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-seridian-500/30 bg-seridian-500/10 px-3 py-1 font-mono text-xs uppercase tracking-wider text-seridian-300">
              Flagship
            </span>
            {kanban && <StatusBadge status={kanban.status} />}
          </div>
          <h3 id="kanban-title" className="font-display mt-4 text-3xl font-bold tracking-tight text-white md:text-4xl">
            Kanban
          </h3>
          <p className="mt-3 text-lg font-medium text-seridian-200">
            One plan for people and coding agents.
          </p>
          <p className="mt-4 leading-relaxed text-slate-400">
            Turn a clear project scope into epics, tasks, dependencies and sprints. Your team
            plans on the board, and coding agents read the same cards and record their own
            progress, so the plan keeps matching the work.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <PointList title="For people" points={humanPoints} />
            <PointList title="For coding agents" points={agentPoints} />
          </div>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="h-auto w-full rounded-lg bg-seridian-500 px-8 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_8px_24px_-8px_rgba(6,182,212,0.7)] hover:bg-seridian-400 sm:w-auto"
            >
              <a href={kanban?.url ?? "https://kanban.seridian.dev"} target="_blank" rel="noopener noreferrer">
                Try Kanban
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
            <p className="text-sm text-slate-500">Made by Seridian, at kanban.seridian.dev.</p>
          </div>
        </div>

        <div className="relative space-y-4">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.7)]">
            <Image
              src="/products/kanban-hero-desktop.png"
              alt="Kanban project board with Backlog, In progress and Done columns and cards showing priority, due dates and assignees."
              width={1440}
              height={900}
              sizes="(min-width: 1024px) 560px, 100vw"
              className="h-auto w-full"
            />
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.7)]">
            <Image
              src="/products/kanban-product-desktop.png"
              alt="Kanban product section describing planning features for teams."
              width={1280}
              height={1242}
              sizes="(min-width: 1024px) 560px, 100vw"
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </article>
  );
}
