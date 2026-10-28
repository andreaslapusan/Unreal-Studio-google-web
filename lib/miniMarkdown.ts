// Parser mínimo de Markdown para los textos legales (public/legal/{lang}/*.md):
// #/## títulos, párrafos, listas "- ", tablas "|", **negrita** y enlaces/emails/URLs.
// shortcut: no soporta anidación ni otros elementos; ampliar si los textos los necesitan.
export type Block =
  | { type: 'h1' | 'h2' | 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'table'; rows: string[][] };

export type Inline = { type: 'text' | 'bold'; text: string } | { type: 'link'; text: string; href: string };

const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('## ')) { blocks.push({ type: 'h2', text: l.slice(3).trim() }); i++; continue; }
    if (l.startsWith('# ')) { blocks.push({ type: 'h1', text: l.slice(2).trim() }); i++; continue; }
    if (l.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2).trim());
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (l.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const r = cells(lines[i++]);
        if (!r.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(r);
      }
      blocks.push({ type: 'table', rows });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,2} |- |\s*\|)/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push({ type: 'p', text: para.join(' ') });
  }
  return blocks;
}

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https?:\/\/[^\s)]*[^\s).,;:])|(www\.[\w-]+(?:\.[\w-]+)+)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: 'bold', text: m[1] });
    else if (m[2] !== undefined) out.push({ type: 'link', text: m[2], href: m[3] });
    else if (m[4]) out.push({ type: 'link', text: m[4], href: `mailto:${m[4]}` });
    else if (m[5]) out.push({ type: 'link', text: m[5], href: m[5] });
    else out.push({ type: 'link', text: m[6], href: `https://${m[6]}` });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}
