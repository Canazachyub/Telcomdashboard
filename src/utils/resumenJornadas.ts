// Resumen de varias jornadas a la vez: avance de cada una y quién las llenó.
// Solo cálculo (sin pedidos al servidor); la página carga los puntos.
import { getPointStatus, type GpsPointExtended } from '../types/point';
import { parseFecha, dayKey } from '../components/map/dailyProgress';
import { isValidHexColor } from './html';

export interface TecnicoEnJornada {
  nombre: string;
  color: string | null;
  puntos: number; // suministros trabajados (con foto)
  fotos: number;
}

export interface ResumenJornada {
  nombre: string;
  total: number;
  completados: number;
  enProceso: number;
  pendientes: number;
  porcentaje: number;
  fotos: number;
  primeraFoto: Date | null;
  ultimaFoto: Date | null;
  /** Suministros con su primera foto en el día de hoy */
  hoy: number;
  tecnicos: TecnicoEnJornada[];
  /** día "YYYY-MM-DD" → suministros llenados (por su primera foto) */
  porDia: Record<string, number>;
}

export interface ResumenTecnico {
  nombre: string;
  color: string | null;
  puntos: number;
  fotos: number;
  ultimaFoto: Date | null;
  /** jornada → suministros trabajados */
  porJornada: Record<string, number>;
  /** día "YYYY-MM-DD" → suministros trabajados (por su primera foto) */
  porDia: Record<string, number>;
}

const SIN_PERFIL = 'Sin perfil ODT';

/** Fotos de un punto con fecha válida, de la más antigua a la más reciente. */
function fotosDe(p: GpsPointExtended) {
  return (p.photoLinks || [])
    .map((l) => ({ l, d: parseFecha(l.fecha) }))
    .filter(
      (
        x,
      ): x is {
        l: NonNullable<GpsPointExtended['photoLinks']>[number];
        d: Date;
      } => x.d !== null,
    )
    .sort((a, b) => a.d.getTime() - b.d.getTime());
}

/**
 * Quién llenó el suministro: el perfil de la app que lo fotografió (el mismo
 * criterio que «Quién fotografió» del mapa).
 */
export function quienLleno(p: GpsPointExtended): string {
  const primera = fotosDe(p)[0]?.l.odtNombre;
  return ((p.odtNombre || primera || '') as string).trim() || SIN_PERFIL;
}

export function resumirJornada(nombre: string, points: GpsPointExtended[], hoy = new Date()): ResumenJornada {
  const r: ResumenJornada = {
    nombre,
    total: points.length,
    completados: 0,
    enProceso: 0,
    pendientes: 0,
    porcentaje: 0,
    fotos: 0,
    primeraFoto: null,
    ultimaFoto: null,
    hoy: 0,
    tecnicos: [],
    porDia: {},
  };
  const hoyKey = dayKey(hoy);
  const tecs = new Map<string, TecnicoEnJornada>();
  for (const p of points) {
    const st = getPointStatus(p);
    if (st === 'completado') r.completados++;
    else if (st === 'en_proceso') r.enProceso++;
    else r.pendientes++;

    const fotos = fotosDe(p);
    const n = p.photoCount || p.photoLinks?.length || 0;
    r.fotos += n;
    const primera = fotos[0]?.d ?? parseFecha(p.fechaSupervision) ?? parseFecha(p.syncedAt);
    const ultima = fotos[fotos.length - 1]?.d ?? primera;
    if (primera && (!r.primeraFoto || primera < r.primeraFoto)) r.primeraFoto = primera;
    if (ultima && (!r.ultimaFoto || ultima > r.ultimaFoto)) r.ultimaFoto = ultima;
    if (st === 'pendiente') continue;
    if (primera && dayKey(primera) === hoyKey) r.hoy++;
    if (primera) r.porDia[dayKey(primera)] = (r.porDia[dayKey(primera)] || 0) + 1;

    const quien = quienLleno(p);
    const t = tecs.get(quien) || {
      nombre: quien,
      color: null,
      puntos: 0,
      fotos: 0,
    };
    t.puntos++;
    t.fotos += n;
    const color = p.odtColor || fotos[0]?.l.odtColor;
    if (!t.color && isValidHexColor(color)) t.color = color!;
    tecs.set(quien, t);
  }
  r.porcentaje = r.total ? Math.round((r.completados / r.total) * 1000) / 10 : 0;
  r.tecnicos = [...tecs.values()].sort((a, b) => b.puntos - a.puntos);
  return r;
}

