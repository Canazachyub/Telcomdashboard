// Detección de suministros mal escritos por los técnicos (letras, dígitos de menos,
// códigos que no existen en la jornada) y sugerencia del suministro correcto.
import { getPointStatus, type GpsPoint, type GpsPointExtended } from '../types/point';

type P = GpsPoint | GpsPointExtended;

export type MotivoSospecha = 'caracteres' | 'longitud' | 'no_existe';

export const MOTIVO_TEXTO: Record<MotivoSospecha, string> = {
  caracteres: 'Tiene letras o símbolos',
  longitud: 'Largo distinto al habitual',
  no_existe: 'No está en la lista de la jornada',
};

export interface Sugerencia {
  point: P;
  /** Jornada del candidato (null = la misma jornada) */
  jornada: string | null;
  distancia: number | null; // metros
  coincideDigitos: boolean;
  puntaje: number; // menor = mejor
}

export interface Sospechoso {
  point: P;
  motivos: MotivoSospecha[];
  sugerencias: Sugerencia[];
}

const norm = (s: unknown) => String(s ?? '').trim().replace(/\.0$/, '');

function distancia(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Largo más común de los códigos numéricos de la jornada (p. ej. 11). */
function largoHabitual(points: P[]): number | null {
  const cuenta = new Map<number, number>();
  points.forEach((p) => {
    const s = norm(p.suministro);
    if (/^\d+$/.test(s)) cuenta.set(s.length, (cuenta.get(s.length) || 0) + 1);
  });
  let mejor: number | null = null;
  let max = 0;
  cuenta.forEach((n, len) => {
    if (n > max) {
      max = n;
      mejor = len;
    }
  });
  return mejor;
}

/** El punto no trae datos de la lista original (solo existe por las fotos). */
const sinDatosDeLista = (p: P) => {
  const e = p as GpsPointExtended;
  return (
    (p.photoLinks?.length || 0) > 0 &&
    p.latRef == null &&
    p.longRef == null &&
    !e.codigoRuta &&
    !e.serie &&
    !e.clienteNombre
  );
};

/** Candidatos de otras jornadas (cualquier estado) para mejorar las sugerencias. */
export interface CandidatoExterno {
  jornada: string;
  point: P;
}

export function detectarSospechosos(points: P[], externos: CandidatoExterno[] = []): Sospechoso[] {
  const largo = largoHabitual(points);
  const pendientes = points.filter((p) => getPointStatus(p) === 'pendiente');
  const out: Sospechoso[] = [];

  for (const p of points) {
    const s = norm(p.suministro);
    const motivos: MotivoSospecha[] = [];
    if (!/^\d+$/.test(s)) motivos.push('caracteres');
    else if (largo && Math.abs(s.length - largo) >= 1) motivos.push('longitud');
    if (sinDatosDeLista(p)) motivos.push('no_existe');
    if (motivos.length === 0) continue;
    out.push({ point: p, motivos, sugerencias: sugerir(p, pendientes, externos) });
  }
  return out;
}

/** Pendientes candidatos: los más cercanos al GPS de la foto y los que contienen los dígitos escritos. */
export function sugerir(p: P, pendientes: P[], externos: CandidatoExterno[] = [], max = 3): Sugerencia[] {
  const lat = p.latReal ?? p.latRef;
  const lng = p.longReal ?? p.longRef;
  const digitos = norm(p.suministro).replace(/\D/g, '');
  const cands: Sugerencia[] = [];

  const lista: { c: P; jornada: string | null }[] = [
    ...pendientes.map((c) => ({ c, jornada: null })),
    // De otras jornadas solo sirven códigos válidos con datos de lista
    ...externos.filter((x) => /^\d+$/.test(norm(x.point.suministro)) && x.point.latRef != null).map((x) => ({ c: x.point, jornada: x.jornada })),
  ];
  const vistos = new Set<string>();
  for (const { c, jornada } of lista) {
    if (c === p) continue;
    const cl = c.latRef ?? c.latReal;
    const cg = c.longRef ?? c.longReal;
    const d = lat != null && lng != null && cl != null && cg != null ? distancia(lat, lng, cl, cg) : null;
    const coincide = digitos.length >= 4 && norm(c.suministro).includes(digitos);
    if (d == null && !coincide) continue;
    // Lejos y sin coincidencia de dígitos no sirve como sugerencia
    if (!coincide && (d == null || d > MAX_SUGERENCIA_M)) continue;
    // Prioriza coincidencia de dígitos; luego cercanía
    const puntaje = (coincide ? 0 : 1_000_000) + (d ?? 500_000);
    cands.push({ point: c, jornada, distancia: d, coincideDigitos: coincide, puntaje });
  }
  return cands
    .sort((a, b) => a.puntaje - b.puntaje)
    .filter((x) => {
      const k = norm(x.point.suministro);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, max);
}

/** Distancia a partir de la cual la sugerencia es poco confiable */
export const LEJOS_M = 100;
/** Más allá de esto (sin coincidencia de dígitos) no se sugiere nada */
export const MAX_SUGERENCIA_M = 1000;

/** Error de digitación real (letras o largo raro). Solo «no_existe» = código válido fuera de la lista. */
export const esMalEscrito = (x: Sospechoso) => x.motivos.includes('caracteres') || x.motivos.includes('longitud');

export const fmtDistancia = (m: number | null) =>
  m == null ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;

const coords = (lat: unknown, lng: unknown): [number, number] | null => {
  if (lat == null || lng == null) return null;
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && a !== 0 && b !== 0 ? [a, b] : null;
};

/** Posición donde se tomó la foto del punto mal escrito */
export const posFoto = (p: P) => coords(p.latReal ?? p.latRef, p.longReal ?? p.longRef);
/** Posición del candidato según la lista (o su foto si no tiene referencia) */
export const posCandidato = (p: P) => coords(p.latRef ?? p.latReal, p.longRef ?? p.longReal);
