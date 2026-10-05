/**
 * Formateo de números con separador de MILES por puntos (petición Andreas
 * 2026-10-05: "todos los números separados por puntos en los miles, en todos
 * los campos de todos los menús de toda la web").
 *
 * Los <input type="number"> nativos NO permiten mostrar separadores, así que
 * los campos numéricos usan <NumberInput> (text + inputMode numeric) y estas
 * funciones para formatear lo que ve el usuario y recuperar el valor crudo.
 */

/** "99000" | 99000 -> "99.000". Mantiene decimales con coma (es-ES). */
export function fmtThousands(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const s = String(value).trim();
  // Separa parte entera y decimal (acepta coma o punto como separador decimal).
  const neg = s.startsWith("-");
  const cleaned = s.replace(/[^\d.,]/g, "");
  const m = cleaned.match(/^(\d*)(?:[.,](\d*))?$/);
  if (!m) return s;
  const intPart = (m[1] || "").replace(/^0+(?=\d)/, "");
  const dec = m[2];
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  let out = grouped || "0";
  if (dec !== undefined) out += "," + dec;
  return (neg ? "-" : "") + out;
}

/** "99.000" -> "99000" (string de dígitos crudos, apta para Number()). */
export function parseNum(display: string | number | null | undefined): string {
  if (display === null || display === undefined) return "";
  const s = String(display);
  // Quita puntos de miles; convierte coma decimal en punto.
  const neg = s.trim().startsWith("-");
  const digits = s.replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.]/g, "");
  return (neg && digits ? "-" : "") + digits;
}