/** Junta a cada técnico a través de todas las jornadas. */
export function resumirTecnicos(jornadas: { nombre: string; points: GpsPointExtended[] }[]): ResumenTecnico[] {
  const map = new Map<string, ResumenTecnico>();
  for (const { nombre, points } of jornadas) {
    for (const p of points) {
      if (getPointStatus(p) === 'pendiente') continue;
      const quien = quienLleno(p);
      const t =
        map.get(quien) ||
        ({
          nombre: quien,
          color: null,
          puntos: 0,
          fotos: 0,
          ultimaFoto: null,
          porJornada: {},
          porDia: {},
        } as ResumenTecnico);
      const fotos = fotosDe(p);
      const primera = fotos[0]?.d ?? parseFecha(p.fechaSupervision) ?? parseFecha(p.syncedAt);
      const ultima = fotos[fotos.length - 1]?.d ?? primera;
      t.puntos++;
      t.fotos += p.photoCount || p.photoLinks?.length || 0;
      t.porJornada[nombre] = (t.porJornada[nombre] || 0) + 1;
      if (primera) t.porDia[dayKey(primera)] = (t.porDia[dayKey(primera)] || 0) + 1;
      if (ultima && (!t.ultimaFoto || ultima > t.ultimaFoto)) t.ultimaFoto = ultima;
      const color = p.odtColor || fotos[0]?.l.odtColor;
      if (!t.color && isValidHexColor(color)) t.color = color!;
      map.set(quien, t);
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.nombre === SIN_PERFIL) return 1;
    if (b.nombre === SIN_PERFIL) return -1;
    return b.puntos - a.puntos;
  });
}

/** Las n jornadas con la foto más reciente (las que no tienen fotos quedan fuera). */
export function masRecientes(resumenes: ResumenJornada[], n: number): ResumenJornada[] {
  return resumenes
    .filter((r) => r.ultimaFoto)
    .sort((a, b) => b.ultimaFoto!.getTime() - a.ultimaFoto!.getTime())
    .slice(0, n);
}

/** Los últimos `dias` días (clave "YYYY-MM-DD"), del más antiguo a hoy. */
export function ultimosDias(dias: number, hoy = new Date()): string[] {
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1 - i));
    return dayKey(d);
  });
}

/**
 * Ritmo reciente: suministros por día trabajado en los últimos `dias` días (solo
 * cuentan los días con avance) y días que faltan a ese ritmo. null si no hubo avance.
 */
export function ritmo(porDia: Record<string, number>, pendientes: number, dias = 7, hoy = new Date()) {
  const vals = ultimosDias(dias, hoy)
    .map((d) => porDia[d] || 0)
    .filter((v) => v > 0);
  if (!vals.length) return null;
  const porDiaTrabajado = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    porDia: porDiaTrabajado,
    diasTrabajados: vals.length,
    faltan: Math.ceil(pendientes / porDiaTrabajado),
  };
}

/** Color estable por técnico: el de su perfil ODT o uno de la paleta. */
const PALETA = ['#22d3ee', '#f43f5e', '#a3e635', '#f59e0b', '#a78bfa', '#34d399', '#fb7185', '#60a5fa'];
export function coloresDe(tecnicos: { nombre: string; color: string | null }[]): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  for (const t of tecnicos) {
    out[t.nombre] = t.nombre === SIN_PERFIL ? '#64748b' : t.color || PALETA[i++ % PALETA.length];
  }
  return out;
}

export interface FotoReciente {
  jornada: string;
  point: GpsPointExtended;
  foto: NonNullable<GpsPointExtended['photoLinks']>[number];
  fecha: Date;
  /** Fotos del suministro (para abrir la galería completa) */
  total: number;
}

/** Lo último que se hizo: la foto más reciente de cada suministro, de la más nueva a la más antigua. */
export function fotosRecientes(jornadas: { nombre: string; points: GpsPointExtended[] }[], n: number): FotoReciente[] {
  const out: FotoReciente[] = [];
  for (const { nombre, points } of jornadas) {
    for (const p of points) {
      const fotos = fotosDe(p);
      const ultima = fotos[fotos.length - 1];
      if (ultima) out.push({ jornada: nombre, point: p, foto: ultima.l, fecha: ultima.d, total: fotos.length });
    }
  }
  return out.sort((a, b) => b.fecha.getTime() - a.fecha.getTime()).slice(0, n);
}
