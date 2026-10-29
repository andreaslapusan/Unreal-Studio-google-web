import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseMarkdown, parseInline, Block } from '../lib/miniMarkdown';
import { SUPPORTED_LANGS } from '../components/LocaleRoute';

// Textos legales (Términos, Privacidad, Aviso legal) en public/legal/{lang}/{doc}.md.
export type LegalDoc = 'terminos' | 'privacidad' | 'aviso-legal';

const Inl: React.FC<{ text: string }> = ({ text }) => (
  <>
    {parseInline(text).map((n, i) =>
      n.type === 'bold' ? <strong key={i} className="font-semibold text-primary"><Inl text={n.text} /></strong>
      : n.type === 'link' ? <a key={i} href={n.href} className="underline hover:text-primary" {...(n.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{n.text}</a>
      : <React.Fragment key={i}>{n.text}</React.Fragment>)}
  </>
);

const Blk: React.FC<{ b: Block }> = ({ b }) => {
  switch (b.type) {
    case 'h1': return <h1 className="text-3xl md:text-4xl text-primary mb-3">{b.text}</h1>;
    case 'h2': return <h2 className="font-bold text-primary uppercase tracking-widest text-xs pt-5">{b.text}</h2>;
    case 'ul': return <ul className="list-disc pl-5 space-y-1">{b.items.map((x, i) => <li key={i}><Inl text={x} /></li>)}</ul>;
    case 'table': return (
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs border-collapse min-w-[520px]">
          <thead><tr>{b.rows[0].map((c, i) => <th key={i} className="text-left font-semibold text-primary border-b border-primary/15 p-2 align-top">{c}</th>)}</tr></thead>
          <tbody>{b.rows.slice(1).map((r, i) => <tr key={i} className="border-b border-primary/5">{r.map((c, j) => <td key={j} className="p-2 align-top"><Inl text={c} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    default: return <p><Inl text={b.text} /></p>;
  }
};

const LegalPage: React.FC<{ doc: LegalDoc }> = ({ doc }) => {
  const { t, i18n } = useTranslation();
  const l = (i18n.language || 'es').slice(0, 2);
  const lang = (SUPPORTED_LANGS as readonly string[]).includes(l) ? l : 'es';
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setBlocks(null); setFailed(false);
    fetch(`/legal/${lang}/${doc}.md`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((md) => {
        // El fallback SPA puede devolver index.html con 200: solo aceptamos Markdown.
        if (!md.trimStart().startsWith('#')) throw new Error('not markdown');
        if (!alive) return;
        const b = parseMarkdown(md);
        setBlocks(b);
        const h1 = b.find((x) => x.type === 'h1');
        if (h1 && 'text' in h1) document.title = `${h1.text} | Unreal Studio Bali`;
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [lang, doc]);

  return (
    <div className="bg-almond min-h-screen pt-12 pb-20 px-4 md:px-12 transition-colors duration-300">
      <article className="max-w-3xl mx-auto bg-white rounded-[2rem] p-6 md:p-12 shadow-xl text-left border border-primary/5 text-primary/70 text-sm leading-relaxed space-y-3">
        {failed ? (
          <p>{t('legal.loadError')} <a className="underline" href="mailto:hello@unrealstudiobali.com">hello@unrealstudiobali.com</a></p>
        ) : !blocks ? (
          <div className="py-16 flex justify-center"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
        ) : (
          blocks.map((b, i) => <Blk key={i} b={b} />)
        )}
      </article>
    </div>
  );
};

export default LegalPage;
