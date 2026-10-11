import type { GpsPointExtended } from '../../types/point';
import { isValidHexColor } from '../../utils/html';
import type { AnyPoint } from './techUtils';

/** Convierte las fechas que llegan del servidor/app a Date. */
export function parseFecha(raw?: string | null): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // dd/MM/yyyy [HH:mm[:ss]] (formato de la app)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }
  // ISO o "Sat Oct 10 2026 10:35:52 GMT-0500 (hora …)" (Apps Script)
  const d = new Date(s.replace(/\s*\(.*\)\s*$/, ''));
  return isNaN(d.getTime()) ? null : d;
}

/** Clave de día local "YYYY-MM-DD". */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface DayTech {
  nombre: string;
  puntos: number;
  fotos: number;
  color: string | null;
}

export interface DayStats {
  key: string;
  puntos: number; // puntos avanzados ese día (primera foto)
  fotos: number; // fotos tomadas ese día
  tecnicos: DayTech[];
}

export interface DailyProgress {
  days: Map<string, DayStats>;
  /** suministro → día de su primera foto */
  firstDay: Map<string, string>;
  maxPuntos: number;
}

export function computeDailyProgress(points: AnyPoint[]): DailyProgress {
  const acc = new Map<string, { puntos: number; fotos: number; tecs: Map<string, DayTech> }>();
  const firstDay = new Map<string, string>();

  const bucket = (key: string) => {
    let b = acc.get(key);
    if (!b) {
      b = { puntos: 0, fotos: 0, tecs: new Map() };
      acc.set(key, b);
    }
    return b;
  };
  const tech = (b: { tecs: Map<string, DayTech> }, nombre: string, color: string | null) => {
    let t = b.tecs.get(nombre);
    if (!t) {
      t = { nombre, puntos: 0, fotos: 0, color: null };
      b.tecs.set(nombre, t);
    }
    if (!t.color && isValidHexColor(color)) t.color = color;
    return t;
  };

  for (const p of points) {
    const ext = p as GpsPointExtended;
    const fotos = (p.photoLinks || [])
      .map((l) => ({ l, d: parseFecha(l.fecha) }))
      .filter((x): x is { l: (typeof p.photoLinks)[number]; d: Date } => x.d !== null)
      .sort((a, b) => a.d.getTime() - b.d.getTime());

    // Si no hay fechas por foto, usar la fecha de supervisión del punto
    if (fotos.length === 0) {
      const d = parseFecha(ext.fechaSupervision) || parseFecha(ext.syncedAt);
      if (!d) continue;
      const key = dayKey(d);
      firstDay.set(p.suministro, key);
      const b = bucket(key);
      b.puntos++;
      const nombre = (ext.odtNombre || ext.tecnico || 'Sin perfil ODT').trim();
      tech(b, nombre, ext.odtColor).puntos++;
      continue;
    }

    fotos.forEach(({ l, d }, i) => {
      const key = dayKey(d);
      const b = bucket(key);
      const nombre = (l.odtNombre || ext.odtNombre || ext.tecnico || 'Sin perfil ODT').trim();
      const t = tech(b, nombre, l.odtColor || ext.odtColor || null);
      b.fotos++;
      t.fotos++;
      if (i === 0) {
        firstDay.set(p.suministro, key);
        b.puntos++;
        t.puntos++;
      }
    });
  }

  const days = new Map<string, DayStats>();
  let maxPuntos = 0;
  for (const [key, b] of acc) {
    maxPuntos = Math.max(maxPuntos, b.puntos);
    days.set(key, {
      key,
      puntos: b.puntos,
      fotos: b.fotos,
      tecnicos: [...b.tecs.values()].sort((a, c) => c.puntos - a.puntos || c.fotos - a.fotos),
    });
  }
  return { days, firstDay, maxPuntos };
}
