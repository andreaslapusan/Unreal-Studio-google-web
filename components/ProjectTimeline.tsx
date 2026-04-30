/**
 * Construction timeline shown on /proyecto/:slug.
 *
 * Pattern lifted from cocodevelopmentgroup.com/aura-wellness-resort —
 * vertical milestone list with payment %, date, description.
 *
 * Data source: `projects.timeline` (jsonb) — array of phases. Falls back
 * to nothing if the column is empty, keeping legacy projects unchanged.
 */
import React from "react";
import { useTranslation } from "react-i18next";

export interface TimelinePhase {
  title: string;
  date?: string;
  payment_pct?: number;
  description?: string;
  status?: "done" | "in_progress" | "pending";
}

interface Props {
  phases: TimelinePhase[];
  /**
   * Auto-derive status from the project's `completion_percent` if individual
   * phases don't set their own. Each phase is "done" when its
   * cumulative-payment marker is below the project's current completion.
   */
  completionPercent?: number;
}

function formatDate(d: string | undefined, lang: string): string {
  if (!d) return "";
  // Accept "YYYY-MM" or "YYYY-MM-DD". Fall back to raw string.
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(d);
  if (!m) return d;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? 1));
  if (isNaN(date.getTime())) return d;
  if (m[3]) {
    return date.toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" });
  }
  return date.toLocaleDateString(lang, { month: "long", year: "numeric" });
}

export default function ProjectTimeline({ phases, completionPercent }: Props) {
  const { t, i18n } = useTranslation();

  if (!phases || phases.length === 0) return null;

  // Derive cumulative payment % at each milestone so we can mark phases as
  // "done" automatically when the project's overall completion crosses them.
  let cumulative = 0;
  const enriched = phases.map((p) => {
    cumulative += p.payment_pct ?? 0;
    const auto =
      typeof completionPercent === "number"
        ? completionPercent >= cumulative
          ? ("done" as const)
          : completionPercent >= cumulative - (p.payment_pct ?? 0)
          ? ("in_progress" as const)
          : ("pending" as const)
        : ("pending" as const);
    return { ...p, status: p.status ?? auto, cumulative };
  });

  return (
    <section className="py-16 md:py-24 px-6 md:px-12 bg-white">
      <div className="max-w-4xl mx-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 mb-3">
          {t("projectTimeline.tag", { defaultValue: "ROADMAP DE OBRA" })}
        </p>
        <h2 className="text-3xl md:text-5xl font-serif text-primary mb-12">
          {t("projectTimeline.title", { defaultValue: "Hitos del proyecto" })}
        </h2>

        <ol className="relative">
          {/* Vertical line */}
          <span
            aria-hidden="true"
            className="absolute left-6 top-2 bottom-2 w-px bg-primary/15"
          />

          {enriched.map((p, i) => (
            <li key={i} className="relative pl-16 pb-10 last:pb-0">
              {/* Milestone dot */}
              <span
                aria-hidden="true"
                className={`absolute left-3 top-2 w-7 h-7 rounded-full flex items-center justify-center border-4 transition ${
                  p.status === "done"
                    ? "bg-primary border-primary text-white"
                    : p.status === "in_progress"
                    ? "bg-amber-100 border-amber-400 text-amber-700"
                    : "bg-white border-primary/30 text-primary/40"
                }`}
              >
                {p.status === "done" ? (
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                ) : (
                  <span className="text-[11px] font-black">{i + 1}</span>
                )}
              </span>

              <div>
                <div className="flex flex-wrap items-baseline gap-3 mb-2">
                  {p.date && (
                    <span className="text-xs font-bold uppercase tracking-widest text-primary/40">
                      {formatDate(p.date, i18n.language)}
                    </span>
                  )}
                  {typeof p.payment_pct === "number" && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-almond px-2 py-1 rounded-full">
                      {p.payment_pct}% {t("projectTimeline.payment", { defaultValue: "pago" })}
                    </span>
                  )}
                  {p.status === "done" && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-green-700">
                      ✓ {t("projectTimeline.done", { defaultValue: "completado" })}
                    </span>
                  )}
                  {p.status === "in_progress" && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                      {t("projectTimeline.inProgress", { defaultValue: "en curso" })}
                    </span>
                  )}
                </div>
                <h3 className="text-xl md:text-2xl font-serif text-primary mb-2">{p.title}</h3>
                {p.description && (
                  <p className="text-sm md:text-base text-primary/70 leading-relaxed max-w-2xl">
                    {p.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
