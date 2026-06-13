/**
 * Handbook de ENTREGA y GARANTÍA (documento contractual UNIDIRECCIONAL que se
 * entrega al cliente al recibir las llaves; no requiere firma — la recepción de
 * llaves implica conocimiento y aceptación de estas condiciones).
 *
 * BORRADOR montado por el bot (2026-06-13) a partir de las indicaciones de la
 * reunión + protecciones legales para Unreal Studio. PENDIENTE de revisión legal
 * y de las anotaciones del socio de Andreas. La garantía material la presta el
 * CONSTRUCTOR; Unreal Studio coordina y entrega.
 *
 * Bilingüe es/en (ro/id usan en como fallback hasta traducción legal revisada).
 */

export interface HandbookData {
  clientName?: string;
  projectName?: string;
  unit?: string | null;
  date?: string;        // fecha de entrega (handover)
  lang?: string;
  logoUrl?: string | null;
}

const BROWN = '#3F2305';
const ALMOND = '#F3E5D8';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

type Section = { h: string; items?: string[]; p?: string };
interface HB { title: string; subtitle: string; metaHandover: string; metaProject: string; metaUnit: string; metaDate: string; intro: string; sections: Section[]; accept: string; footerNote: string; }

const ES: HB = {
  title: 'Manual de Entrega y Garantía',
  subtitle: 'Condiciones de entrega, mantenimiento y garantía de su propiedad',
  metaHandover: 'Entrega (handover)', metaProject: 'Proyecto', metaUnit: 'Unidad', metaDate: 'Fecha de entrega',
  intro: 'Este documento recoge las condiciones de la entrega de su propiedad, sus responsabilidades como propietario desde el momento de la recepción de las llaves, y el alcance y los plazos de la garantía. La recepción de las llaves implica el conocimiento y la aceptación de estas condiciones. Léalo con atención y consérvelo.',
  sections: [
    { h: '1. Momento de la entrega', p: 'La entrega (handover) se produce una vez recibido el pago final de la propiedad y en el momento de la recepción de las llaves. A partir de ese momento la propiedad queda bajo la custodia y responsabilidad del propietario, comienzan los plazos de garantía descritos abajo, y se hace entrega de la documentación correspondiente.' },
    { h: '2. Responsabilidades del propietario desde la entrega', p: 'Para preservar la propiedad y mantener la validez de la garantía, el propietario se compromete a:', items: [
      'Mantener el suministro de ELECTRICIDAD y AGUA activos y al corriente de pago en todo momento.',
      'Mantener el aire acondicionado en funcionamiento periódico para evitar humedades, moho y daños por condensación.',
      'Asegurar la VIGILANCIA y el cuidado de la vivienda para evitar plagas (serpientes, roedores, insectos) y daños por abandono.',
      'Mantener todos los equipos e instalaciones en funcionamiento y uso normal. En particular, NO dejar bombas de agua funcionando en seco/vacío (riesgo de avería e incendio).',
      'Realizar el mantenimiento ordinario y comunicar cualquier incidencia a la mayor brevedad por el canal oficial.',
      'No realizar modificaciones estructurales ni manipular instalaciones sin autorización; ello puede anular la garantía.',
    ] },
    { h: '3. Garantía: alcance y plazos', p: 'La garantía material de la construcción es prestada por el CONSTRUCTOR; Unreal Studio coordina su gestión.', items: [
      'Defectos COSMÉTICOS o superficiales: dispone de DOS (2) SEMANAS desde la entrega para reportarlos. Pasado ese plazo se entienden aceptados y dejan de estar cubiertos.',
      'Garantías estructurales/funcionales: cubiertas según el plazo del constructor (habitualmente entre 3 y 12 meses según el elemento). Los defectos visibles en la entrega deben haberse reportado dentro de las 2 primeras semanas.',
      'Quedan EXCLUIDOS de la garantía: daños por mal uso, falta de mantenimiento, falta de suministro (luz/agua), humedades por no usar el aire acondicionado, plagas por falta de vigilancia, modificaciones del propietario, fuerza mayor y desgaste normal.',
    ] },
    { h: '4. Cómo reportar una incidencia', p: 'Las incidencias se reportan EXCLUSIVAMENTE por el canal oficial (su portal de cliente). No se atienden reclamaciones por WhatsApp ni canales informales. Cada reporte debe incluir:', items: [
      'Fotografía clara del defecto.',
      'Ubicación dentro de la vivienda (estancia y punto).',
      'Descripción del problema.',
      'Vídeo cuando sea necesario para mostrar el defecto.',
      'Si transcurridas las 2 semanas no se ha registrado ningún reporte, se considerará que no existen defectos cosméticos pendientes.',
    ] },
    { h: '5. Pagos y documentación', p: 'La entrega y la liberación de la documentación (incluida, en su caso, la escritura/notarización) están condicionadas a haber completado el PAGO FINAL de la propiedad. Los plazos de entrega pueden verse afectados por causas ajenas a Unreal Studio (permisos, suministros, fuerza mayor); dichos retrasos no generan responsabilidad salvo lo pactado expresamente por escrito.' },
    { h: '6. Limitación de responsabilidad', p: 'Unreal Studio actúa como promotor/coordinador de la entrega. Unreal Studio no será responsable de daños derivados del incumplimiento por el propietario de las responsabilidades de mantenimiento aquí descritas, ni de daños indirectos, lucro cesante, ni de las proyecciones de rentabilidad (que son meramente estimativas y no garantizadas). La responsabilidad por defectos constructivos corresponde al constructor en los términos y plazos de su garantía.' },
    { h: '7. Aceptación y ley aplicable', p: 'La recepción de las llaves constituye la aceptación de este documento por parte del propietario. Este documento se rige por la legislación aplicable en Bali (Indonesia). En caso de discrepancia entre versiones de idioma, prevalecerá la versión española salvo indicación contraria.' },
  ],
  accept: 'La recepción de las llaves implica el conocimiento y la aceptación de las condiciones de este manual.',
  footerNote: 'Documento informativo y contractual · Unreal Studio · Bali, Indonesia · hello@unrealstudiobali.com',
};

