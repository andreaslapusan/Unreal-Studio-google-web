// Autocomprobación del parser legal: node --experimental-strip-types scripts/check-mini-markdown.ts
import assert from 'node:assert';
import { parseMarkdown, parseInline } from '../lib/miniMarkdown.ts';
const b = parseMarkdown('# T\n\n**x** a\nb\n\n## H\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |\npara');
assert.deepStrictEqual(b.map((x) => x.type), ['h1', 'p', 'h2', 'ul', 'table', 'p']);
assert.strictEqual((b[1] as any).text, '**x** a b');
assert.deepStrictEqual((b[4] as any).rows, [['A', 'B'], ['1', '2']]);
const i = parseInline('Escriba a hello@unrealstudiobali.com. Ver www.aepd.es, y **Bold** [L](/es/x).');
assert.deepStrictEqual(i.filter((x) => x.type !== 'text'), [
  { type: 'link', text: 'hello@unrealstudiobali.com', href: 'mailto:hello@unrealstudiobali.com' },
  { type: 'link', text: 'www.aepd.es', href: 'https://www.aepd.es' },
  { type: 'bold', text: 'Bold' }, { type: 'link', text: 'L', href: '/es/x' }]);
assert.strictEqual(i.map((x) => x.text).join(''), 'Escriba a hello@unrealstudiobali.com. Ver www.aepd.es, y Bold L.');
console.log('md ok');
