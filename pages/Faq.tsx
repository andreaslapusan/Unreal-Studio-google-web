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
          .eq("language", (["en", "id", "ro"].includes(i18n.language.slice(0, 2)) ? i18n.language.slice(0, 2) : "es"))
          .order("sort_order", { ascending: true });
        if (!error && data) {
          // Fallback: si no hay filas en el idioma actual, mostrar ES (para
          // cualquier idioma no-ES cuya traducción aún no esté cargada).
          if (data.length === 0 && i18n.language.slice(0, 2) !== "es") {
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
    <div className="bg-almond min-h-screen pb-24">
      <header className="px-6 md:px-12 pt-20 pb-16 max-w-5xl mx-auto text-center">
        <h1 className="text-5xl md:text-7xl text-primary font-serif mb-6">
          {t("faq.heroTitle")}
        </h1>
        <p className="text-lg text-primary/70 max-w-2xl mx-auto leading-relaxed">
          {t("faq.heroSubtitle")}
        </p>
      </header>

      <div className="max-w-4xl mx-auto px-6 md:px-12">
        <div className="bg-white rounded-2xl shadow-sm border border-primary/5 p-3 mb-8 flex items-center gap-3">
          <span className="material-symbols-outlined text-primary/30 ml-2">search</span>
          <input
            aria-label={t("faq.search")}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("faq.search")}
            className="flex-1 bg-transparent border-none outline-none text-primary text-base font-medium placeholder:text-primary/30"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition ${
                category === c
                  ? "bg-primary text-white shadow-md"
                  : "bg-white text-primary/60 hover:text-primary border border-primary/10"
              }`}
            >
              {c === ALL
                ? t("faq.categories.all")
                : t(`faq.categories.${c}`, { defaultValue: c })}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-primary/50 italic">{t("faq.noResults")}</p>
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((f) => (
            <details
              key={f.id}
              className="bg-white rounded-2xl border border-primary/5 shadow-sm group"
            >
              <summary className="cursor-pointer p-6 list-none flex items-start justify-between gap-4">
                <h2 className="font-serif text-lg md:text-xl text-primary leading-snug">
                  {f.question}
                </h2>
                <span className="material-symbols-outlined text-primary/40 group-open:rotate-45 transition shrink-0">
                  add
                </span>
              </summary>
              <div className="px-6 pb-6 text-primary/80 text-sm md:text-base leading-relaxed">
                {renderAnswer(f.answer)}
              </div>
            </details>
          ))}
        </div>
      </div>

      <section className="max-w-3xl mx-auto px-6 md:px-12 mt-20">
        <div className="bg-primary text-white rounded-3xl p-10 text-center shadow-xl">
          <h2 className="font-serif text-3xl mb-3">{t("faq.ctaTitle")}</h2>
          <p className="text-white/80 mb-6 max-w-xl mx-auto">{t("faq.ctaBody")}</p>
          <Link
            to="/contacto"
            className="inline-block bg-white text-primary px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition shadow-lg"
          >
            {t("faq.ctaBtn")}
          </Link>
        </div>
      </section>
    </div>
  );
}
