import React, { useEffect } from 'react';

const Privacy: React.FC = () => {
  useEffect(() => { document.title = 'Política de Privacidad | Unreal Studio Madrid'; }, []);
  return (
    <div className="bg-almond min-h-screen pt-16 pb-24 px-6 md:px-12 transition-colors duration-300">
      <div className="max-w-4xl mx-auto bg-white rounded-[3rem] p-8 md:p-16 lg:p-20 shadow-xl text-left border border-primary/5">
        <h1 className="text-4xl md:text-5xl text-primary mb-12">Política de Privacidad</h1>
        
        <div className="space-y-12 text-primary/80 leading-relaxed font-light text-base md:text-lg">
          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">QUIÉNES SOMOS</h2>
            <p>
              Nuestra dirección web es: <a href="https://unrealstudio.es" className="underline font-medium">https://unrealstudio.es</a>. En Unreal Studio reconocemos la importancia de proteger la privacidad y los derechos de las personas en relación con su información personal. Este documento es nuestra política de privacidad y explica cómo recopilamos y gestionamos sus datos personales.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">RESPONSABLE DEL TRATAMIENTO</h2>
            <p>
              El responsable del tratamiento de los datos es Unreal Studio, entidad responsable de los proyectos inmobiliarios y servicios anunciados a través de esta web y de las campañas publicitarias asociadas.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">QUÉ DATOS PERSONALES RECOPILAMOS Y POR QUÉ</h2>
            <p>
              Podemos recopilar su nombre, dirección postal o física, dirección de correo electrónico, número de teléfono, edad o fecha de nacimiento, profesión, ocupación o cargo laboral, datos de identificación gubernamental y cualquier información adicional relacionada con usted que nos proporcione directamente a través de nuestros sitios web o indirectamente a través del uso de nuestros sitios web o presencia en línea, a través de nuestros representantes o de cualquier otra forma, así como información que nos proporcione a través de nuestro centro de atención al cliente, encuestas de satisfacción o visitas de nuestros representantes.
            </p>
            <p className="mt-4">
              También podemos recopilar información que no es personal porque no le identifica a usted ni a nadie más. Por ejemplo, podemos recopilar respuestas anónimas a encuestas o información agregada sobre cómo los usuarios utilizan nuestro sitio web.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">FINALIDAD DEL TRATAMIENTO</h2>
            <p>Los datos personales facilitados a través de formularios, mensajes o campañas publicitarias en redes sociales se utilizarán únicamente para:</p>
            <ul className="list-disc ml-6 mt-4 space-y-2">
              <li>Facilitar información relacionada con proyectos inmobiliarios</li>
              <li>Atender solicitudes de contacto</li>
              <li>Realizar comunicaciones informativas vinculadas a nuestros servicios</li>
              <li>Mejorar nuestros productos y servicios en línea</li>
              <li>Gestionar participaciones en concursos, promociones o solicitudes de información</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">CÓMO RECOPILAMOS SU INFORMACIÓN PERSONAL</h2>
            <p>Recopilamos su información personal directamente de usted, salvo que sea irrazonable o impracticable hacerlo. Las formas de recopilación incluyen:</p>
            <ul className="list-disc ml-6 mt-4 space-y-2">
              <li>A través de su acceso y uso de nuestro sitio web</li>
              <li>Por teléfono, carta o correo electrónico</li>
              <li>Durante conversaciones entre usted y nuestros representantes</li>
              <li>Al contratar con nosotros</li>
              <li>Al participar en concursos, promociones o solicitar información</li>
              <li>Al completar encuestas, proporcionar comentarios o presentar quejas</li>
            </ul>
            <p className="mt-6">También podemos recopilar información personal de terceros, incluyendo:</p>
            <ul className="list-disc ml-6 mt-4 space-y-2">
              <li>Empresas terceras como agencias de informes crediticios, organismos policiales y entidades gubernamentales</li>
              <li>Sus representantes (abogados, contables y asesores financieros)</li>
              <li>Su empleador</li>
              <li>Fuentes de información disponibles públicamente u otras organizaciones donde haya dado su consentimiento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">LEGITIMACIÓN</h2>
            <p>La base legal para el tratamiento de los datos es:</p>
            <ul className="list-disc ml-6 mt-4 space-y-2">
              <li>El consentimiento expreso del usuario, otorgado al enviar formularios o iniciar contacto</li>
              <li>El interés legítimo en mantener y mejorar nuestros servicios</li>
              <li>El cumplimiento de obligaciones contractuales</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">COOKIES</h2>
            <p>
              Cuando accede a nuestro sitio web, podemos enviar una "cookie" (un pequeño archivo de resumen que contiene un número de identificación único) a su ordenador. Esto nos permite reconocer su ordenador y realizar un seguimiento de su actividad en nuestro sitio web durante un período de tiempo.
            </p>
            <p className="mt-4">
              También utilizamos cookies para medir patrones de tráfico, determinar qué áreas de nuestro sitio web han sido visitadas y medir patrones de transacciones de forma agregada. Utilizamos esta información para investigar los hábitos de nuestros usuarios con el fin de mejorar nuestros productos y servicios en línea. Nuestras cookies no recopilan información personal.
            </p>
            <p className="mt-4">Si no desea recibir cookies, puede configurar su navegador para que su ordenador no las acepte.</p>
            <p className="mt-4">Podemos registrar direcciones IP (es decir, las direcciones electrónicas de ordenadores conectados a internet) para analizar tendencias, administrar el sitio web y rastrear los movimientos de los usuarios.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">CONTENIDO INCRUSTADO DE OTROS SITIOS WEB</h2>
            <p>
              Los artículos en este sitio pueden incluir contenido incrustado (por ejemplo, vídeos, imágenes, artículos, etc.). El contenido incrustado de otros sitios web se comporta exactamente de la misma manera que si el visitante hubiera visitado el otro sitio web.
            </p>
            <p className="mt-4">
              Estos sitios web pueden recopilar datos sobre usted, usar cookies, incrustar seguimiento adicional de terceros y monitorear su interacción con ese contenido incrustado, incluyendo el seguimiento de su interacción si tiene una cuenta y está conectado a ese sitio web.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">CON QUIÉN COMPARTIMOS SUS DATOS</h2>
            <p>
              Podemos divulgar información personal a nuestras entidades relacionadas y a proveedores y prestadores de servicios terceros ubicados en el extranjero para algunos de los propósitos mencionados anteriormente. Tomamos medidas razonables para garantizar que los destinatarios de su información personal no infrinjan las obligaciones de privacidad relacionadas con su información personal.
            </p>
            <p className="mt-4">Los datos no serán cedidos a terceros, salvo obligación legal.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">CONSERVACIÓN DE LOS DATOS</h2>
            <p>
              Si deja un comentario, el comentario y sus metadatos se conservan indefinidamente. Esto es para que podamos reconocer y aprobar automáticamente cualquier comentario de seguimiento en lugar de mantenerlos en una cola de moderación.
            </p>
            <p className="mt-4">
              Para los usuarios que se registran en nuestro sitio web, también almacenamos la información personal que proporcionan en su perfil de usuario. Todos los usuarios pueden ver, editar o eliminar su información personal en cualquier momento (excepto que no pueden cambiar su nombre de usuario). Los administradores del sitio web también pueden ver y editar esa información.
            </p>
            <p className="mt-4">
              Los datos se conservarán durante el tiempo estrictamente necesario para cumplir con la finalidad para la que fueron recabados o mientras exista una relación de interés legítimo entre las partes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">DERECHOS DEL USUARIO</h2>
            <p>
              Si tiene una cuenta en este sitio o ha dejado comentarios, puede solicitar recibir un archivo exportado de los datos personales que tenemos sobre usted, incluidos los datos que nos haya proporcionado. También puede solicitar que borremos cualquier dato personal que tengamos sobre usted. Esto no incluye ningún dato que estemos obligados a conservar con fines administrativos, legales o de seguridad.
            </p>
            <p className="mt-4">Los derechos que puede ejercer en cualquier momento son:</p>
            <ul className="list-disc ml-6 mt-4 space-y-2">
              <li>Acceso a sus datos personales</li>
              <li>Rectificación de datos inexactos</li>
              <li>Supresión de sus datos</li>
              <li>Limitación del tratamiento</li>
              <li>Oposición al tratamiento</li>
              <li>Portabilidad de los datos</li>
            </ul>
            <p className="mt-6">Para ejercer estos derechos, póngase en contacto con nosotros a través de los canales de contacto habilitados.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">PROCESO DE RECLAMACIÓN POR VIOLACIÓN DE PRIVACIDAD</h2>
            <p>
              Si cree que se ha violado su privacidad, póngase en contacto con nosotros utilizando la información de contacto que figura a continuación y proporcione detalles del incidente para que podamos investigarlo. Trataremos la queja de acuerdo con nuestro Procedimiento de Gestión de Quejas vigente.
            </p>
            <p className="mt-4">
              Trataremos sus solicitudes o quejas de forma confidencial. Nuestro representante se pondrá en contacto con usted en un plazo razonable después de recibir su queja para discutir sus preocupaciones y explicar las opciones sobre cómo pueden resolverse. Nos aseguraremos de que su queja se resuelva de manera oportuna y apropiada.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">MEDIDAS DE SEGURIDAD</h2>
            <p>
              Como nuestro sitio web está vinculado a internet, y éste es inherentemente inseguro, no podemos proporcionar ninguna garantía sobre la seguridad de la transmisión de información que nos comunique en línea. Tampoco podemos garantizar que la información que nos proporcione no será interceptada mientras se transmite a través de internet. En consecuencia, cualquier información personal u otra información que nos transmita en línea se transmite bajo su propio riesgo.
            </p>
            <p className="mt-4">
              El responsable del tratamiento adopta las medidas técnicas y organizativas necesarias para garantizar la seguridad y confidencialidad de los datos personales.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">CAMBIOS EN NUESTRA POLÍTICA DE PRIVACIDAD</h2>
            <p>Podemos cambiar esta política de privacidad de vez en cuando. Cualquier versión actualizada de esta política de privacidad se publicará en nuestro sitio web.</p>
            <p className="mt-4 italic">Esta política de privacidad se actualizó por última vez el 5 de febrero de 2026.</p>
          </section>

          <section className="pt-10 border-t border-primary/10">
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">CONTACTO CON UNREAL STUDIO</h2>
            <p>
              Si tiene alguna pregunta sobre esta política de privacidad, alguna preocupación o comentario sobre el tratamiento de su privacidad, utilice el enlace de contacto en nuestro sitio web o diríjase a:
            </p>
            <div className="mt-4 p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="font-bold text-primary">Unreal Studio</p>
              <p className="text-sm">Sitio web: <a href="https://unrealstudio.es" className="underline">https://unrealstudio.es</a></p>
            </div>
          </section>

          <section className="text-[10px] uppercase font-bold tracking-widest text-primary/40 pt-10">
            Cumplimiento normativo: Esta política de privacidad cumple con el Reglamento (UE) 2016/679 (RGPD), la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD), y los requisitos de Meta para campañas publicitarias.
          </section>
        </div>
      </div>
    </div>
  );
};

export default Privacy;