/**
 * asc-profile.mjs <bundleId> <out.mobileprovision> — obtiene (o crea) el perfil App Store del bundle
 * con el certificado Apple Distribution vigente, vía App Store Connect API. Imprime el NOMBRE del perfil.
 * Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (.p8). Lo usa .github/workflows/ios-testflight.yml.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const [bundle, out] = process.argv.slice(2);
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
if (!bundle || !out || !ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) throw new Error('uso: asc-profile.mjs <bundleId> <out> + env ASC_*');

function jwt() {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'), n = Math.floor(Date.now() / 1000);
  const h = b({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }), p = b({ iss: ASC_ISSUER_ID, iat: n, exp: n + 900, aud: 'appstoreconnect-v1' });
  return `${h}.${p}.${createSign('SHA256').update(`${h}.${p}`).sign({ key: readFileSync(ASC_KEY_PATH), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
async function api(method, path, data) {
  const r = await fetch('https://api.appstoreconnect.apple.com' + path, { method, headers: { Authorization: 'Bearer ' + jwt(), 'Content-Type': 'application/json' }, body: data && JSON.stringify({ data }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(j.errors)}`);
  return j;
}

const bid = (await api('GET', `/v1/bundleIds?filter[identifier]=${bundle}`)).data.find((x) => x.attributes.identifier === bundle);
if (!bid) throw new Error(`bundle id no registrado: ${bundle}`);
const certs = (await api('GET', '/v1/certificates?filter[certificateType]=DISTRIBUTION')).data
  .sort((a, b) => b.attributes.expirationDate.localeCompare(a.attributes.expirationDate));
if (!certs.length) throw new Error('no hay certificado Apple Distribution');
const cert = certs[0];
const name = `${bundle} AppStore ${cert.id}`; // el cert en el nombre: al renovar el cert se crea un perfil nuevo
let prof = (await api('GET', `/v1/profiles?filter[name]=${encodeURIComponent(name)}&filter[profileState]=ACTIVE`)).data[0];
if (!prof) prof = (await api('POST', '/v1/profiles', { type: 'profiles', attributes: { name, profileType: 'IOS_APP_STORE' },
  relationships: { bundleId: { data: { type: 'bundleIds', id: bid.id } }, certificates: { data: [{ type: 'certificates', id: cert.id }] } } })).data;
writeFileSync(out, Buffer.from(prof.attributes.profileContent, 'base64'));
console.log(name);
