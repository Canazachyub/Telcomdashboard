// Copia el registro de un suministro hecho en otra jornada a la jornada actual,
// reutilizando sus fotos (no hay que volver a tomarlas).
//
// No requiere cambios en el servidor: usa la misma acción `savePhoto` y el mismo
// formato `photoData` que envía la app móvil al sincronizar (ver
// app-movil/docs/SPEC_RECONSTRUCCION.md §0). El cuerpo va como texto JSON para
// que el navegador no haga una petición previa CORS que Apps Script no responde.
import { API_POINTS } from '../config/api';
import { getImageBase64 } from './observadosService';
import { parseFecha } from '../components/map/dailyProgress';
import type { GpsPointExtended, PhotoLink } from '../types/point';

// Permite probar contra un servidor simulado sin tocar producción:
//   VITE_COPY_API=http://127.0.0.1:8787/exec npm run dev
const WRITE_URL: string = import.meta.env.VITE_COPY_API || API_POINTS;
export const escribeEnPrueba = WRITE_URL !== API_POINTS;

const pad = (n: number) => String(n).padStart(2, '0');
/** Mismo formato de fecha que la app: dd/MM/yyyy HH:mm:ss */
const fmtApp = (d: Date) =>
  `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export interface CopiaParams {
  destino: string; // jornada actual
  origen: GpsPointExtended; // punto en la otra jornada
  jornadaOrigen: string;
  fotos: PhotoLink[]; // fotos elegidas para copiar
  lectura: string;
  observacion: string;
  onProgress?: (hechas: number, total: number, mensaje: string) => void;
}

export interface CopiaResultado {
  ok: number;
  fallidas: { foto: number; error: string }[];
}

async function postSavePhoto(photoData: Record<string, string>): Promise<{ success: boolean; message?: string }> {
  const r = await fetch(WRITE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'savePhoto', photoData }),
    redirect: 'follow',
  });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, message: `Respuesta no válida del servidor (${r.status})` };
  }
}

export async function copiarRegistro(p: CopiaParams): Promise<CopiaResultado> {
  const res: CopiaResultado = { ok: 0, fallidas: [] };
  const lat = p.origen.latReal ?? p.origen.latRef;
  const lng = p.origen.longReal ?? p.origen.longRef;
  const gpsCoords =
    lat != null && lng != null ? `${Number(lat).toFixed(6)}°, ${Number(lng).toFixed(6)}°` : 'GPS no disponible';

  for (let i = 0; i < p.fotos.length; i++) {
    const foto = p.fotos[i];
    p.onProgress?.(i, p.fotos.length, `Descargando foto ${i + 1} de ${p.fotos.length}…`);
    try {
      const img = await getImageBase64(foto.url);
      if (!img?.success || !img.base64) throw new Error('No se pudo descargar la foto original');

      p.onProgress?.(i, p.fotos.length, `Registrando foto ${i + 1} de ${p.fotos.length}…`);
      const fecha = parseFecha(foto.fecha) || new Date();
      const r = await postSavePhoto({
        sheetName: p.destino,
        suministro: p.origen.suministro,
        timestamp: fmtApp(fecha),
        gpsCoords,
        location: p.origen.ubicacionGeo || `Copiado de ${p.jornadaOrigen}`,
        imageBase64: img.base64,
        logoText: 'TELCOM ENERGY',
        lectura: p.lectura,
        observacion: p.observacion,
        odtId: foto.odtId || p.origen.odtId || '',
        odtNombre: foto.odtNombre || p.origen.odtNombre || '',
        odtColor: foto.odtColor || p.origen.odtColor || '',
      });
      if (!r.success) throw new Error(r.message || 'El servidor no confirmó el registro');
      res.ok++;
    } catch (e) {
      res.fallidas.push({ foto: i + 1, error: e instanceof Error ? e.message : String(e) });
    }
  }
  p.onProgress?.(p.fotos.length, p.fotos.length, 'Listo');
  return res;
}
