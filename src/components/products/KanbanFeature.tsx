import Image from "next/image";
import { Badge, Button } from "@bytecats/ui-kit";
import { StatusBadge } from "./StatusBadge";
import { getProduct } from "@/data/products";

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
    <div className="rounded-xl border border-white/5 bg-slate-925/50 p-6">
      <h3 className="font-display text-base font-semibold text-white">{title}</h3>
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

export function KanbanFeature() {
  return (
    <section
      id="kanban"
      aria-labelledby="kanban-heading"
      className="border-t border-white/5 bg-slate-950 py-24"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="secondary"
                className="border-seridian-500/20 bg-seridian-500/10 text-seridian-400 uppercase tracking-wider"
              >
                Featured product
              </Badge>
              {kanban && <StatusBadge status={kanban.status} />}
            </div>
            <h2
              id="kanban-heading"
              className="font-display mt-4 text-3xl font-bold tracking-tight text-white md:text-4xl"
            >
              Kanban: one plan for people and coding agents
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-400">
              Turn a clear project scope into epics, tasks, dependencies and sprints. Your team
              plans on the board, and coding agents read the same cards and record their own
              progress, so the plan keeps matching the work.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <PointList title="For people" points={humanPoints} />
              <PointList title="For coding agents" points={agentPoints} />
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="h-auto w-full rounded-lg bg-seridian-500 px-8 py-3.5 text-sm font-semibold text-slate-950 hover:bg-seridian-400 sm:w-auto"
              >
                <a href={kanban?.url ?? "https://kanban.seridian.dev"} target="_blank" rel="noopener noreferrer">
                  Try Kanban
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
              <p className="text-sm text-slate-500">Kanban is made by Seridian and runs at kanban.seridian.dev.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/40">
              <Image
                src="/products/kanban-hero-desktop.png"
                alt="Kanban project board with Backlog, In progress and Done columns and cards showing priority, due dates and assignees."
                width={1440}
                height={900}
                sizes="(min-width: 1024px) 560px, 100vw"
                className="h-auto w-full"
              />
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
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
      </div>
    </section>
  );
}
