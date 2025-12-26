// Utilidades para manejar URLs de Google Drive

/**
 * Extrae el ID del archivo de una URL de Google Drive
 * Soporta múltiples formatos de URL:
 * - https://drive.google.com/file/d/FILE_ID/view
 * - https://drive.google.com/open?id=FILE_ID
 * - https://drive.google.com/uc?id=FILE_ID
 * - drive.google.com/file/d/FILE_ID/...
 */
export function extractDriveFileId(url: string): string | null {
  if (!url) return null;

  // Patrón 1: /file/d/FILE_ID/
  const pattern1 = /\/file\/d\/([a-zA-Z0-9_-]+)/;
  const match1 = url.match(pattern1);
  if (match1) return match1[1];

  // Patrón 2: ?id=FILE_ID o &id=FILE_ID
  const pattern2 = /[?&]id=([a-zA-Z0-9_-]+)/;
  const match2 = url.match(pattern2);
  if (match2) return match2[1];

  // Patrón 3: /d/FILE_ID (más genérico)
  const pattern3 = /\/d\/([a-zA-Z0-9_-]+)/;
  const match3 = url.match(pattern3);
  if (match3) return match3[1];

  return null;
}

/**
 * Convierte una URL de Google Drive a URL de visualización directa
 */
export function getDriveViewUrl(url: string): string {
  const fileId = extractDriveFileId(url);
  if (!fileId) return url;

  // URL de visualización directa
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

/**
 * Convierte una URL de Google Drive a URL de thumbnail
 * @param size - Tamaño del thumbnail (ej: w400, w800, s220)
 */
export function getDriveThumbnailUrl(url: string, size: string = 'w400'): string {
  const fileId = extractDriveFileId(url);
  if (!fileId) return url;

  // URL de thumbnail con tamaño personalizado
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=${size}`;
}

/**
 * Convierte a URL de lh3.googleusercontent.com (más confiable para imágenes)
 */
export function getDriveImageUrl(url: string): string {
  const fileId = extractDriveFileId(url);
  if (!fileId) return url;

  // Esta URL funciona mejor para mostrar imágenes inline
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

/**
 * Verifica si una URL es de Google Drive
 */
export function isDriveUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('drive.google.com') || url.includes('googleusercontent.com');
}

/**
 * Obtiene múltiples formatos de URL para una foto de Drive
 */
export function getDriveUrls(url: string) {
  const fileId = extractDriveFileId(url);

  if (!fileId) {
    return {
      original: url,
      view: url,
      thumbnail: url,
      embed: url,
      fileId: null
    };
  }

  return {
    original: url,
    view: `https://drive.google.com/uc?export=view&id=${fileId}`,
    thumbnail: `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`,
    embed: `https://drive.google.com/file/d/${fileId}/preview`,
    lh3: `https://lh3.googleusercontent.com/d/${fileId}`,
    fileId: fileId
  };
}
