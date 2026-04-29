#!/usr/bin/env node
/**
 * One-off image catalogue compaction.
 *
 * For every PNG / JPG / JPEG in the `images` Supabase Storage bucket:
 *   1. Download original
 *   2. Convert with sharp → WebP at quality 82, longest side ≤ 2000 px
 *   3. Upload sibling `<basename>.webp` (skip if identical-or-bigger output)
 *   4. Record path mapping
 *
 * Then optionally rewrite DB references (properties.hero_image_url,
 * projects.image / gallery / construction_gallery, blogs.image,
 * update_assets.{storage_path,external_url}, listing_partners.logo_url) so
 * front-end fetches the .webp directly. The wsrv.nl proxy stays in place as
 * a fallback / further optimiser.
 *
 * Run with:
 *   SUPABASE_SERVICE_ROLE=sb_secret_xxx \
 *     node scripts/convert-storage-to-webp.mjs --dry          # preview
 *   SUPABASE_SERVICE_ROLE=sb_secret_xxx \
 *     node scripts/convert-storage-to-webp.mjs --apply        # do it
 *   ... --apply --skip-db          # only upload .webp siblings, don't touch DB
 */
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rnielxgackkshnatvagj.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
if (!SERVICE_ROLE) {
  console.error('SUPABASE_SERVICE_ROLE env var required');
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const SKIP_DB = args.has('--skip-db');
const DRY = !APPLY;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const BUCKET = 'images';
const MAX_DIM = 2000;
const QUALITY = 82;

const isConvertible = (name) =>
  /\.(png|jpe?g)$/i.test(name) && !/\.webp$/i.test(name);

// --- list every object in the bucket recursively
async function listAll(prefix = '') {
  const all = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // Folders have id === null in supabase storage
      if (item.id === null) {
        const sub = await listAll(path);
        all.push(...sub);
      } else {
        all.push({ path, size: item.metadata?.size ?? 0 });
      }
    }
    if (data.length < limit) break;
    offset += data.length;
  }
  return all;
}

async function convertOne(path) {
  const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(path);
  if (dlErr) throw new Error(`download ${path}: ${dlErr.message}`);
  const buf = Buffer.from(await blob.arrayBuffer());

  const out = await sharp(buf)
    .rotate() // honour EXIF orientation
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();

  return { original: buf, webp: out };
}

const webpPathFor = (path) => path.replace(/\.(png|jpe?g)$/i, '.webp');

async function uploadWebp(path, buf) {
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: 'image/webp', upsert: true, cacheControl: '604800' });
  if (error) throw error;
}

// --- main
const all = await listAll();
const targets = all.filter((o) => isConvertible(o.path));

console.log(`Bucket scan: ${all.length} objects, ${targets.length} convertible (PNG/JPG)\n`);

let totalIn = 0;
let totalOut = 0;
const mapping = []; // { from, to, sizeIn, sizeOut }

for (const t of targets) {
  try {
    const { original, webp } = await convertOne(t.path);
    const sizeIn = original.length;
    const sizeOut = webp.length;
    totalIn += sizeIn;
    totalOut += sizeOut;

    // Skip writing if WebP isn't smaller — pathological case, e.g. transparent PNG
    if (sizeOut >= sizeIn) {
      console.log(`  skip  ${t.path}  (webp ${(sizeOut / 1024).toFixed(0)}KB ≥ original ${(sizeIn / 1024).toFixed(0)}KB)`);
      continue;
    }

    const newPath = webpPathFor(t.path);
    if (APPLY) {
      await uploadWebp(newPath, webp);
    }
    mapping.push({ from: t.path, to: newPath, sizeIn, sizeOut });
    console.log(`  ${DRY ? 'would' : 'wrote'} ${newPath}  ${(sizeIn / 1024).toFixed(0)}→${(sizeOut / 1024).toFixed(0)}KB  (-${Math.round((1 - sizeOut / sizeIn) * 100)}%)`);
  } catch (err) {
    console.error(`  fail  ${t.path}: ${err.message ?? err}`);
  }
}

