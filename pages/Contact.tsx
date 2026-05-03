import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { recordFormSubmit } from '../lib/attribution';
import { trackLead } from '../lib/fbPixel';
import { gtmGenerateLead, gtmWhatsappClick } from '../lib/gtm';

const Contact: React.FC = () => {
  const { t } = useTranslation();
  useEffect(() => { document.title = t('contact.title'); }, [t]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    reason: 'Diversificar patrimonio',
    budget: '50k - 100k',
    timeframe: 'Lo antes posible',
    message: ''
  });

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
    // GTM dataLayer: GA4 generate_lead + whatsapp_click (the form redirects
    // to WhatsApp, so both events are fired in sequence).
    gtmGenerateLead({ form_id: 'contact', form_destination: 'whatsapp' });
    gtmWhatsappClick({ source: 'contact_form', phone: '6285217790692' });

    const text = `*SOLICITUD DE REUNIÓN - UNREAL STUDIO*%0A%0A` +
      `👤 *Nombre:* ${formData.name}%0A` +
      `📧 *Email:* ${formData.email || '—'}%0A` +
      `📞 *Teléfono:* ${formData.phone || '—'}%0A` +
      `🎯 *Motivo:* ${formData.reason}%0A` +
      `💰 *Presupuesto:* ${formData.budget}%0A` +
      `⏳ *Plazo:* ${formData.timeframe}%0A` +
      `📝 *Mensaje:* ${formData.message || 'Sin mensaje adicional'}`;

    const url = `https://wa.me/6285217790692?text=${text}`;

    window.open(url, '_blank');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="bg-almond transition-colors duration-300 min-h-screen">
      <main className="px-6 md:px-12 pt-16 pb-24">
        <div className="max-w-4xl mx-auto text-center mb-20">
          <h1 className="text-5xl md:text-7xl leading-tight text-primary mb-8">
            {t('contact.heroTitle1')} <br className="hidden md:block" />{t('contact.heroTitle2')}
          </h1>
          <p className="text-lg md:text-xl text-primary/70 font-light max-w-2xl mx-auto leading-relaxed">
            {t('contact.heroSubtitle')}
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start text-left">
          
          {/* Formulario de Contacto / WhatsApp Generator */}
          <div className="lg:col-span-7 bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-12 shadow-2xl border border-primary/5 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100%] -mr-8 -mt-8 z-0"></div>
             
             <div className="relative z-10 mb-8">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-green-500 text-white rounded-2xl flex items-center justify-center shadow-lg rotate-3 shrink-0">
                        {/* SVG de WhatsApp para evitar problemas de fuentes */}
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                    </div>
                    <h2 className="text-2xl md:text-3xl text-primary font-serif">{t('contact.formTitle')}</h2>
                </div>
                <p className="text-sm text-gray-500 font-medium mb-8">
                  {t('contact.formIntro')}
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1">{t('contact.fullName')}</label>
                      <input
                        type="text"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        placeholder={t('contact.fullNamePlaceholder')}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-primary font-bold focus:ring-2 focus:ring-primary/20 outline-none transition"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1">Email *</label>
                      <input
                        type="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="tu@email.com"
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-primary font-bold focus:ring-2 focus:ring-primary/20 outline-none transition"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1">WhatsApp / Teléfono</label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="+34 600 000 000"
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-primary font-bold focus:ring-2 focus:ring-primary/20 outline-none transition"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1">{t('contact.reason')}</label>
                      <div className="relative">
                        <select
                            aria-label={t('contact.reason')}
                            name="reason"
                            value={formData.reason}
                            onChange={handleChange}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-primary font-bold focus:ring-2 focus:ring-primary/20 outline-none transition appearance-none cursor-pointer bg-none"
                        >
                          <option>Diversificar patrimonio</option>
                          <option>Alta rentabilidad (ROI)</option>
                          <option>Casa vacacional</option>
                          <option>Plan de retiro</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">expand_more</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1">{t('contact.budget')}</label>
                       <div className="relative">
                         <select
                            aria-label={t('contact.budget')}
                            name="budget"
                            value={formData.budget}
                            onChange={handleChange}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-primary font-bold focus:ring-2 focus:ring-primary/20 outline-none transition appearance-none cursor-pointer bg-none"
                         >
                           <option>Menos de 50k</option>
                           <option>50k - 100k</option>
                           <option>100k - 250k</option>
                           <option>250k - 500k</option>
                           <option>Más de 500k</option>
                         </select>
                         <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">expand_more</span>
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1">{t('contact.timeframe')}</label>
                       <div className="relative">
                         <select
                            aria-label={t('contact.timeframe')}
                            name="timeframe"
                            value={formData.timeframe}
                            onChange={handleChange}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-primary font-bold focus:ring-2 focus:ring-primary/20 outline-none transition appearance-none cursor-pointer bg-none"
                         >
                           <option>Lo antes posible</option>
                           <option>En 1 mes</option>
                           <option>En 3 meses</option>
                           <option>Solo estoy explorando</option>
                         </select>
                         <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">expand_more</span>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-1">{t('contact.message')}</label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      placeholder={t('contact.messagePlaceholder')}
                      rows={3}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-primary font-medium focus:ring-2 focus:ring-primary/20 outline-none transition resize-none"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white py-4 rounded-xl font-bold text-sm uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02]"
                  >
                    <span>{t('contact.submit')}</span>
                    {/* SVG Send Icon */}
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  </button>
                  
                  <p className="text-[10px] text-center text-gray-400">
                    Al enviar, aceptas nuestra política de privacidad. Te responderemos en menos de 24h.
                  </p>
                </form>
             </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            {/* Información de contacto estática */}
            <div className="bg-[#EBE0D3] rounded-[2.5rem] p-8 border border-primary/5">
              <h3 className="text-xl font-bold text-primary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-600">bolt</span> Canales Directos
              </h3>
              <div className="space-y-4">
                <a className="flex items-center gap-4 p-4 bg-white/60 rounded-2xl hover:bg-white transition group" href="mailto:hola@unrealstudio.com">
                  <div className="bg-primary/10 p-3 rounded-full group-hover:bg-primary group-hover:text-white transition text-primary">
                    <span className="material-symbols-outlined text-xl">mail</span>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-gray-500">Correo Electrónico</p>
                    <span className="font-medium text-primary">hola@unrealstudio.com</span>
                  </div>
                </a>
                <a className="flex items-center gap-4 p-4 bg-white/60 rounded-2xl hover:bg-white transition group" href="https://wa.me/6285217790692" target="_blank" rel="noopener noreferrer">
                  <div className="bg-green-100 text-green-700 p-3 rounded-full group-hover:bg-green-600 group-hover:text-white transition">
                    <span className="material-symbols-outlined text-xl">chat</span>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-gray-500">Soporte General</p>
                    <span className="font-medium text-primary">Chat Directo</span>
                  </div>
                </a>
              </div>
            </div>

            {/* Madrid Office */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-primary/5 flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-bold text-xl text-primary">Madrid, España</h4>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 mt-1">Sede Central</p>
                </div>
                <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-100 shadow-sm">
                  <img alt="Madrid" className="w-full h-full object-cover grayscale opacity-80" src="https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&q=80&w=200&h=200" />
                </div>
              </div>
              <p className="text-sm text-gray-500 font-light mb-6 leading-relaxed">
                C. de San Nicolás, 17, Centro<br />28013 Madrid, España
              </p>
              <a 
                className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest text-primary border-b border-primary/20 pb-1 hover:border-primary transition w-fit" 
                href="https://maps.app.goo.gl/abmGvNJzsbuM3pxr5?g_st=ic" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                Ver ubicación <span className="material-symbols-outlined text-sm ml-1">north_east</span>
              </a>
            </div>

            {/* Bali Office */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-primary/5 flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-bold text-xl text-primary">Bali, Indonesia</h4>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 mt-1">Operaciones Asia</p>
                </div>
                <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-100 shadow-sm">
                  <img alt="Bali" className="w-full h-full object-cover grayscale opacity-80" src="https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&q=80&w=200&h=200" />
                </div>
              </div>
              <p className="text-sm text-gray-500 font-light mb-6 leading-relaxed">
                Jl. Pratu Rai Madra No.15, Cemagi, Kec. Mengwi<br />Kabupaten Badung, Bali, Indonesia
              </p>
              <a 
                className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest text-primary border-b border-primary/20 pb-1 hover:border-primary transition w-fit" 
                href="https://maps.app.goo.gl/bnYDvKsJu7GWdUfA8?g_st=ic" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                Ver ubicación <span className="material-symbols-outlined text-sm ml-1">north_east</span>
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Contact;