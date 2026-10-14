// ============================================================
// Miniaturas de fotos (para el dashboard)
// ------------------------------------------------------------
// getImageBase64 devuelve la foto original (varios MB): para una miniatura es
// muy lento. getImageThumb devuelve la miniatura que Drive ya tiene hecha
// (~220 px, pocos KB) y la guarda 6 h en la caché del script.
// Solo lectura. Si el archivo no tiene miniatura, el dashboard usa la original.
// ============================================================
const MINIATURA_CACHE_SEG = 21600;

function handleGetImageThumb(fileId) {
  try {
    const id = String(fileId || '').trim();
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) return createResponse(false, 'ID de archivo inválido');
    const cache = CacheService.getScriptCache();
    const clave = 'mini_' + id;
    const guardada = cache.get(clave);
    if (guardada) return createResponse(true, 'OK', { base64: guardada, mimeType: 'image/jpeg', cache: true });

    const thumb = DriveApp.getFileById(id).getThumbnail();
    if (!thumb) return createResponse(false, 'Sin miniatura');
    const base64 = Utilities.base64Encode(thumb.getBytes());
    // La caché admite hasta 100 KB por clave; una miniatura entra de sobra
    if (base64.length < 95000) {
      try { cache.put(clave, base64, MINIATURA_CACHE_SEG); } catch (e) {}
    }
    return createResponse(true, 'OK', { base64: base64, mimeType: thumb.getContentType() || 'image/jpeg' });
  } catch (error) {
    Logger.log('Error en getImageThumb: ' + error);
    return createResponse(false, 'Error: ' + error.toString());
  }
}