const EN: HB = {
  title: 'Handover & Warranty Handbook',
  subtitle: 'Handover, maintenance and warranty conditions for your property',
  metaHandover: 'Handover', metaProject: 'Project', metaUnit: 'Unit', metaDate: 'Handover date',
  intro: 'This document sets out the conditions of the handover of your property, your responsibilities as owner from the moment you receive the keys, and the scope and timeframes of the warranty. Receiving the keys implies acknowledgement and acceptance of these conditions. Please read it carefully and keep it.',
  sections: [
    { h: '1. Moment of handover', p: 'Handover takes place once the final payment for the property has been received and upon delivery of the keys. From that moment the property is under the owner’s custody and responsibility, the warranty periods below begin, and the corresponding documentation is delivered.' },
    { h: '2. Owner responsibilities from handover', p: 'To preserve the property and keep the warranty valid, the owner agrees to:', items: [
      'Keep ELECTRICITY and WATER supplies active and paid at all times.',
      'Run the air conditioning periodically to prevent humidity, mould and condensation damage.',
      'Ensure SURVEILLANCE and care of the home to prevent pests (snakes, rodents, insects) and damage from neglect.',
      'Keep all equipment and installations in normal working order. In particular, do NOT leave water pumps running dry/empty (risk of failure and fire).',
      'Carry out ordinary maintenance and report any issue promptly through the official channel.',
      'Not make structural changes or tamper with installations without authorisation; doing so may void the warranty.',
    ] },
    { h: '3. Warranty: scope and timeframes', p: 'The construction warranty is provided by the BUILDER; Unreal Studio coordinates its management.', items: [
      'COSMETIC or surface defects: you have TWO (2) WEEKS from handover to report them. After that period they are deemed accepted and are no longer covered.',
      'Structural/functional warranties: covered per the builder’s term (typically 3–12 months depending on the item). Defects visible at handover must have been reported within the first 2 weeks.',
      'EXCLUDED from the warranty: damage from misuse, lack of maintenance, lack of supply (power/water), humidity from not using the air conditioning, pests from lack of surveillance, owner modifications, force majeure and normal wear.',
    ] },
    { h: '4. How to report an issue', p: 'Issues are reported EXCLUSIVELY through the official channel (your client portal). Claims via WhatsApp or informal channels are not handled. Each report must include:', items: [
      'A clear photo of the defect.',
      'Location within the home (room and spot).',
      'Description of the problem.',
      'Video where needed to show the defect.',
      'If no report is registered within the 2 weeks, it will be considered that there are no pending cosmetic defects.',
    ] },
    { h: '5. Payments and documentation', p: 'Handover and the release of documentation (including, where applicable, the deed/notarisation) are conditional on having completed the FINAL PAYMENT for the property. Delivery dates may be affected by causes beyond Unreal Studio (permits, utilities, force majeure); such delays create no liability except as expressly agreed in writing.' },
    { h: '6. Limitation of liability', p: 'Unreal Studio acts as developer/coordinator of the handover. Unreal Studio shall not be liable for damage arising from the owner’s failure to meet the maintenance responsibilities described here, nor for indirect damage, loss of profit, or return projections (which are merely indicative and not guaranteed). Liability for construction defects lies with the builder under the terms and periods of its warranty.' },
    { h: '7. Acceptance and applicable law', p: 'Receiving the keys constitutes the owner’s acceptance of this document. This document is governed by the applicable law of Bali (Indonesia). In case of discrepancy between language versions, the Spanish version shall prevail unless otherwise stated.' },
  ],
  accept: 'Receiving the keys implies acknowledgement and acceptance of the conditions in this handbook.',
  footerNote: 'Informative and contractual document · Unreal Studio · Bali, Indonesia · hello@unrealstudiobali.com',
};

