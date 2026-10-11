// Utilidades para construir HTML seguro (p.ej. DivIcon de Leaflet)

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Devuelve el color si es un hex #RRGGBB valido; si no, el fallback. */
export function safeHexColor(color: string | null | undefined, fallback: string): string {
  if (color && HEX_COLOR.test(color.trim())) return color.trim();
  return fallback;
}

export function isValidHexColor(color: string | null | undefined): boolean {
  return !!color && HEX_COLOR.test(color.trim());
}

/** Escapa texto para insertarlo en HTML. */
export function escapeHtml(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
