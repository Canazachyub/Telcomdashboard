// Rango aproximado del territorio peruano (con margen)
export function isInPeru(lat?: number | null, lng?: number | null) {
  return lat != null && lng != null && lat <= 0.5 && lat >= -18.6 && lng <= -68 && lng >= -81.6;
}
