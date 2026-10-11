import { getPointStatus, type GpsPoint, type GpsPointExtended } from '../../types/point';
import { isValidHexColor } from '../../utils/html';

export type AnyPoint = GpsPoint | GpsPointExtended;

/** Inicial para mostrar en el marcador: primera letra del nombre, en mayúscula. */
export const initialOf = (name?: string | null) => {
  const m = (name || '').trim().match(/[A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/);
  return m ? m[0].toUpperCase() : '';
};

export interface TecnicoProgress {
  nombre: string;
  total: number;
  completados: number;
  enProceso: number;
  pendientes: number;
  /** Color ODT más usado en las fotos de sus puntos (si lo hay) */
  color: string | null;
}

/** Agrupa los puntos por técnico asignado (columna B) y calcula su avance. */
export function progressByTecnico(points: AnyPoint[]): TecnicoProgress[] {
  const map = new Map<string, TecnicoProgress & { colors: Map<string, number> }>();
  for (const p of points) {
    const ext = p as GpsPointExtended;
    const nombre = (ext.tecnico || '').trim() || 'Sin asignar';
    let row = map.get(nombre);
    if (!row) {
      row = { nombre, total: 0, completados: 0, enProceso: 0, pendientes: 0, color: null, colors: new Map() };
      map.set(nombre, row);
    }
    row.total++;
    const st = getPointStatus(p);
    if (st === 'completado') row.completados++;
    else if (st === 'en_proceso') row.enProceso++;
    else row.pendientes++;
    if (isValidHexColor(ext.odtColor)) {
      row.colors.set(ext.odtColor!, (row.colors.get(ext.odtColor!) || 0) + 1);
    }
  }
  return [...map.values()]
    .map(({ colors, ...r }) => ({
      ...r,
      color: [...colors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    }))
    .sort((a, b) => {
      // "Sin asignar" al final; el resto por avance
      if (a.nombre === 'Sin asignar') return 1;
      if (b.nombre === 'Sin asignar') return -1;
      return b.completados / b.total - a.completados / a.total || b.total - a.total;
    });
}

export interface FotografoProgress {
  nombre: string;
  puntos: number;
  completados: number;
  color: string | null;
}

/** Agrupa los puntos con foto según quién la tomó (perfil ODT de la app). */
export function progressByFotografo(points: AnyPoint[]): FotografoProgress[] {
  const map = new Map<string, FotografoProgress>();
  for (const p of points) {
    const ext = p as GpsPointExtended;
    if (getPointStatus(p) === 'pendiente') continue;
    const nombre = (ext.odtNombre || '').trim() || 'Sin perfil ODT';
    const row = map.get(nombre) || { nombre, puntos: 0, completados: 0, color: null };
    row.puntos++;
    if (getPointStatus(p) === 'completado') row.completados++;
    if (!row.color && isValidHexColor(ext.odtColor)) row.color = ext.odtColor!;
    map.set(nombre, row);
  }
  return [...map.values()].sort((a, b) => b.puntos - a.puntos);
}
