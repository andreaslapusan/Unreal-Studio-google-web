import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { recordFormSubmit } from '../lib/attribution';
import { trackLead } from '../lib/fbPixel';
import { gtmGenerateLead, gtmWhatsappClick } from '../lib/gtm';
import { usePageMeta } from '../components/PageMeta';

const Contact: React.FC = () => {
  const { t } = useTranslation();
  usePageMeta({ title: t('contact.title'), description: t('contact.metaDescription') });
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    reason: 'Diversificar patrimonio',
    budget: '50k - 100k',
    timeframe: 'Lo antes posible',
    message: ''
  });
  // Tras enviar: guardamos la URL de WhatsApp para (a) confirmar al usuario y
  // (b) ofrecer un enlace manual si el navegador bloqueó la pestaña emergente.
  const [sent, setSent] = useState<{ url: string; blocked: boolean } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Sync to GHL via lead_attributions → ghl-sync trigger. Always writes
    // (not just when UTM stored), so direct form fills also create a
    // GHL contact with email/phone for follow-up. Fire-and-forget so a
    // slow Supabase call doesn't block the WhatsApp redirect.
    void recordFormSubmit({
      name: formData.name,
      email: formData.email || null,
      phone: formData.phone || null,
      defaultSource: 'web_form_contacto',
    });

    // Meta Pixel: form submit = Lead conversion event.
    trackLead({ content_name: 'Contact form', content_category: 'web_form_contacto' });
    // El formulario ahora redirige por EMAIL (hello@unrealstudiobali.com), no WhatsApp.
    gtmGenerateLead({ form_id: 'contact', form_destination: 'email' });

    const subject = 'Solicitud de reunión - Unreal Studio';
    const body =
      `Nombre: ${formData.name}\n` +
      `Email: ${formData.email || '—'}\n` +
      `Teléfono: ${formData.phone || '—'}\n` +
      `Motivo: ${formData.reason}\n` +
      `Presupuesto: ${formData.budget}\n` +
      `Plazo: ${formData.timeframe}\n` +
      `Mensaje: ${formData.message || 'Sin mensaje adicional'}`;

    const url = `mailto:hello@unrealstudiobali.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    const win = window.open(url, '_blank');
    setSent({ url, blocked: !win });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const fieldCls = 'w-full bg-transparent border-0 border-b border-primary/25 rounded-none px-0 py-3 text-primary text-base font-medium placeholder:text-primary/30 focus:ring-0 focus:border-clay outline-none transition-colors';
  const labelCls = 'us-label text-primary/50';

  return (
    <div className="bg-almond min-h-screen">
      <main className="max-w-[1440px] mx-auto px-5 md:px-12 pt-10 md:pt-16 pb-24 md:pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-end mb-14 md:mb-20">
          <h1 className="lg:col-span-8 font-display uppercase text-primary text-[2.6rem] leading-[0.95] sm:text-6xl md:text-7xl xl:text-[6rem] xl:leading-[0.92] us-rise">
            {t('contact.heroTitle1')} {t('contact.heroTitle2')}
          </h1>
          <p className="lg:col-span-4 text-base md:text-lg text-primary/65 leading-relaxed lg:pb-3">
            {t('contact.heroSubtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start text-left">

          {/* Formulario */}
          <div className="lg:col-span-7 bg-paper border border-primary/15 p-6 md:p-12">
             <div className="mb-2">
                <h2 className="font-serif text-2xl md:text-3xl text-primary">{t('contact.formTitle')}</h2>
                <p className="text-[15px] text-primary/55 mt-3 mb-10 max-w-lg">
                  {t('contact.formIntro')}
                </p>

                {sent && (
                  <div className="mb-8 border border-emerald-700/25 bg-emerald-50/60 p-5">
                    <p className="font-bold text-green-700 flex items-center gap-2">
                      <span className="material-symbols-outlined">check_circle</span>
                      {t('contact.successTitle', '¡Perfecto! Hemos recibido tus datos.')}
                    </p>
                    <p className="text-sm text-green-700/80 mt-1">
                      {sent.blocked
                        ? t('contact.successBlocked', 'Tu navegador no pudo abrir el correo. Toca el botón para enviárnoslo:')
                        : t('contact.successBody', 'Te hemos abierto tu correo para enviarnos los datos. Si no se abrió, usa el botón:')}
                    </p>
                    <a href={sent.url} target="_blank" rel="noreferrer" className="us-btn mt-4 !bg-emerald-800 hover:!bg-emerald-900">
                      <span className="material-symbols-outlined text-base">mail</span>{t('contact.openWhatsapp', 'Abrir correo')}
                    </a>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <label className={labelCls}>{t('contact.fullName')}</label>
                      <input
                        type="text"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        placeholder={t('contact.fullNamePlaceholder')}
                        className={`${fieldCls}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>{t('fix.contact.emailLabelRequired')}</label>
                      <input
                        type="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        placeholder={t('fix.contact.emailPlaceholder')}
                        className={`${fieldCls}`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <label className={labelCls}>{t('contact.phoneLabel')}</label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder={t('fix.contact.phonePlaceholder')}
                        className={`${fieldCls}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>{t('contact.reason')}</label>
                      <div className="relative">
                        <select
                            aria-label={t('contact.reason')}
                            name="reason"
                            value={formData.reason}
                            onChange={handleChange}
                            className={`${fieldCls} cursor-pointer pr-8`}
                        >
                          <option>{t('contact.reasons.diversify')}</option>
                          <option>{t('contact.reasons.roi')}</option>
                          <option>{t('contact.reasons.vacation')}</option>
                          <option>{t('contact.reasons.retirement')}</option>
                        </select>
                                              </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-1">
                       <label className={labelCls}>{t('contact.budget')}</label>
                       <div className="relative">
                         <select
                            aria-label={t('contact.budget')}
                            name="budget"
                            value={formData.budget}
                            onChange={handleChange}
                            className={`${fieldCls} cursor-pointer pr-8`}
                         >
                           <option>{t('contact.budgets.under50')}</option>
                           <option>{t('contact.budgets.b50to100')}</option>
                           <option>{t('contact.budgets.b100to250')}</option>
                           <option>{t('contact.budgets.b250to500')}</option>
                           <option>{t('contact.budgets.over500')}</option>
                         </select>
                                                </div>
                    </div>
                    <div className="space-y-1">
                       <label className={labelCls}>{t('contact.timeframe')}</label>
                       <div className="relative">
                         <select
                            aria-label={t('contact.timeframe')}
                            name="timeframe"
                            value={formData.timeframe}
                            onChange={handleChange}
                            className={`${fieldCls} cursor-pointer pr-8`}
                         >
                           <option>{t('contact.tf.asap')}</option>
                           <option>{t('contact.tf.m1')}</option>
                           <option>{t('contact.tf.m3')}</option>
                           <option>{t('contact.tf.exploring')}</option>
                         </select>
                                                </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className={labelCls}>{t('contact.message')}</label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      placeholder={t('contact.messagePlaceholder')}
                      rows={3}
                      className={`${fieldCls} resize-none`}
                    />
                  </div>

                  <button type="submit" className="us-btn w-full sm:w-auto">
                    {t('contact.submit')} <span className="material-symbols-outlined">arrow_forward</span>
                  </button>
                  
                  <p className="text-xs text-primary/45">
                    {t('contact.privacyNote')}
                  </p>
                </form>
             </div>
          </div>

          <aside className="lg:col-span-5 bg-primary text-almond p-6 md:p-10 lg:sticky lg:top-28">
            <p className="us-label text-clay-light">{t('contact.directChannels')}</p>
            <a className="group block mt-4 pb-8" href="mailto:hello@unrealstudiobali.com">
              <p className="us-label text-almond/45">{t('contact.emailLabel')}</p>
              <span className="block font-serif text-xl sm:text-2xl md:text-[1.7rem] mt-2 break-all transition-colors group-hover:text-clay-light">hello@unrealstudiobali.com</span>
            </a>
              <a href="https://maps.app.goo.gl/abmGvNJzsbuM3pxr5?g_st=ic" target="_blank" rel="noopener noreferrer" className="group block py-7 border-t border-almond/15">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="us-label text-almond/45">{t('contact.hqLabel')}</p>
                    <h3 className="font-display uppercase text-3xl md:text-4xl mt-2">{t('fix.contact.madridCity')}</h3>
                  </div>
                  <span className="material-symbols-outlined text-2xl text-clay-light transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:translate-x-1">north_east</span>
                </div>
                <p className="text-[15px] text-almond/65 mt-3 leading-relaxed">{t('fix.contact.madridAddressLine1')}<br />{t('fix.contact.madridAddressLine2')}</p>
                <span className="us-link text-almond/80 mt-4">{t('contact.viewLocation')}</span>
              </a>
              <a href="https://maps.app.goo.gl/bnYDvKsJu7GWdUfA8?g_st=ic" target="_blank" rel="noopener noreferrer" className="group block py-7 border-t border-almond/15">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="us-label text-almond/45">{t('contact.asiaLabel')}</p>
                    <h3 className="font-display uppercase text-3xl md:text-4xl mt-2">{t('fix.contact.baliCity')}</h3>
                  </div>
                  <span className="material-symbols-outlined text-2xl text-clay-light transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:translate-x-1">north_east</span>
                </div>
                <p className="text-[15px] text-almond/65 mt-3 leading-relaxed">{t('fix.contact.baliAddressLine1')}<br />{t('fix.contact.baliAddressLine2')}</p>
                <span className="us-link text-almond/80 mt-4">{t('contact.viewLocation')}</span>
              </a>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Contact;