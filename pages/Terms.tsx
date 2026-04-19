import React, { useEffect } from 'react';

const Terms: React.FC = () => {
  useEffect(() => { document.title = 'Términos y Condiciones | Unreal Studio Madrid'; }, []);
  return (
    <div className="bg-almond min-h-screen pt-16 pb-24 px-6 md:px-12 transition-colors duration-300">
      <div className="max-w-4xl mx-auto bg-white rounded-[3rem] p-10 md:p-20 shadow-xl text-left border border-primary/5">
        <h1 className="text-5xl text-primary mb-12">Términos y Condiciones</h1>
        
        <div className="space-y-10 text-primary/70 leading-relaxed font-light text-lg">
          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">1. Aceptación de Términos</h2>
            <p>
              Al acceder y utilizar este sitio web, usted acepta cumplir y estar sujeto a los siguientes términos y condiciones de uso. Si no está de acuerdo con alguna parte de estos términos, no debe utilizar nuestro sitio web.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">2. Naturaleza de la Información</h2>
            <p>
              El contenido de este sitio web es solo para fines informativos y no constituye asesoramiento financiero, legal o fiscal profesional. Aunque nos esforzamos por mantener la información actualizada, Unreal Studio no garantiza la exactitud absoluta de las proyecciones de ROI mostradas.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">3. Exención de Responsabilidad sobre Inversiones</h2>
            <p>
              Toda inversión inmobiliaria conlleva riesgos. Los rendimientos pasados no garantizan resultados futuros. Las cifras de rentabilidad (ROI) son estimaciones basadas en estudios de mercado actuales y pueden variar debido a factores macroeconómicos, cambios regulatorios en Indonesia o España, y fluctuaciones turísticas.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">4. Propiedad Intelectual</h2>
            <p>
              Todos los diseños arquitectónicos, renders, fotografías y contenidos textuales en este sitio son propiedad exclusiva de Unreal Studio Madrid. Queda prohibida la reproducción total o parcial sin autorización expresa por escrito.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">5. Legislación de Bali (Leasehold)</h2>
            <p>
              El usuario reconoce conocer que la mayoría de los activos ofrecidos en Bali, Indonesia, operan bajo el régimen de <em>Leasehold</em> (arrendamiento a largo plazo), de acuerdo con la legislación indonesia para inversores extranjeros. Los detalles específicos de cada contrato se discutirán de forma privada con los interesados.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">6. Jurisdicción</h2>
            <p>
              Cualquier disputa que surja del uso de este sitio web estará sujeta a las leyes de España y a la jurisdicción exclusiva de los tribunales de Madrid.
            </p>
          </section>

          <section className="pt-10 border-t border-primary/10 text-sm italic">
            <p>Copyright © 2026 Unreal Studio Madrid. Todos los derechos reservados.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Terms;