const LANGS: Record<string, HB> = { es: ES, en: EN, ro: EN, id: EN };

export function renderHandbookHtml(d: HandbookData): string {
  const L = LANGS[(d.lang || 'es').slice(0, 2)] || ES;
  const logo = d.logoUrl
    ? `<img src="${esc(d.logoUrl)}" alt="Unreal Studio" style="height:34px" />`
    : `<span style="font-family:'DM Serif Display',Georgia,serif;font-size:26px;font-weight:700;color:${BROWN}">Unreal Studio</span>`;
  const meta = [
    d.projectName ? `<b>${L.metaProject}:</b> ${esc(d.projectName)}${d.unit ? ' · ' + esc(d.unit) : ''}` : '',
    d.date ? `<b>${L.metaDate}:</b> ${esc(d.date)}` : '',
    d.clientName ? `<b>${esc(d.clientName)}</b>` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const sections = L.sections.map((s) => `
    <h2 style="font-family:'DM Serif Display',Georgia,serif;font-size:17px;font-weight:700;margin:22px 0 8px;color:${BROWN}">${s.h}</h2>
    ${s.p ? `<p style="font-size:13px;line-height:1.7;margin:0 0 8px;color:rgba(63,35,5,.85);text-align:justify">${s.p}</p>` : ''}
    ${s.items ? `<ul style="margin:0 0 8px;padding-left:18px">${s.items.map((it) => `<li style="font-size:13px;line-height:1.7;color:rgba(63,35,5,.85);margin-bottom:4px;text-align:justify">${it}</li>`).join('')}</ul>` : ''}
  `).join('');
  return `
<div style="max-width:680px;margin:0 auto;background:${ALMOND};padding:26px;border-radius:16px;font-family:Manrope,Arial,sans-serif;color:${BROWN}">
  <div style="background:#fff;border:1px solid rgba(63,35,5,.15);border-radius:14px;padding:30px 30px">
    <div style="text-align:center;margin-bottom:6px">${logo}</div>
    <h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:24px;font-weight:700;text-align:center;margin:10px 0 2px;color:${BROWN}">${L.title}</h1>
    <p style="text-align:center;font-size:13px;color:rgba(63,35,5,.6);margin:0 0 14px">${L.subtitle}</p>
    ${meta ? `<p style="text-align:center;font-size:12px;color:rgba(63,35,5,.6);border-top:1px solid rgba(63,35,5,.12);border-bottom:1px solid rgba(63,35,5,.12);padding:10px 0;margin:0 0 16px">${meta}</p>` : ''}
    <p style="font-size:13px;line-height:1.7;margin:0 0 6px;color:rgba(63,35,5,.85);text-align:justify">${L.intro}</p>
    ${sections}
    <div style="background:${ALMOND};border-radius:10px;padding:14px 16px;margin-top:20px;font-size:13px;font-weight:700;line-height:1.6;text-align:center">${L.accept}</div>
  </div>
  <div style="text-align:center;font-size:10px;color:rgba(63,35,5,.5);margin-top:12px">${L.footerNote}</div>
</div>`.replace(/>\s+</g, '><').trim();
}
