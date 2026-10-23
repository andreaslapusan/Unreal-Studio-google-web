/**
 * /faq — Public FAQ page.
 *
 * Reads all is_published rows from public.faqs (RLS allows anon select).
 * Client-side search + category filter. Each question is a <details>
 * element so the page is keyboard-accessible and works without JS.
 *
 * Categories are stored as canonical Spanish slugs ('compra', 'leasehold', …)
 * and rendered via the translation table — keeps DB clean while letting us
 * show localized labels.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePageMeta } from "../components/PageMeta";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { readSWR, writeSWR } from "../lib/swrCache";

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[] | null;
  project_filter: string[] | null;
  sort_order: number;
}

const ALL = "__all__";

const CATEGORY_ORDER = [
  "compra",
  "leasehold",
  "construccion",
  "alquiler",
  "fiscalidad",
  "legal",
  "general",
];

// Tiny markdown stub: bold + line breaks + bullet list items. We don't load
// a full markdown lib for ~100KB of payload — this covers the formatting
// Andreas actually uses in answers.
function renderAnswer(text: string): React.ReactNode {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trimStart();
        const indent = line.length - trimmed.length;
        const bullet = trimmed.startsWith("- ");
        const html = bullet ? trimmed.slice(2) : trimmed;
        // Inline bold: **foo**
        const parts = html.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          /^\*\*[^*]+\*\*$/.test(part) ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : (
            <React.Fragment key={j}>{part}</React.Fragment>
          )
        );
        if (bullet) {
          return (
            <li key={i} style={{ marginLeft: indent }}>
              {parts}
            </li>
          );
        }
        if (!trimmed) return <br key={i} />;
        return (
          <p key={i} className="mb-2">
            {parts}
          </p>
        );
      })}
    </>
  );
}

export default function Faq() {
  const { t, i18n } = useTranslation();
  usePageMeta({ title: t('faq.title'), description: t('faq.metaDescription') });
  const [faqs, setFaqs] = useState<FaqRow[]>(() => readSWR<FaqRow[]>("faqs_published") ?? []);
  const [loading, setLoading] = useState<boolean>(() => (readSWR<FaqRow[]>("faqs_published") ?? []).length === 0);
  const [category, setCategory] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.title = t("faq.title");
  }, [t]);

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("faqs")
          .select("id, question, answer, category, tags, project_filter, sort_order")
          .eq("is_published", true)
          .eq("language", (["en", "id", "ro"].includes((i18n.language || 'es').slice(0, 2)) ? (i18n.language || 'es').slice(0, 2) : "es"))
          .order("sort_order", { ascending: true });
        if (!error && data) {
          // Fallback: si no hay filas en el idioma actual, mostrar ES (para
          // cualquier idioma no-ES cuya traducción aún no esté cargada).
          if (data.length === 0 && (i18n.language || 'es').slice(0, 2) !== "es") {
            const { data: esData } = await supabase
              .from("faqs")
              .select("id, question, answer, category, tags, project_filter, sort_order")
              .eq("is_published", true)
              .eq("language", "es")
              .order("sort_order", { ascending: true });
            if (esData) {
              setFaqs(esData as FaqRow[]);
              writeSWR("faqs_published", esData);
            }
          } else {
            setFaqs(data as FaqRow[]);
            writeSWR("faqs_published", data);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [i18n.language]);

  const categories = useMemo(() => {
    const present = new Set(faqs.map((f) => f.category));
    return [ALL, ...CATEGORY_ORDER.filter((c) => present.has(c))];
  }, [faqs]);

  // JSON-LD FAQPage: habilita resultados enriquecidos (acordeón) en Google.
  useEffect(() => {
    if (!faqs.length) return;
    const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const schema = {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faqs.slice(0, 50).map((f) => ({
        '@type': 'Question', name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: strip(f.answer) },
      })),
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.setAttribute('data-faq-ld', '1');
    el.textContent = JSON.stringify(schema);
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [faqs]);

  const filtered = useMemo(() => {
    let result = faqs;
    if (category !== ALL) result = result.filter((f) => f.category === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (f) =>
          f.question.toLowerCase().includes(q) ||
          f.answer.toLowerCase().includes(q) ||
          (f.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return result;
  }, [faqs, category, query]);

  return (
    <div className="bg-almond min-h-screen pb-24 md:pb-32">
      <div className="max-w-[1440px] mx-auto px-5 md:px-12 pt-10 md:pt-16">
        <header className="mb-12 md:mb-16">
          <h1 className="font-display uppercase text-primary text-[2.6rem] leading-[0.95] sm:text-6xl md:text-7xl xl:text-[6rem] xl:leading-[0.92] max-w-5xl us-rise">
            {t("faq.heroTitle")}
          </h1>
          <p className="text-base md:text-lg text-primary/65 max-w-2xl leading-relaxed mt-6">
            {t("faq.heroSubtitle")}
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          {/* Índice lateral: buscador + categorías */}
          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-28 space-y-8">
              <label className="flex items-center gap-3 border-b border-primary/25 focus-within:border-clay transition-colors py-2">
                <span className="material-symbols-outlined text-primary/40" aria-hidden="true">search</span>
                <input
                  aria-label={t("faq.search")}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("faq.search")}
                  className="flex-1 bg-transparent border-none outline-none focus:ring-0 p-0 text-primary text-base placeholder:text-primary/35"
                />
              </label>
              <nav className="flex lg:flex-col flex-wrap gap-2 lg:gap-0 lg:border-t lg:border-primary/15">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    aria-pressed={category === c}
                    className={`text-left transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-clay us-label px-3.5 py-2.5 rounded-[2px] border lg:border-0 lg:border-b lg:border-primary/15 lg:rounded-none lg:px-0 lg:py-4 lg:text-[0.8125rem] lg:flex lg:items-center lg:justify-between ${
                      category === c
                        ? "bg-primary text-almond border-primary lg:bg-transparent lg:text-clay"
                        : "border-primary/20 text-primary/60 hover:text-primary"
                    }`}
                  >
                    {c === ALL ? t("faq.categories.all") : t(`faq.categories.${c}`, { defaultValue: c })}
                    <span className={`hidden lg:inline transition-opacity ${category === c ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true"><span className="material-symbols-outlined text-base">arrow_forward</span></span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <div className="lg:col-span-8">
            {loading && (
              <div className="py-16 flex justify-center" role="status" aria-busy="true">
                <div className="relative h-px w-32 bg-primary/15 overflow-hidden"><span className="absolute inset-y-0 left-0 w-1/3 bg-clay us-loader-bar" /></div>
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="py-16 border-t border-primary/15">
                <p className="text-primary/55">{t("faq.noResults")}</p>
              </div>
            )}

            <div className="border-t border-primary/15">
              {filtered.map((f) => (
                <details key={f.id} className="group border-b border-primary/15">
                  <summary className="cursor-pointer py-6 md:py-7 list-none flex items-start justify-between gap-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay">
                    <h2 className="font-serif text-lg md:text-2xl text-primary leading-snug transition-colors group-hover:text-clay">
                      {f.question}
                    </h2>
                    <span className="shrink-0 w-10 h-10 rounded-full border border-primary/20 flex items-center justify-center text-primary transition-all duration-500 ease-out group-open:rotate-45 group-open:bg-primary group-open:text-almond group-open:border-primary">
                      <span className="material-symbols-outlined text-xl">add</span>
                    </span>
                  </summary>
                  <div className="pb-8 pr-0 md:pr-16 text-primary/75 text-base leading-relaxed max-w-[68ch] motion-safe:group-open:animate-[fadeInUp_0.4s_cubic-bezier(0.23,1,0.32,1)]">
                    {renderAnswer(f.answer)}
                  </div>
                </details>
              ))}
            </div>

            <section className="mt-16 md:mt-24 bg-primary text-almond p-8 md:p-12">
              <h2 className="font-display uppercase text-3xl md:text-5xl leading-[0.95]">{t("faq.ctaTitle")}</h2>
              <p className="text-almond/70 mt-4 max-w-xl leading-relaxed">{t("faq.ctaBody")}</p>
              <Link to="/contacto" className="us-btn us-btn-light mt-8">
                {t("faq.ctaBtn")} <span className="material-symbols-outlined">arrow_forward</span>
              </Link>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
