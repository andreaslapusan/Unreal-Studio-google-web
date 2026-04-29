-- Seed: Andreas' 16 polished investor FAQs from the Yolanda case (2026-04-29).
-- Published immediately so /faq has content as soon as the page ships.
-- Sort order leaves room (10-step gaps) so we can interleave new entries later.

insert into public.faqs (question, answer, category, project_filter, sort_order, is_published, language, source) values

('¿Por qué consta una superficie aproximada de 75 m² y no la real?',
 'Los Golf Bay Lofts se distribuyen en un terreno total de 550 m² repartido entre 8 lofts. Por loft son 68,75 m² entre zonas comunes y privadas de la planta baja, más la habitación de la primera planta — sumando todo, cada loft queda entre 75 y 80 m² construidos. Por eso aparece "aproximada": dependiendo del acabado final del primer piso, el total exacto cierra en ese rango.',
 'construccion', ARRAY['golf-bay-lofts'], 10, true, 'es', 'manual'),

('¿Se puede extender el leasehold más allá de los años iniciales?',
 'Sí está contemplada. Hay opción de extender otros 20 años extra al precio mencionado, así que partes de un leasehold inicial sólido y con la prórroga ya pactada de antemano si decides ejercerla.',
 'leasehold', ARRAY['golf-bay-lofts'], 20, true, 'es', 'manual'),

('¿Por qué se compra en rupias? ¿Qué tipo de cambio se utiliza?',
 'La legislación indonesia exige que las transacciones de leasehold se denominen en IDR (rupia local), por eso el contrato se cierra en rupias. Tú puedes pagar en cualquier divisa — en el momento de la compra fijamos el precio en euros con su correspondiente equivalente en rupias al cambio del día que cerremos, y los futuros pagos se hacen al cambio de esos IDR que toca pagar a la divisa que quieras enviar. Pagos en IDR todos, o en la divisa correspondiente en ese momento.',
 'compra', ARRAY[]::text[], 30, true, 'es', 'manual'),

('¿Hay penalización por retraso en la entrega?',
 'Debería estar reflejada de origen, sin problema incluimos la misma cláusula de penalización por retraso en entrega que la que tienes por retraso en pago — el contrato queda simétrico.',
 'legal', ARRAY[]::text[], 40, true, 'es', 'manual'),

('¿La villa se entrega amueblada? ¿Suministros conectados? ¿Hay cuotas de mantenimiento?',
 '**Suministros**: luz, agua y AC ya conectados de fábrica. El WiFi lo contrata directamente el property manager.\n\n**Mobiliario**: el precio incluye semi-furnished. Si quieres entrega con amueblamiento completo, lo cotizamos aparte sin problema.\n\n**Mantenimiento de áreas comunes** (piscina, recepción): se descuenta directamente del rental statement, no sale de tu bolsillo. Lo gestiona quien lleve los alquileres.\n\n**Limpieza de piscina**: ~10€/mes, marginal.\n\nSi decides alquilar mensual, los gastos totales (limpieza, piscina, jardín, agua, WiFi) no superarían los 130-150€/mes.',
 'construccion', ARRAY[]::text[], 50, true, 'es', 'manual'),

('¿Está permitido el subarrendamiento? ¿Y la licencia de alojamiento turístico?',
 'El contrato de leasehold ante notario te entrega todos los derechos de uso sobre el terreno y lo construido encima durante todos los años del leasehold. Eso significa que puedes hacer lo que quieras con la propiedad: venderla, arrendarla, subarrendarla.\n\nEn cuanto a permisos: ya hemos aplicado el SLF, y una vez finalizada la construcción se procede a gestionar todos los permisos restantes (Pondok Wisata + PBG). El timing depende del gobierno indonesio (no de nosotros) — actualmente está en aproximadamente 18 meses.',
 'legal', ARRAY[]::text[], 60, true, 'es', 'manual'),

('¿Cuáles son los gastos adicionales reales (impuestos, notario, comisiones)?',
 'Vamos a intentar declarar al notario solo el valor del terreno, lo que llevaría tu 1% notarial a unos 200-300€. En el peor de los casos, si no se logra, sería el 1% sobre el valor total de la transacción, es decir, alrededor de 1.000€. No hay más gastos por nuestra parte. Si tu banco te cobra comisión por la transferencia internacional, eso depende de tu entidad — no es algo que podamos calcular nosotros.',
 'fiscalidad', ARRAY[]::text[], 70, true, 'es', 'manual'),

('¿Por qué se renuncia a los artículos 1266 y 1267 del Código Civil indonesio?',
 'Se renuncian porque a cambio metemos cláusula de arbitraje BANI (Badan Arbitrase Nasional Indonesia) — más rápido, bilingüe, jurisdicción internacional reconocida. Es práctica estándar en este tipo de contratos en Indonesia y, lejos de dejarte desprotegida, te protege más: lo que cambia es el foro de resolución de disputas, no tus derechos. BANI resuelve en meses lo que un juez ordinario indonesio tardaría años.',
 'legal', ARRAY[]::text[], 80, true, 'es', 'manual'),

