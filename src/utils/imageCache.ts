import { getImageBase64 } from '../services/observadosService';
import { extractDriveFileId } from './driveUtils';

// Cache global de imágenes para evitar recargas
export const imageCache = new Map<string, string>();
const enCurso = new Map<string, Promise<string | null>>();

// Caché persistente del navegador: una foto ya vista se muestra al instante aunque
// se recargue la página. Si el navegador no lo permite, se sigue solo con memoria.
const CACHE_NOMBRE = 'telcom-fotos-v1';
const claveDe = (tipo: 'foto', url: string) =>
  `https://telcom.cache/${tipo}/${encodeURIComponent(extractDriveFileId(url) || url)}`;

async function leerPersistente(clave: string): Promise<string | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const r = await (await caches.open(CACHE_NOMBRE)).match(clave);
    return r ? await r.text() : null;
  } catch {
    return null;
  }
}

function guardarPersistente(clave: string, dataUrl: string) {
  try {
    if (typeof caches === 'undefined') return;
    caches.open(CACHE_NOMBRE).then((c) => c.put(clave, new Response(dataUrl))).catch(() => {});
  } catch {
    // sin caché persistente: no es crítico
  }
}

/** Evita pedir dos veces la misma imagen mientras la primera petición sigue en curso. */
function unaVez(clave: string, fn: () => Promise<string | null>) {
  const ya = enCurso.get(clave);
  if (ya) return ya;
  const p = fn().finally(() => enCurso.delete(clave));
  enCurso.set(clave, p);
  return p;
}

// Función para cargar imagen con cache
export async function loadImageWithCache(url: string): Promise<string | null> {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url)!;
  const clave = claveDe('foto', url);
  return unaVez(clave, async () => {
    const guardada = await leerPersistente(clave);
    if (guardada) {
      imageCache.set(url, guardada);
      return guardada;
    }
    try {
      const response = await getImageBase64(url);
      if (response?.success && response.base64) {
        const mimeType = response.mimeType || 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${response.base64}`;
        imageCache.set(url, dataUrl);
        guardarPersistente(clave, dataUrl);
        return dataUrl;
      }
      return null;
    } catch {
      return null;
    }
  });
}

/**
 * Imagen para miniaturas. Las fotos de la app ya llegan comprimidas (~130 KB) y la
 * miniatura de Drive pesa lo mismo, así que se comparte la misma petición y caché
 * que la foto completa (una sola descarga por foto).
 */
export function loadThumbWithCache(url: string): Promise<string | null> {
  return loadImageWithCache(url);
}
