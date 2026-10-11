import { getImageBase64 } from '../services/observadosService';

// Cache global de imágenes para evitar recargas
export const imageCache = new Map<string, string>();

// Función para cargar imagen con cache
export async function loadImageWithCache(url: string): Promise<string | null> {
  if (!url) return null;

  // Verificar cache primero
  if (imageCache.has(url)) {
    return imageCache.get(url)!;
  }

  try {
    const response = await getImageBase64(url);
    if (response?.success && response.base64) {
      const mimeType = response.mimeType || 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${response.base64}`;
      imageCache.set(url, dataUrl);
      return dataUrl;
    }
    return null;
  } catch {
    return null;
  }
}