('¿Tengo que viajar a Bali para firmar?',
 'No. El 90% de nuestros inversores cierran la operación 100% remota desde España. Se firma a distancia con un POA (poder notarial) que se gestiona en una notaría española y se valida con la apostilla de La Haya. El notario en Bali ejecuta la compra con ese poder. Si vienes a Bali en algún momento, encantados de enseñarte la obra en persona — pero no es requisito.',
 'compra', ARRAY[]::text[], 90, true, 'es', 'manual'),

('¿Conviene comprar a título personal o a través de una empresa (Hong Kong, etc.)?',
 'Depende del volumen de inversión y de tu situación fiscal en España. Lo que solemos recomendar como estructura más eficiente es mantener la propiedad a título personal y canalizar los ingresos del alquiler a una empresa offshore (Hong Kong, Singapur o similar). Así separas el activo del flujo de caja. Pero esto lo afinamos contigo con un asesor fiscal español que te conecte; cada caso es distinto.',
 'fiscalidad', ARRAY[]::text[], 100, true, 'es', 'manual'),

('¿Cómo se gestiona el alquiler turístico una vez entregada la villa?',
 'Trabajamos con Chris de Suite Stay Vacation Homes, property manager local en Bali. Se encarga de: listing en Airbnb Pro + Booking, check-in / check-out de los huéspedes, limpieza, mantenimiento, jardinería, marketing y precios dinámicos, rental statement mensual con desglose de ingresos y gastos.\n\nTú no gestionas absolutamente nada. Recibes el neto mensual en tu cuenta. Comisión típica del PM: 12% de los ingresos brutos.',
 'alquiler', ARRAY[]::text[], 110, true, 'es', 'manual'),

('¿Qué impuestos pago en España por los ingresos del alquiler?',
 'Los rendimientos del alquiler son declarables como rendimientos del capital inmobiliario (persona física) o como ingresos de actividad (sociedad española). España e Indonesia tienen convenio de doble imposición, así que cualquier impuesto que pagues allí se deduce de lo que tributarías aquí. La carga efectiva varía mucho según estructura — esto lo calculamos contigo y un asesor fiscal con números concretos antes de cerrar.',
 'fiscalidad', ARRAY[]::text[], 120, true, 'es', 'manual'),

('¿Y los impuestos en Indonesia?',
 '**En la compra**: solo el 1% al notario sobre el valor de la transacción (intentamos que sea sobre el valor del terreno).\n\n**En el alquiler**: en teoría 10% sobre los ingresos, pero como el dinero del alquiler lo cobra la empresa de gestión y te lo transfiere directamente a tu cuenta fuera de Indonesia, el flujo no pasa por tus manos en territorio indonesio, así que en la práctica no genera obligación fiscal local.',
 'fiscalidad', ARRAY[]::text[], 130, true, 'es', 'manual'),

('¿Y si quiero vender antes del final del leasehold?',
 'El leasehold es totalmente transmisible. A partir del año 5-7, una vez recuperada la inversión inicial vía alquiler, ya tienes el negocio montado: track record en Airbnb, reseñas, property manager funcionando — y al siguiente comprador le quedan 18+ años de contrato. Salida limpia. La venta también se firma desde España con poder.',
 'leasehold', ARRAY[]::text[], 140, true, 'es', 'manual'),

('¿Qué incluye exactamente la entrega de la villa?',
 '**Sí incluido en el precio:**\n- Construcción completa (estructura, tejado, acabados)\n- Suelos, paredes, pintura, carpintería\n- Instalaciones (luz, agua, AC) — WiFi lo gestiona el PM\n- Cocina equipada (lavabo, grifo, estufa, encimera)\n- Baños completos\n- Piscina privada + sistema de filtración\n- Permisos: Pondok Wisata + PBG + SLF\n- Mobiliario semi-furnished (cama, mesa, sofá)\n\n**Aparte (opcional):**\n- Amueblamiento completo premium / decoración\n- Electrodomésticos premium\n- Asesoría fiscal personalizada en España',
 'construccion', ARRAY[]::text[], 150, true, 'es', 'manual'),

('¿Puedo visitar la obra antes de comprar o durante la construcción?',
 'Sí, las veces que quieras. Cuando vengas a Bali, agendamos visita y te enseñamos personalmente. Si no puedes desplazarte, te enviamos reportes semanales o quincenales con foto y vídeo del progreso, más un PDF con el % de avance. Tendrás visibilidad continua de cómo va tu inversión.',
 'compra', ARRAY[]::text[], 160, true, 'es', 'manual')

on conflict do nothing;
