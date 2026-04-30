/**
 * Construction timeline — zigzag layout with scroll-triggered reveal.
 *
 * Design lifted from cocodevelopmentgroup.com/aura-wellness-resort:
 *   - Vertical line down the center, dark circular icon badges on it
 *   - Cards alternate left / right ("zigzag")
 *   - Each card fades + slides in from its side when it enters the viewport
 *
 * On mobile (< md), the zigzag collapses into a single left-aligned column
 * with the line shifted to the left edge, so the animation still reads
 * but content stays one-column.
 *
 * Status (done/in_progress/pending) is auto-derived from the project's
 * `completion_percent` if a phase doesn't set its own.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  completionPercent?: number;
}

function formatDate(d: string | undefined, lang: string): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(d);
  if (!m) return d;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? 1));
  if (isNaN(date.getTime())) return d;
  if (m[3]) {
    return date.toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" });
  }
  return date.toLocaleDateString(lang, { month: "long", year: "numeric" });
}

interface PhaseRowProps {
  index: number;
  phase: TimelinePhase & { cumulative: number };
  lang: string;
  paymentLabel: string;
  doneLabel: string;
  inProgressLabel: string;
}

function PhaseRow({ index, phase, lang, paymentLabel, doneLabel, inProgressLabel }: PhaseRowProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const isLeft = index % 2 === 0; // even index → card on left side

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true); // fallback — no animation in old browsers
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const card = (
    <div
      ref={cardRef}
      className={`bg-almond/80 rounded-2xl p-6 md:p-8 shadow-sm border border-primary/5 transition-all duration-700 ease-out ${
        revealed
          ? "opacity-100 translate-x-0"
          : `opacity-0 ${isLeft ? "-translate-x-12" : "translate-x-12"}`
      }`}
    >
      {phase.date && (
        <p className="text-sm md:text-base text-primary/70 mb-1">{phase.title}</p>
      )}
      {!phase.date && (
        <h3 className="text-xl md:text-2xl font-bold text-primary mb-2">{phase.title}</h3>
      )}
      {phase.date && (
        <p className="text-xl md:text-2xl font-bold text-primary mb-3">
          {formatDate(phase.date, lang)}
        </p>
      )}
      {phase.description && (
        <p className="text-sm text-primary/60 leading-relaxed">{phase.description}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-4">
        {typeof phase.payment_pct === "number" && phase.payment_pct > 0 && (
          <span className="text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary px-3 py-1 rounded-full">
            {phase.payment_pct}% {paymentLabel}
          </span>
        )}
        {phase.status === "done" && (
          <span className="text-[10px] font-black uppercase tracking-widest text-green-700 bg-green-50 px-3 py-1 rounded-full">
            ✓ {doneLabel}
          </span>
        )}
        {phase.status === "in_progress" && (
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
            {inProgressLabel}
          </span>
        )}
      </div>
    </div>
  );

  // --- mobile: single column, line on the left
  // --- desktop: alternating columns with center badge
  const badge = (
    <div
      className={`shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center shadow-md transition-all duration-500 ${
        phase.status === "done"
          ? "bg-primary text-white"
          : phase.status === "in_progress"
          ? "bg-amber-500 text-white"
          : "bg-primary/80 text-white"
      } ${revealed ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
    >
      <span className="material-symbols-outlined text-lg md:text-xl">
        {phase.status === "done" ? "check_circle" : "construction"}
      </span>
    </div>
  );

  return (
    <li className="relative">
      {/* Mobile layout: badge + card stacked horizontally with line on the left */}
      <div className="md:hidden flex gap-4 items-start">
        <div className="flex flex-col items-center">{badge}</div>
        <div className="flex-1 pb-12">{card}</div>
      </div>

      {/* Desktop layout: alternating left / right with center badge */}
      <div className="hidden md:grid grid-cols-[1fr_auto_1fr] gap-8 items-start pb-16">
        <div className={isLeft ? "" : "invisible"}>{isLeft && card}</div>
        <div className="flex flex-col items-center">{badge}</div>
        <div className={isLeft ? "invisible" : ""}>{!isLeft && card}</div>
      </div>
    </li>
  );
}

function useScrollProgress(elRef: React.RefObject<HTMLElement>) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let raf = 0;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // Start filling when the section's top reaches 70% of the viewport;
      // finish when it reaches 30%. That window keeps the line tied to
      // the user's reading pace rather than the absolute scroll position.
      const start = vh * 0.7;
      const end = vh * 0.3;
      // distance from "start" line to top of section. 0 = section top is at
      // the start line, negative = above (already past), positive = below
      // (not yet reached).
      const passed = start - rect.top;
      const span = rect.height + (start - end);
      const p = Math.max(0, Math.min(1, passed / span));
      setProgress(p);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return progress;
}

export default function ProjectTimeline({ phases, completionPercent }: Props) {
  const { t, i18n } = useTranslation();
  const olRef = useRef<HTMLOListElement>(null);
  const lineProgress = useScrollProgress(olRef);

  const enriched = useMemo(() => {
    if (!phases) return [];
    let cumulative = 0;
    return phases.map((p) => {
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
  }, [phases, completionPercent]);

  if (!phases || phases.length === 0) return null;

  return (
    <section className="py-16 md:py-28 px-6 md:px-12 bg-white">
      <div className="max-w-6xl mx-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 mb-3 text-center">
          {t("projectTimeline.tag", { defaultValue: "ROADMAP DE OBRA" })}
        </p>
        <h2 className="text-3xl md:text-5xl lg:text-6xl font-serif text-primary mb-16 md:mb-20 text-center">
          {t("projectTimeline.title", { defaultValue: "Hitos del proyecto" })}
        </h2>

        <ol ref={olRef} className="relative">
          {/* Static background line */}
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 w-px bg-primary/15 left-6 md:left-1/2 md:-translate-x-1/2"
          />
          {/* Animated foreground line — draws downward as user scrolls */}
          <span
            aria-hidden="true"
            className="absolute top-2 w-[2px] bg-primary left-6 md:left-1/2 md:-translate-x-1/2 transition-[height] duration-150 ease-out"
            style={{ height: `calc((100% - 1rem) * ${lineProgress})` }}
          />

          {enriched.map((p, i) => (
            <PhaseRow
              key={i}
              index={i}
              phase={p}
              lang={i18n.language}
              paymentLabel={t("projectTimeline.payment", { defaultValue: "pago" })}
              doneLabel={t("projectTimeline.done", { defaultValue: "completado" })}
              inProgressLabel={t("projectTimeline.inProgress", { defaultValue: "en curso" })}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}
