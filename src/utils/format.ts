// Formateo defensivo: los datos de Google Sheets pueden llegar como string, null o numero.

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Formatea un par de coordenadas; devuelve null si alguna no es numerica o es 0 */
export function formatCoords(lat: unknown, lng: unknown, decimals = 6): string | null {
  const la = toNumberOrNull(lat);
  const lo = toNumberOrNull(lng);
  if (la === null || lo === null || la === 0 || lo === 0) return null;
  return `${la.toFixed(decimals)}, ${lo.toFixed(decimals)}`;
}
