// Historial de un suministro en todas las jornadas.
// No existe (aún) un endpoint del servidor para buscar un suministro en todas las
// hojas, así que se consulta jornada por jornada (solo lectura, la misma consulta
// que usa el dashboard) y se guarda en caché durante la sesión.
import { getAllPointsExtended, workersOf } from './pointsService';
import { getPointStatus, type GpsPointExtended, type PointStatus } from '../types/point';
import { parseFecha } from '../components/map/dailyProgress';

export interface Ocurrencia {
  jornada: string;
  estado: PointStatus;
  primeraFoto: Date | null;
  ultimaFoto: Date | null;
  fotos: number;
  trabajadores: string[];
  lectura: string | number | null;
  observacion: string | null;
  point: GpsPointExtended;
}

const cache = new Map<string, GpsPointExtended[]>();
const CONCURRENCIA = 4;

const norm = (s: unknown) => String(s ?? '').trim().replace(/\.0$/, '');

function fechasDe(p: GpsPointExtended) {
  const ds = (p.photoLinks || [])
    .map((l) => parseFecha(l.fecha))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (ds.length === 0) {
    const d = parseFecha(p.fechaSupervision) || parseFecha(p.syncedAt);
    return { primera: d, ultima: d };
  }
  return { primera: ds[0], ultima: ds[ds.length - 1] };
}

export function ocurrenciaDe(jornada: string, p: GpsPointExtended): Ocurrencia {
  const { primera, ultima } = fechasDe(p);
  return {
    jornada,
    estado: getPointStatus(p),
    primeraFoto: primera,
    ultimaFoto: ultima,
    fotos: p.photoCount || p.photoLinks?.length || 0,
    trabajadores: workersOf(p),
    lectura: p.lectura ?? null,
    observacion: p.notas ?? null,
    point: p,
  };
}

/** Guarda en caché los puntos de una jornada ya cargada (evita volver a pedirla). */
export function primeCache(jornada: string, points: GpsPointExtended[]) {
  if (points.length) cache.set(jornada, points);
}

export async function buscarEnJornadas(
  suministro: string,
  jornadas: string[],
  onProgress?: (hechas: number, total: number, encontradas: Ocurrencia[]) => void,
): Promise<Ocurrencia[]> {
  const objetivo = norm(suministro);
  const encontradas: Ocurrencia[] = [];
  let hechas = 0;
  const cola = [...jornadas];

  const trabajar = async () => {
    while (cola.length) {
      const jornada = cola.shift()!;
      let points = cache.get(jornada);
      if (!points) {
        const r = await getAllPointsExtended(jornada);
        points = r.success ? r.points || [] : [];
        if (r.success) cache.set(jornada, points);
      }
      points.filter((p) => norm(p.suministro) === objetivo).forEach((p) => encontradas.push(ocurrenciaDe(jornada, p)));
      hechas++;
      onProgress?.(hechas, jornadas.length, [...encontradas]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, jornadas.length) }, trabajar));
  return ordenar(encontradas);
}

export const ordenar = (xs: Ocurrencia[]) =>
  [...xs].sort((a, b) => (b.ultimaFoto?.getTime() ?? 0) - (a.ultimaFoto?.getTime() ?? 0));

/** Carga (o toma de la caché) los puntos de varias jornadas, con progreso. */
export async function cargarJornadas(
  jornadas: string[],
  onProgress?: (hechas: number, total: number) => void,
  forzar = false,
): Promise<Map<string, GpsPointExtended[]>> {
  if (forzar) jornadas.forEach((j) => cache.delete(j));
  const res = new Map<string, GpsPointExtended[]>();
  let hechas = 0;
  const cola = [...jornadas];
  const trabajar = async () => {
    while (cola.length) {
      const jornada = cola.shift()!;
      let points = cache.get(jornada);
      if (!points) {
        const r = await getAllPointsExtended(jornada);
        points = r.success ? r.points || [] : [];
        if (r.success) cache.set(jornada, points);
      }
      res.set(jornada, points);
      hechas++;
      onProgress?.(hechas, jornadas.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, jornadas.length) }, trabajar));
  return res;
}

/** Jornadas que ya están en memoria (no hace falta volver a pedirlas). */
export const jornadasEnCache = () => new Set(cache.keys());

/** Normaliza un código de suministro (quita espacios y el ".0" de Sheets). */
export const normSuministro = norm;

/** Puntos de una jornada ya cargada en memoria (o undefined). */
export const puntosEnCache = (jornada: string) => cache.get(jornada);
