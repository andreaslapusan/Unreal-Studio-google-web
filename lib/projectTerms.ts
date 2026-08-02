// Traducción de términos de datos (amenities / equipamiento) que llegan de la BD
// en español. El vocabulario es un conjunto FIJO y conocido, definido en
// ProjectDetail.tsx (iconos de amenities + categorías de furnishing). Aquí lo
// traducimos a en/ro/id para que los visitantes no vean español.
//
// Regla de oro: si un término no está en el mapa, se devuelve tal cual (español).
// Así, añadir un amenity nuevo en la BD nunca rompe nada — solo saldría sin
// traducir hasta que se añada aquí. Mismo comportamiento que antes para lo no mapeado.

type Tr = { en: string; ro: string; id: string };

const TERMS: Record<string, Tr> = {
  // === Amenities / Servicios ===
  'Piscina privada': { en: 'Private pool', ro: 'Piscină privată', id: 'Kolam renang pribadi' },
  'Piscina compartida': { en: 'Shared pool', ro: 'Piscină comună', id: 'Kolam renang bersama' },
  'Gimnasio': { en: 'Gym', ro: 'Sală de fitness', id: 'Pusat kebugaran' },
  'Coworking': { en: 'Coworking', ro: 'Spațiu coworking', id: 'Ruang kerja bersama' },
  'Jardín tropical': { en: 'Tropical garden', ro: 'Grădină tropicală', id: 'Taman tropis' },
  'Terraza': { en: 'Terrace', ro: 'Terasă', id: 'Teras' },
  'Parking': { en: 'Parking', ro: 'Parcare', id: 'Parkir' },
  'Seguridad 24h': { en: '24h security', ro: 'Securitate 24h', id: 'Keamanan 24 jam' },
  'Cámaras de seguridad': { en: 'Security cameras', ro: 'Camere de securitate', id: 'Kamera keamanan' },
  'WiFi': { en: 'WiFi', ro: 'WiFi', id: 'WiFi' },
  'Aire acondicionado': { en: 'Air conditioning', ro: 'Aer condiționat', id: 'AC' },
  'Ventilador': { en: 'Fan', ro: 'Ventilator', id: 'Kipas angin' },
  'Cocina equipada': { en: 'Equipped kitchen', ro: 'Bucătărie utilată', id: 'Dapur lengkap' },
  'Lavandería': { en: 'Laundry', ro: 'Spălătorie', id: 'Ruang cuci' },
  'Zona barbacoa': { en: 'BBQ area', ro: 'Zonă barbecue', id: 'Area barbeku' },
  'Vistas al mar': { en: 'Sea views', ro: 'Vedere la mare', id: 'Pemandangan laut' },
  'Cercano a la playa': { en: 'Close to the beach', ro: 'Aproape de plajă', id: 'Dekat pantai' },
  'Recepción': { en: 'Reception', ro: 'Recepție', id: 'Resepsionis' },
  'Bar': { en: 'Bar', ro: 'Bar', id: 'Bar' },
  'Almacén': { en: 'Storage', ro: 'Depozit', id: 'Gudang' },
  'Spa': { en: 'Spa', ro: 'Spa', id: 'Spa' },
  'Sala de juegos': { en: 'Games room', ro: 'Sală de jocuri', id: 'Ruang permainan' },
  'Servicio de limpieza': { en: 'Cleaning service', ro: 'Serviciu de curățenie', id: 'Layanan kebersihan' },
  'Alquiler de motos': { en: 'Motorbike rental', ro: 'Închiriere scutere', id: 'Sewa motor' },

  // === Categorías de equipamiento ===
  'Baño': { en: 'Bathroom', ro: 'Baie', id: 'Kamar mandi' },
  'Instalaciones': { en: 'Installations', ro: 'Instalații', id: 'Instalasi' },
  'Dormitorio': { en: 'Bedroom', ro: 'Dormitor', id: 'Kamar tidur' },
  'Salón': { en: 'Living room', ro: 'Living', id: 'Ruang tamu' },
  'Exterior': { en: 'Outdoor', ro: 'Exterior', id: 'Luar ruangan' },
  'Cocina': { en: 'Kitchen', ro: 'Bucătărie', id: 'Dapur' },
  'Decoración': { en: 'Decoration', ro: 'Decorațiuni', id: 'Dekorasi' },

  // === Equipamiento — Baño ===
  'Ducha': { en: 'Shower', ro: 'Duș', id: 'Pancuran' },
  'Grifería': { en: 'Taps', ro: 'Baterii', id: 'Keran' },
  'Lavabo': { en: 'Washbasin', ro: 'Chiuvetă', id: 'Wastafel' },
  'Espejo de baño': { en: 'Bathroom mirror', ro: 'Oglindă de baie', id: 'Cermin kamar mandi' },
  'Toallero': { en: 'Towel rail', ro: 'Suport prosoape', id: 'Gantungan handuk' },
  'Mampara': { en: 'Shower screen', ro: 'Cabină de duș', id: 'Sekat kamar mandi' },

  // === Equipamiento — Instalaciones ===
  'Iluminación': { en: 'Lighting', ro: 'Iluminat', id: 'Pencahayaan' },
  'Enchufes': { en: 'Power sockets', ro: 'Prize', id: 'Stopkontak' },
  'Interruptores': { en: 'Switches', ro: 'Întrerupătoare', id: 'Sakelar' },
  'Ventilador de techo': { en: 'Ceiling fan', ro: 'Ventilator de tavan', id: 'Kipas langit-langit' },
  'Puertas': { en: 'Doors', ro: 'Uși', id: 'Pintu' },
  'Topes de puerta': { en: 'Door stops', ro: 'Opritoare de ușă', id: 'Penahan pintu' },

  // === Equipamiento — Dormitorio ===
  'Estructura de cama': { en: 'Bed frame', ro: 'Cadru de pat', id: 'Rangka tempat tidur' },
  'Colchón': { en: 'Mattress', ro: 'Saltea', id: 'Kasur' },
  'Mesilla de noche': { en: 'Nightstand', ro: 'Noptieră', id: 'Meja samping tempat tidur' },
  'Armario': { en: 'Wardrobe', ro: 'Dulap', id: 'Lemari' },
  'Ropa de cama': { en: 'Bed linen', ro: 'Lenjerie de pat', id: 'Seprai' },
  'Almohadas': { en: 'Pillows', ro: 'Perne', id: 'Bantal' },
  'Cortinas': { en: 'Curtains', ro: 'Perdele', id: 'Tirai' },

  // === Equipamiento — Salón ===
  'Sofá': { en: 'Sofa', ro: 'Canapea', id: 'Sofa' },
  'Mesa de centro': { en: 'Coffee table', ro: 'Măsuță de cafea', id: 'Meja tengah' },
  'Sillas': { en: 'Chairs', ro: 'Scaune', id: 'Kursi' },
  'Estanterías': { en: 'Shelves', ro: 'Rafturi', id: 'Rak' },
  'Alfombra': { en: 'Rug', ro: 'Covor', id: 'Karpet' },
  'Cojines decorativos': { en: 'Decorative cushions', ro: 'Perne decorative', id: 'Bantal dekoratif' },
  'Lámpara de pie': { en: 'Floor lamp', ro: 'Lampadar', id: 'Lampu lantai' },

  // === Equipamiento — Exterior ===
  'Tumbonas de piscina': { en: 'Pool loungers', ro: 'Șezlonguri de piscină', id: 'Kursi santai kolam' },
  'Mesa exterior': { en: 'Outdoor table', ro: 'Masă de exterior', id: 'Meja luar ruangan' },
  'Sillas exterior': { en: 'Outdoor chairs', ro: 'Scaune de exterior', id: 'Kursi luar ruangan' },
  'Sombrilla': { en: 'Parasol', ro: 'Umbrelă de soare', id: 'Payung' },
  'Macetas': { en: 'Plant pots', ro: 'Ghivece', id: 'Pot tanaman' },

  // === Equipamiento — Cocina ===
  'Nevera': { en: 'Fridge', ro: 'Frigider', id: 'Kulkas' },
  'Microondas': { en: 'Microwave', ro: 'Cuptor cu microunde', id: 'Microwave' },
  'Horno': { en: 'Oven', ro: 'Cuptor', id: 'Oven' },
  'Placa de cocción': { en: 'Cooktop', ro: 'Plită', id: 'Kompor' },
  'Campana extractora': { en: 'Extractor hood', ro: 'Hotă', id: 'Penghisap asap' },
  'Fregadero': { en: 'Kitchen sink', ro: 'Chiuvetă', id: 'Bak cuci piring' },
  'Cafetera': { en: 'Coffee maker', ro: 'Cafetieră', id: 'Pembuat kopi' },
  'Tostadora': { en: 'Toaster', ro: 'Prăjitor de pâine', id: 'Pemanggang roti' },
  'Hervidor': { en: 'Kettle', ro: 'Fierbător', id: 'Ketel' },
  'Batidora': { en: 'Blender', ro: 'Blender', id: 'Blender' },
  'Utensilios de cocina': { en: 'Kitchen utensils', ro: 'Ustensile de bucătărie', id: 'Peralatan dapur' },
  'Cubertería': { en: 'Cutlery', ro: 'Tacâmuri', id: 'Peralatan makan' },
  'Vajilla': { en: 'Dishware', ro: 'Veselă', id: 'Piring' },
  'Cristalería': { en: 'Glassware', ro: 'Pahare', id: 'Gelas' },
  'Sartenes y ollas': { en: 'Pans and pots', ro: 'Tigăi și oale', id: 'Wajan dan panci' },

  // === Equipamiento — Decoración ===
  'Cuadros': { en: 'Wall art', ro: 'Tablouri', id: 'Lukisan' },
  'Jarrones': { en: 'Vases', ro: 'Vaze', id: 'Vas' },
  'Plantas artificiales': { en: 'Artificial plants', ro: 'Plante artificiale', id: 'Tanaman artifisial' },
  'Espejos decorativos': { en: 'Decorative mirrors', ro: 'Oglinzi decorative', id: 'Cermin dekoratif' },
};

/**
 * Traduce un término de datos (amenity, categoría o ítem de equipamiento) al
 * idioma dado. Devuelve el término original (español) si el idioma es 'es' o si
 * el término no está mapeado — nunca rompe, solo mejora.
 */
export function translateProjectTerm(term: string, lang: string | undefined): string {
  const l = (lang || 'es').slice(0, 2).toLowerCase();
  if (l === 'es') return term;
  const tr = TERMS[term];
  if (!tr) return term;
  return (tr as Record<string, string>)[l] || term;
}
