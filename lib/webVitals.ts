/**
 * Real-user metrics → Google Analytics 4.
 *
 * Lighthouse gives us synthetic mobile/4G profiles. Useful for finding
 * regressions, but it doesn't tell us what the actual visitor on a real
 * Indonesian 3G or a Spanish desktop is experiencing.
 *
 * web-vitals reports the standard Core Web Vitals as they happen:
 *   - LCP: when the largest content element finishes rendering
 *   - CLS: cumulative layout shift over the page lifetime
 *   - INP: responsiveness — slowest interaction during the visit
 *   - FCP: first contentful paint
 *   - TTFB: time-to-first-byte
 *
 * We forward each to GA4 as a custom event with the metric value (in ms or
 * unitless score) and the metric ID for de-duplication. GA already handles
 * the heavy lifting of cohort/segment/percentile analysis.
 *
 * Why ship this instead of running Lighthouse in CI:
 *   - Real network conditions, real devices, real geography
 *   - Lighthouse synthetic LCP says 6.5s — but the median user on a fast
 *     pipe might be 1.2s. We need the real distribution to prioritise.
 *   - GA4 free tier swallows the volume; no infra cost.
 */
import { onCLS, onLCP, onINP, onFCP, onTTFB, type Metric } from "web-vitals";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function report(metric: Metric) {
  if (typeof window === "undefined") return;
  const send = window.gtag;
  if (typeof send !== "function") return;

  send("event", metric.name, {
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    metric_rating: metric.rating, // 'good' | 'needs-improvement' | 'poor'
    non_interaction: true,
  });
}

export function initWebVitals(): void {
  // Each onX call registers a single listener; they fire at most once per page
  // load (CLS/INP can update multiple times — web-vitals batches the latest).
  try {
    onCLS(report);
    onLCP(report);
    onINP(report);
    onFCP(report);
    onTTFB(report);
  } catch (err) {
    // never break the app on telemetry failure
    console.warn("[webVitals] init failed:", err);
  }
}