console.log(`\nConverted: ${mapping.length}/${targets.length}`);
console.log(`Bytes in:  ${(totalIn / 1024 / 1024).toFixed(1)} MB`);
console.log(`Bytes out: ${(totalOut / 1024 / 1024).toFixed(1)} MB`);
if (totalIn > 0) {
  console.log(`Saved:     ${((1 - totalOut / totalIn) * 100).toFixed(0)}%`);
}

// --- DB rewrite phase
if (!APPLY || SKIP_DB) {
  console.log('\n(DB updates skipped — pass --apply without --skip-db to rewrite references)');
  process.exit(0);
}

console.log('\nRewriting DB references…');

const STORAGE_PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

// Build helper SQL for path columns. We replace BOTH the bare path form
// (stored in `update_assets.storage_path` and in `properties.hero_image_url`
// when it's a relative path) AND the full public URL form.
const pairs = mapping.map((m) => ({
  from: m.from,
  to: m.to,
  fromUrl: STORAGE_PUBLIC_PREFIX + m.from,
  toUrl: STORAGE_PUBLIC_PREFIX + m.to,
}));

// Use plain UPDATE statements, batched per table. We don't drop the originals
// — keeps a rollback path if rendering breaks.
let touched = 0;

async function pgUpdate(query) {
  // Use the management API since we have the PAT
  const r = await fetch(
    'https://api.supabase.com/v1/projects/rnielxgackkshnatvagj/database/query',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sbp_e57f27e43526cb7b86ae0c2c86bbdf1953bb73b7',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`SQL: ${r.status} ${txt.slice(0, 200)}`);
  }
  return r.json();
}

const escSql = (s) => s.replace(/'/g, "''");

for (const p of pairs) {
  const f = escSql(p.from);
  const t = escSql(p.to);
  const fu = escSql(p.fromUrl);
  const tu = escSql(p.toUrl);

  // Text columns (whole-string match — only flip when entire column is the
  // path, never inside arbitrary URLs to avoid surprises).
  const sql = [
    `UPDATE public.projects SET image = '${t}' WHERE image = '${f}'`,
    `UPDATE public.projects SET image = '${tu}' WHERE image = '${fu}'`,
    `UPDATE public.blogs SET image = '${t}' WHERE image = '${f}'`,
    `UPDATE public.blogs SET image = '${tu}' WHERE image = '${fu}'`,
    `UPDATE public.properties SET hero_image_url = '${tu}' WHERE hero_image_url = '${fu}'`,
    `UPDATE public.properties SET hero_image_url = '${t}' WHERE hero_image_url = '${f}'`,
    `UPDATE public.listing_partners SET logo_url = '${tu}' WHERE logo_url = '${fu}'`,
    `UPDATE public.update_assets SET storage_path = '${t}' WHERE storage_path = '${f}'`,
    `UPDATE public.update_assets SET external_url = '${tu}' WHERE external_url = '${fu}'`,
    // Array columns — replace element when the whole element matches
    `UPDATE public.projects SET gallery = array_replace(gallery, '${f}', '${t}') WHERE '${f}' = ANY(gallery)`,
    `UPDATE public.projects SET gallery = array_replace(gallery, '${fu}', '${tu}') WHERE '${fu}' = ANY(gallery)`,
    `UPDATE public.projects SET construction_gallery = array_replace(construction_gallery, '${f}', '${t}') WHERE '${f}' = ANY(construction_gallery)`,
    `UPDATE public.projects SET construction_gallery = array_replace(construction_gallery, '${fu}', '${tu}') WHERE '${fu}' = ANY(construction_gallery)`,
  ].join(';');

  await pgUpdate(sql);
  touched += 1;
  if (touched % 20 === 0) console.log(`  …${touched} rewrites done`);
}

console.log(`\nDB rewrites complete: ${touched} mapping batches applied`);
