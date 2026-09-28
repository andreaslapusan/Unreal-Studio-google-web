/**
 * /listing/:token — Public, no-login form for a property owner to self-upload
 * their listing (photos, plans, specs). Saved as a DRAFT in the admin (via the
 * intake_submit RPC). One token = one property. The owner can re-open the same
 * link to edit what they already sent. See admin IntakeLinksPanel to create
 * links and publish submissions.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase, SUPABASE_URL } from "../lib/supabase";
import { compressImage } from "../lib/imageCompress";
import LanguageSwitcher from "../components/LanguageSwitcher";

interface Asset { url: string; name: string; }

const BUCKET = "intake-uploads";

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

  const [form, setForm] = useState({
    property_type: "Villa",
    bedrooms: "",
    bathrooms: "",
    area_m2: "",
    zone: "",
    price: "",
    currency: "EUR",
    tenure: "Leasehold",
    details: "",
  });
  const [photos, setPhotos] = useState<Asset[]>([]);
  const [plans, setPlans] = useState<Asset[]>([]);

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
        bedrooms: p.bedrooms != null ? String(p.bedrooms) : "",
        bathrooms: p.bathrooms != null ? String(p.bathrooms) : "",
        area_m2: p.area_m2 != null ? String(p.area_m2) : "",
        zone: p.zone || "",
        price: p.price != null ? String(p.price) : "",
        currency: p.currency || "EUR",
        tenure: p.tenure || "Leasehold",
        details: p.details || "",
      }));
      if (Array.isArray(p.photos)) setPhotos(p.photos.map((u: string, i: number) => ({ url: u, name: `foto-${i + 1}` })));
      if (Array.isArray(p.plans)) setPlans(p.plans.map((u: string, i: number) => ({ url: u, name: `plano-${i + 1}` })));
      setLoading(false);
    })();
  }, [token]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
        const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
        added.push({ url, name: file.name });
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
    const payload = {
      property_type: form.property_type,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
      area_m2: form.area_m2 ? Number(form.area_m2) : null,
      zone: form.zone.trim(),
      price: form.price ? Number(form.price) : null,
      currency: form.currency,
      tenure: form.tenure,
      details: form.details.trim(),
      photos: photos.map((a) => a.url),
      plans: plans.map((a) => a.url),
    };
    const { data, error } = await supabase.rpc("intake_submit", { p_token: token, p_payload: payload });
    setSaving(false);
    if (!error && data?.ok) setDone(true);
    else alert(t("listingIntake.errorSave"));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-almond flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
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

  return (
    <div className="min-h-screen bg-almond pb-24">
      <header className="px-5 md:px-10 pt-5 flex items-center justify-end max-w-3xl mx-auto">
        <LanguageSwitcher />
      </header>

      <div className="max-w-3xl mx-auto px-5 md:px-10 pt-4">
        <div className="mb-8">
          <p className="text-[11px] uppercase text-primary/40 font-black tracking-widest mb-1">{t("listingIntake.kicker")}</p>
          <h1 className="text-3xl md:text-4xl font-serif text-primary leading-tight">{title}</h1>
          <p className="text-primary/60 mt-2">{t("listingIntake.intro")}</p>
        </div>

        {/* Photos */}
        <section className="bg-white/60 rounded-3xl p-5 md:p-7 mb-6 border border-primary/5">
          <h2 className="font-black text-primary mb-1">{t("listingIntake.photosTitle")}</h2>
          <p className="text-sm text-primary/50 mb-4">{t("listingIntake.photosHint")}</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {photos.map((a, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                <button onClick={() => removeAsset("photos", i)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">✕</button>
              </div>
            ))}
            <button onClick={() => photoInput.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center text-primary/40 hover:border-primary/40 hover:text-primary/60 transition">
              <span className="material-symbols-outlined">add_photo_alternate</span>
              <span className="text-[10px] font-bold mt-1">{t("listingIntake.add")}</span>
            </button>
          </div>
          <input ref={photoInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && uploadFiles(e.target.files, "photos")} />
        </section>

        {/* Specs */}
        <section className="bg-white/60 rounded-3xl p-5 md:p-7 mb-6 border border-primary/5 space-y-4">
          <h2 className="font-black text-primary">{t("listingIntake.specsTitle")}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t("listingIntake.type")}</label>
              <select value={form.property_type} onChange={(e) => set("property_type", e.target.value)} className={inputCls}>
                <option value="Villa">Villa</option>
                <option value="Loft">Loft</option>
                <option value="Apartment">Apartment</option>
                <option value="Land">Land</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("listingIntake.tenure")}</label>
              <select value={form.tenure} onChange={(e) => set("tenure", e.target.value)} className={inputCls}>
                <option value="Leasehold">Leasehold</option>
                <option value="Freehold">Freehold</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("listingIntake.bedrooms")}</label>
              <input type="number" min="0" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t("listingIntake.bathrooms")}</label>
              <input type="number" min="0" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t("listingIntake.area")}</label>
              <input type="number" min="0" value={form.area_m2} onChange={(e) => set("area_m2", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t("listingIntake.zone")}</label>
              <input type="text" value={form.zone} onChange={(e) => set("zone", e.target.value)} placeholder={t("listingIntake.zonePh")} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t("listingIntake.price")}</label>
              <input type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t("listingIntake.currency")}</label>
              <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls}>
                <option value="EUR">EUR €</option>
                <option value="USD">USD $</option>
                <option value="IDR">IDR Rp</option>
                <option value="AUD">AUD $</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>{t("listingIntake.details")}</label>
            <textarea value={form.details} onChange={(e) => set("details", e.target.value)} rows={5} placeholder={t("listingIntake.detailsPh")} className={inputCls} />
          </div>
        </section>

        {/* Plans */}
        <section className="bg-white/60 rounded-3xl p-5 md:p-7 mb-6 border border-primary/5">
          <h2 className="font-black text-primary mb-1">{t("listingIntake.plansTitle")}</h2>
          <p className="text-sm text-primary/50 mb-4">{t("listingIntake.plansHint")}</p>
          <div className="flex flex-wrap gap-3">
            {plans.map((a, i) => (
              <div key={i} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-primary/10">
                <span className="material-symbols-outlined text-primary/40 text-lg">description</span>
                <span className="text-xs font-semibold text-primary max-w-[140px] truncate">{a.name}</span>
                <button onClick={() => removeAsset("plans", i)} className="text-primary/30 hover:text-red-500">✕</button>
              </div>
            ))}
            <button onClick={() => planInput.current?.click()} className="flex items-center gap-2 rounded-xl border-2 border-dashed border-primary/20 px-4 py-2 text-primary/40 hover:border-primary/40 transition">
              <span className="material-symbols-outlined text-lg">upload_file</span>
              <span className="text-xs font-bold">{t("listingIntake.add")}</span>
            </button>
          </div>
          <input ref={planInput} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => e.target.files && uploadFiles(e.target.files, "plans")} />
        </section>

        <button
          onClick={submit}
          disabled={saving || uploading}
          className="w-full bg-primary text-white font-black uppercase tracking-widest py-4 rounded-2xl shadow-xl hover:brightness-110 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          {uploading ? t("listingIntake.uploading") : saving ? t("listingIntake.sending") : t("listingIntake.submit")}
        </button>
        <p className="text-center text-[11px] text-primary/40 mt-3">{t("listingIntake.canEditLater")}</p>
      </div>
    </div>
  );
}
