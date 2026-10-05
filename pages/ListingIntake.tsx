/**
 * /listing/:token — Public, no-login form for a property owner to self-upload
 * their listing. Andreas doesn't know third-party properties, so the OWNER
 * fills the MAXIMUM detail — the same public fields the top Bali agencies show
 * (FazWaz, Bali Home Immo, Propertia, Bali Exception, Kibarer): type, status,
 * beds/baths, built + land m², tenure + lease years, price, handover date,
 * furnishing, view, amenities, expected rent, media. Organized in collapsible
 * sections so it isn't one endless scroll. Saved via intake_submit; published
 * into a hidden project draft (admin keeps the commercial tiers/ROI).
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase, SUPABASE_URL } from "../lib/supabase";
import { compressImage } from "../lib/imageCompress";
import { runDriveImport } from "../lib/driveImport";
import LanguageSwitcher from "../components/LanguageSwitcher";

interface Asset { url: string; name: string; }
const BUCKET = "intake-uploads";
const AMENITIES = ["privatePool", "sharedPool", "garden", "parking", "security", "gym", "kitchen", "ac", "wifi", "rooftop", "oceanView", "nearBeach", "coworking", "cleaning"];

// Collapsible section — keeps the form clean (no kilometric scroll).
const Section: React.FC<{ title: string; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ title, open, onToggle, children }) => (
  <section className="bg-white/60 rounded-3xl mb-4 border border-primary/5 overflow-hidden">
    <button onClick={onToggle} className="w-full flex items-center justify-between px-5 md:px-7 py-4 text-left">
      <span className="font-black text-primary">{title}</span>
      <span className={`material-symbols-outlined text-primary/40 transition-transform ${open ? "rotate-180" : ""}`}>expand_more</span>
    </button>
    {open && <div className="px-5 md:px-7 pb-6">{children}</div>}
  </section>
);

export default function ListingIntake() {
  const { token = "" } = useParams();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [published, setPublished] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openSection, setOpenSection] = useState<string>("media");

  const [form, setForm] = useState<Record<string, any>>({
    property_type: "Villa", status: "off_plan",
    bedrooms: "", bathrooms: "", area_m2: "", land_area_m2: "", zone: "",
    tenure: "Leasehold", lease_years: "", price: "", currency: "EUR",
    completion_date: "", furnishing: "", view: "", has_pool: false,
    amenities: [] as string[], expected_rent: "", rent_currency: "", video_url: "", details: "",
    extensions: [] as { years: string; price: string }[],
  });
  const [photos, setPhotos] = useState<Asset[]>([]);
  const [plans, setPlans] = useState<Asset[]>([]);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveBusy, setDriveBusy] = useState(false);

  const importDrive = async () => {
    if (!driveUrl.trim()) return;
    setDriveBusy(true);
    const res = await runDriveImport("intake", token, driveUrl.trim());
    setDriveBusy(false);
    if (res.urls.length) {
      setPhotos((prev) => [...prev, ...res.urls.map((u, i) => ({ url: u, name: `drive-${i + 1}` }))]);
      setDriveUrl("");
    } else {
      alert(t("listingIntake.driveError"));
    }
  };

  const photoInput = useRef<HTMLInputElement>(null);
  const planInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("intake_get", { p_token: token });
      if (error || !data) { setValid(false); setLoading(false); return; }
      setValid(true);
      setTitle(data.property_title || "");
      setPublished(!!data.published);
      const p = data.payload || {};
      setForm((f) => ({
        ...f,
        property_type: p.property_type || "Villa",
        status: p.status || "off_plan",
        bedrooms: p.bedrooms != null ? String(p.bedrooms) : "",
        bathrooms: p.bathrooms != null ? String(p.bathrooms) : "",
        area_m2: p.area_m2 != null ? String(p.area_m2) : "",
        land_area_m2: p.land_area_m2 != null ? String(p.land_area_m2) : "",
        zone: p.zone || "",
        tenure: p.tenure || "Leasehold",
        lease_years: p.lease_years != null ? String(p.lease_years) : "",
        price: p.price != null ? String(p.price) : "",
        currency: p.currency || "EUR",
        completion_date: p.completion_date || "",
        furnishing: p.furnishing || "",
        view: p.view || "",
        has_pool: !!p.has_pool,
        amenities: Array.isArray(p.amenities) ? p.amenities : [],
        expected_rent: p.expected_rent != null ? String(p.expected_rent) : "",
        rent_currency: p.rent_currency || "",
        video_url: p.video_url || "",
        details: p.details || "",
        extensions: Array.isArray(p.extensions)
          ? p.extensions.map((e: any) => ({ years: e?.years != null ? String(e.years) : "", price: e?.price != null ? String(e.price) : "" }))
          : [],
      }));
      if (Array.isArray(p.photos)) setPhotos(p.photos.map((u: string, i: number) => ({ url: u, name: `foto-${i + 1}` })));
      if (Array.isArray(p.plans)) setPlans(p.plans.map((u: string, i: number) => ({ url: u, name: `plano-${i + 1}` })));
      setLoading(false);
    })();
  }, [token]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const toggleSection = (s: string) => setOpenSection((cur) => (cur === s ? "" : s));
  const toggleAmenity = (a: string) => setForm((f) => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x: string) => x !== a) : [...f.amenities, a] }));
  // Opciones de extensión del leasehold (repetibles): cada una es {años, precio}.
  const addExtension = () => setForm((f) => ({ ...f, extensions: [...(f.extensions || []), { years: "", price: "" }] }));
  const updExtension = (i: number, k: "years" | "price", v: string) => setForm((f) => ({ ...f, extensions: (f.extensions || []).map((e: any, idx: number) => (idx === i ? { ...e, [k]: v } : e)) }));
  const rmExtension = (i: number) => setForm((f) => ({ ...f, extensions: (f.extensions || []).filter((_: any, idx: number) => idx !== i) }));

  const uploadFiles = useCallback(async (files: FileList, kind: "photos" | "plans") => {
    setUploading(true);
    const added: Asset[] = [];
    for (const file of Array.from(files)) {
      try {
        const isImg = file.type.startsWith("image/");
        const blob: Blob = isImg ? await compressImage(file, { maxDim: 1920, quality: 0.82 }) : file;
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `${token}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType: file.type || undefined });
        if (error) { console.error(error); continue; }
        added.push({ url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`, name: file.name });
      } catch (e) { console.error(e); }
    }
    if (kind === "photos") setPhotos((prev) => [...prev, ...added]);
    else setPlans((prev) => [...prev, ...added]);
    setUploading(false);
  }, [token]);

  const removeAsset = (kind: "photos" | "plans", idx: number) => {
    if (kind === "photos") setPhotos((p) => p.filter((_, i) => i !== idx));
    else setPlans((p) => p.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    setSaving(true);
    const num = (v: any) => (v !== "" && v != null ? Number(v) : null);
    const payload = {
      property_title: (title || "").trim(),
      property_type: form.property_type, status: form.status,
      bedrooms: num(form.bedrooms), bathrooms: num(form.bathrooms),
      area_m2: num(form.area_m2), land_area_m2: num(form.land_area_m2),
      zone: (form.zone || "").trim(),
      tenure: form.tenure, lease_years: num(form.lease_years),
      price: num(form.price), currency: form.currency,
      completion_date: (form.completion_date || "").trim(),
      furnishing: form.furnishing, view: (form.view || "").trim(),
      has_pool: !!form.has_pool, amenities: form.amenities,
      expected_rent: num(form.expected_rent), rent_currency: form.rent_currency || form.currency,
      extensions: (form.extensions || [])
        .filter((e: { years: string; price: string }) => e.years !== "" || e.price !== "")
        .map((e: { years: string; price: string }) => ({ years: e.years !== "" ? num(e.years) : null, price: e.price !== "" ? num(e.price) : null })),
      video_url: (form.video_url || "").trim(),
      details: (form.details || "").trim(),
      photos: photos.map((a) => a.url), plans: plans.map((a) => a.url),
    };
    const { data, error } = await supabase.rpc("intake_submit", { p_token: token, p_payload: payload });
    setSaving(false);
    if (!error && data?.ok) setDone(true);
    else alert(t("listingIntake.errorSave"));
  };

  if (loading) {
    return <div className="min-h-screen bg-almond flex items-center justify-center"><div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }
  if (!valid) {
    return (
      <div className="min-h-screen bg-almond flex flex-col items-center justify-center text-center px-6">
        <span className="material-symbols-outlined text-5xl text-primary/30 mb-4">link_off</span>
        <h1 className="text-2xl font-serif text-primary mb-2">{t("listingIntake.invalidTitle")}</h1>
        <p className="text-primary/60 max-w-md">{t("listingIntake.invalidBody")}</p>
      </div>
    );
  }
  if (done || published) {
    return (
      <div className="min-h-screen bg-almond flex flex-col items-center justify-center text-center px-6">
        <span className="material-symbols-outlined text-6xl text-emerald-600 mb-4">check_circle</span>
        <h1 className="text-3xl font-serif text-primary mb-3">{t("listingIntake.thanksTitle")}</h1>
        <p className="text-primary/60 max-w-md">{published ? t("listingIntake.publishedBody") : t("listingIntake.thanksBody")}</p>
      </div>
    );
  }

  const inputCls = "w-full px-4 py-3 bg-white rounded-2xl border border-primary/10 font-semibold text-primary focus:ring-2 focus:ring-primary/30 outline-none";
  const labelCls = "block text-[11px] uppercase text-primary/40 font-black tracking-widest mb-1.5";
  const field = (label: string, node: React.ReactNode) => (<div><label className={labelCls}>{label}</label>{node}</div>);

  return (
    <div className="min-h-screen bg-almond pb-24">
      <header className="px-5 md:px-10 pt-5 flex items-center justify-end max-w-3xl mx-auto"><LanguageSwitcher /></header>

      <div className="max-w-3xl mx-auto px-5 md:px-10 pt-4">
        <div className="mb-8">
          <p className="text-[11px] uppercase text-primary/40 font-black tracking-widest mb-1">{t("listingIntake.kicker")}</p>
          {/* Título EDITABLE: input que parece la cabecera (borde inferior + icono
              lápiz indican que se edita). Se guarda en el submit (property_title). */}
          <label className="group relative block">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("listingIntake.titlePlaceholder")}
              aria-label={t("listingIntake.titleLabel")}
              className="w-full bg-transparent text-3xl md:text-4xl font-serif text-primary leading-tight outline-none border-b border-primary/15 hover:border-primary/30 focus:border-primary/50 transition-colors pb-1 pr-9 placeholder:text-primary/25"
            />
            <span className="material-symbols-outlined absolute right-0 bottom-2 text-primary/30 group-hover:text-primary/60 group-focus-within:text-primary text-xl transition-colors pointer-events-none">edit</span>
          </label>
          <p className="text-primary/60 mt-2">{t("listingIntake.introFull")}</p>
        </div>

        {/* 1 · Media */}
        <Section title={t("listingIntake.photosTitle")} open={openSection === "media"} onToggle={() => toggleSection("media")}>
          <p className="text-sm text-primary/50 mb-4">{t("listingIntake.photosHint")}</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-5">
            {photos.map((a, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden">
                <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                <button onClick={() => removeAsset("photos", i)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">✕</button>
              </div>
            ))}
            <button onClick={() => photoInput.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center text-primary/40 hover:border-primary/40 transition">
              <span className="material-symbols-outlined">add_photo_alternate</span>
              <span className="text-[10px] font-bold mt-1">{t("listingIntake.add")}</span>
            </button>
          </div>
          <input ref={photoInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && uploadFiles(e.target.files, "photos")} />

          {/* Import from a Google Drive folder */}
          <div className="bg-almond/60 rounded-2xl p-4 mb-5 border border-primary/5">
            <p className="text-[11px] uppercase text-primary/40 font-black tracking-widest mb-2">{t("listingIntake.driveTitle")}</p>
            <p className="text-sm text-primary/50 mb-3">{t("listingIntake.driveHint")}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="url" value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" disabled={driveBusy} className="flex-1 px-4 py-3 bg-white rounded-xl border border-primary/10 font-semibold text-primary focus:ring-2 focus:ring-primary/30 outline-none disabled:opacity-60" />
              <button onClick={importDrive} disabled={driveBusy || !driveUrl.trim()} className="flex items-center justify-center gap-2 bg-primary text-white px-5 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-40 transition whitespace-nowrap">
                <span className="material-symbols-outlined text-base">{driveBusy ? "hourglass_top" : "cloud_download"}</span>
                {driveBusy ? t("listingIntake.driveImporting") : t("listingIntake.driveImport")}
              </button>
            </div>
          </div>

          <p className="text-sm text-primary/50 mb-3">{t("listingIntake.plansHint")}</p>
          <div className="flex flex-wrap gap-3 mb-5">
            {plans.map((a, i) => (
              <div key={i} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-primary/10">
                <span className="material-symbols-outlined text-primary/40 text-lg">description</span>
                <span className="text-xs font-semibold text-primary max-w-[140px] truncate">{a.name}</span>
                <button onClick={() => removeAsset("plans", i)} className="text-primary/30 hover:text-red-500">✕</button>
              </div>
            ))}
            <button onClick={() => planInput.current?.click()} className="flex items-center gap-2 rounded-xl border-2 border-dashed border-primary/20 px-4 py-2 text-primary/40 hover:border-primary/40 transition">
              <span className="material-symbols-outlined text-lg">upload_file</span><span className="text-xs font-bold">{t("listingIntake.add")}</span>
            </button>
          </div>
          <input ref={planInput} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => e.target.files && uploadFiles(e.target.files, "plans")} />
          {field(t("listingIntake.videoUrl"), <input type="url" value={form.video_url} onChange={(e) => set("video_url", e.target.value)} placeholder="https://…" className={inputCls} />)}
        </Section>

        {/* 2 · Basics */}
        <Section title={t("listingIntake.basicsTitle")} open={openSection === "basics"} onToggle={() => toggleSection("basics")}>
          <div className="grid grid-cols-2 gap-4">
            {field(t("listingIntake.type"), (
              <select value={form.property_type} onChange={(e) => set("property_type", e.target.value)} className={inputCls}>
                <option value="Villa">Villa</option><option value="Loft">Loft</option><option value="Apartment">Apartment</option><option value="Land">Land</option>
              </select>
            ))}
            {field(t("listingIntake.statusLabel"), (
              <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
                <option value="off_plan">{t("admin.statusBadge.off_plan")}</option>
                <option value="en_construccion">{t("admin.statusBadge.en_construccion")}</option>
                <option value="obra_finalizada">{t("admin.statusBadge.obra_finalizada")}</option>
              </select>
            ))}
            {field(t("listingIntake.bedrooms"), <input type="number" min="0" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} className={inputCls} />)}
            {field(t("listingIntake.bathrooms"), <input type="number" min="0" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} className={inputCls} />)}
            {field(t("listingIntake.builtArea"), <input type="number" min="0" value={form.area_m2} onChange={(e) => set("area_m2", e.target.value)} className={inputCls} />)}
            {field(t("listingIntake.landArea"), <input type="number" min="0" value={form.land_area_m2} onChange={(e) => set("land_area_m2", e.target.value)} className={inputCls} />)}
          </div>
          <div className="mt-4">{field(t("listingIntake.zone"), <input type="text" value={form.zone} onChange={(e) => set("zone", e.target.value)} placeholder={t("listingIntake.zonePh")} className={inputCls} />)}</div>
        </Section>

        {/* 3 · Tenure & price */}
        <Section title={t("listingIntake.tenurePriceTitle")} open={openSection === "tenure"} onToggle={() => toggleSection("tenure")}>
          <div className="grid grid-cols-2 gap-4">
            {field(t("listingIntake.tenure"), (
              <select value={form.tenure} onChange={(e) => set("tenure", e.target.value)} className={inputCls}>
                <option value="Leasehold">Leasehold</option><option value="Freehold">Freehold</option>
              </select>
            ))}
            {field(t("listingIntake.leaseYears"), <input type="number" min="0" value={form.lease_years} onChange={(e) => set("lease_years", e.target.value)} className={inputCls} />)}
            {field(t("listingIntake.price"), <input type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} className={inputCls} />)}
            {field(t("listingIntake.currency"), (
              <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls}>
                <option value="EUR">EUR €</option><option value="USD">USD $</option><option value="IDR">IDR Rp</option><option value="AUD">AUD $</option>
              </select>
            ))}
          </div>
          {form.tenure === "Leasehold" && (
            <div className="mt-6">
              <label className={labelCls}>{t("listingIntake.extensionsTitle")}</label>
              <div className="space-y-2">
                {(form.extensions || []).map((ext: { years: string; price: string }, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="number" min="0" value={ext.years} onChange={(e) => updExtension(i, "years", e.target.value)} placeholder={t("listingIntake.extensionYears")} className={inputCls} />
                    <input type="number" min="0" value={ext.price} onChange={(e) => updExtension(i, "price", e.target.value)} placeholder={t("listingIntake.extensionPrice")} className={inputCls} />
                    <button type="button" onClick={() => rmExtension(i)} aria-label="×" className="shrink-0 w-11 h-11 rounded-2xl border border-primary/10 bg-white text-primary/50 hover:text-red-600 hover:border-red-200 transition-colors flex items-center justify-center">
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addExtension} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary/70 hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[18px]">add</span>{t("listingIntake.addExtension")}
              </button>
            </div>
          )}
          <div className="mt-4">{field(t("listingIntake.deliveryDate"), <input type="text" value={form.completion_date} onChange={(e) => set("completion_date", e.target.value)} placeholder={t("listingIntake.deliveryPh")} className={inputCls} />)}</div>
        </Section>

        {/* 4 · Features */}
        <Section title={t("listingIntake.featuresTitle")} open={openSection === "features"} onToggle={() => toggleSection("features")}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {field(t("listingIntake.furnishing"), (
              <select value={form.furnishing} onChange={(e) => set("furnishing", e.target.value)} className={inputCls}>
                <option value="">—</option>
                <option value="semi">{t("listingIntake.semiFurnished")}</option>
                <option value="furnished">{t("listingIntake.furnished")}</option>
                <option value="turnkey">{t("listingIntake.turnkey")}</option>
              </select>
            ))}
            {field(t("listingIntake.viewField"), <input type="text" value={form.view} onChange={(e) => set("view", e.target.value)} placeholder={t("listingIntake.viewPh")} className={inputCls} />)}
          </div>
          <label className={labelCls}>{t("listingIntake.amenities")}</label>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((a) => (
              <button key={a} onClick={() => toggleAmenity(a)} className={`text-xs font-bold px-3 py-2 rounded-full border transition ${form.amenities.includes(a) ? "bg-primary text-white border-primary" : "bg-white text-primary/60 border-primary/15 hover:border-primary/40"}`}>
                {t(`listingIntake.amenity.${a}`)}
              </button>
            ))}
          </div>
        </Section>

        {/* 5 · Rental (optional) */}
        <Section title={t("listingIntake.rentalTitle")} open={openSection === "rental"} onToggle={() => toggleSection("rental")}>
          <p className="text-sm text-primary/50 mb-4">{t("listingIntake.rentalHint")}</p>
          <div className="grid grid-cols-2 gap-4">
            {field(t("listingIntake.expectedRent"), <input type="number" min="0" value={form.expected_rent} onChange={(e) => set("expected_rent", e.target.value)} placeholder={t("listingIntake.expectedRentPh")} className={inputCls} />)}
            {field(t("listingIntake.rentCurrency"), (
              <select value={form.rent_currency || form.currency} onChange={(e) => set("rent_currency", e.target.value)} className={inputCls}>
                <option value="EUR">EUR €</option><option value="USD">USD $</option><option value="IDR">IDR Rp</option><option value="AUD">AUD $</option>
              </select>
            ))}
          </div>
        </Section>

        {/* 6 · Description */}
        <Section title={t("listingIntake.descTitle")} open={openSection === "desc"} onToggle={() => toggleSection("desc")}>
          <textarea value={form.details} onChange={(e) => set("details", e.target.value)} rows={6} placeholder={t("listingIntake.detailsPh")} className={inputCls} />
        </Section>

        <button onClick={submit} disabled={saving || uploading} className="w-full bg-primary text-white font-black uppercase tracking-widest py-4 rounded-2xl shadow-xl hover:brightness-110 disabled:opacity-50 transition flex items-center justify-center gap-2 mt-4">
          {uploading ? t("listingIntake.uploading") : saving ? t("listingIntake.sending") : t("listingIntake.submit")}
        </button>
        <p className="text-center text-[11px] text-primary/40 mt-3">{t("listingIntake.canEditLater")}</p>
      </div>
    </div>
  );
}
