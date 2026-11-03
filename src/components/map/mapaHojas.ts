// Cálculos puros del mapa con varias jornadas y de la delegación de áreas.
import { getPointStatus, type GpsPointExtended } from '../../types/point';
import { filterByDistrito, filterByStatus, filterByTecnico, searchBySuministro } from '../../services/pointsService';
import type { AnyPoint } from './techUtils';

/** Colores de jornada (anillo exterior del marcador y etiqueta). */
export const COLORES_HOJA = ['#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#facc15', '#f87171'];

/** Color de una jornada adicional según su posición en la lista (null si no está). */
export const colorDeHoja = (extras: string[], hoja: string) => {
  const i = extras.indexOf(hoja);
  return i < 0 ? null : COLORES_HOJA[i % COLORES_HOJA.length];
};

/** Colores de técnico para «Colorear por asignado» (orden estable por nombre). */
export const COLORES_TECNICO = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#14b8a6',
  '#6366f1',
  '#eab308',
  '#d946ef',
  '#10b981',
  '#e11d48',
  '#0ea5e9',
];
export const COLOR_SIN_ASIGNAR = '#64748b';

/** Etiqueta corta de una jornada: «SEM14» o, si no tiene semana, el nombre recortado. */
export function etiquetaHoja(nombre: string): string {
  const u = nombre.trim().toUpperCase();
  const sem = u.match(/SEM\s*-?\s*(\d{1,2})/);
  if (sem) {
    // Las que no son la programación P227 llevan su prefijo (CO, ALTE…) para no confundirse
    const pref = u.startsWith('P227') ? '' : (u.match(/^[A-Z]+/)?.[0] ?? '').slice(0, 4);
    return `${pref ? `${pref} ` : ''}SEM${sem[1].padStart(2, '0')}`;
  }
  const t = nombre.trim();
  return t.length > 14 ? `${t.slice(0, 13)}…` : t;
}

/** Orden de antigüedad de una jornada por su nombre (año, semestre S0x, semana); -1 si no se reconoce. */
export function ordenHoja(nombre: string): number {
  const u = nombre.toUpperCase();
  const sem = u.match(/SEM\s*-?\s*(\d{1,2})/);
  if (!sem) return -1;
  const anio = Number(u.match(/(20\d\d)/)?.[1] ?? 0);
  const semestre = Number(u.match(/-S0?(\d)\b/)?.[1] ?? 0);
  return anio * 10000 + semestre * 100 + Number(sem[1]);
}

export interface FiltrosMapa {
  tecnico: string;
  distrito: string;
  status: string;
  search: string;
}

/** Los mismos filtros del store, para las jornadas adicionales. */
export function filtrarPuntos(points: GpsPointExtended[], f: FiltrosMapa): GpsPointExtended[] {
  let r = points;
  if (f.tecnico && f.tecnico !== 'Todos') r = filterByTecnico(r, f.tecnico);
  if (f.distrito && f.distrito !== 'Todos') r = filterByDistrito(r, f.distrito);
  if (f.status && f.status !== 'todos') r = filterByStatus(r, f.status);
  if (f.search) r = searchBySuministro(r, f.search);
  return r;
}

export const tecnicoDe = (p: AnyPoint) => ((p as GpsPointExtended).tecnico || '').trim();

/** Color fijo por técnico asignado: se ordenan los nombres para que no cambie entre recargas. */
export function paletaTecnicos(points: AnyPoint[], extra: string[] = []): Map<string, string> {
  const nombres = new Set(extra.map((n) => n.trim()).filter(Boolean));
  points.forEach((p) => {
    const t = tecnicoDe(p);
    if (t) nombres.add(t);
  });
  const m = new Map<string, string>();
  [...nombres]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .forEach((n, i) => m.set(n, COLORES_TECNICO[i % COLORES_TECNICO.length]));
  return m;
}

/** Punto dentro de un polígono (lazo). Coordenadas [lat, lng]; a escala de ciudad basta el plano. */
export function dentroDePoligono(pt: [number, number], poli: [number, number][]): boolean {
  let dentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [yi, xi] = poli[i];
    const [yj, xj] = poli[j];
    if (yi > pt[0] !== yj > pt[0] && pt[1] < ((xj - xi) * (pt[0] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Número para wa.me: solo dígitos y, si es un celular peruano de 9 dígitos, con el 51 delante. */
export function telefonoWhatsApp(tel: string | null | undefined): string | null {
  const d = String(tel ?? '').replace(/\D/g, '');
  if (/^9\d{8}$/.test(d)) return `51${d}`;
  if (/^519\d{8}$/.test(d)) return d;
  return d.length >= 10 ? d : null;
}

export interface CargaTecnico {
  nombre: string;
  pendientes: number;
  /** Pendientes por jornada */
  porHoja: Map<string, number>;
  distritos: Map<string, number>;
  rutas: Set<string>;
  suministros: string[];
}

/** Pendientes asignados a cada técnico en las jornadas cargadas. */
export function cargaPorTecnico(items: { point: AnyPoint; hoja: string }[]): CargaTecnico[] {
  const m = new Map<string, CargaTecnico>();
  for (const { point, hoja } of items) {
    const nombre = tecnicoDe(point);
    if (!nombre || getPointStatus(point) !== 'pendiente') continue;
    const ext = point as GpsPointExtended;
    let c = m.get(nombre);
    if (!c) {
      c = { nombre, pendientes: 0, porHoja: new Map(), distritos: new Map(), rutas: new Set(), suministros: [] };
      m.set(nombre, c);
    }
    c.pendientes++;
    c.porHoja.set(hoja, (c.porHoja.get(hoja) || 0) + 1);
    const dist = (ext.distrito || '').trim();
    if (dist) c.distritos.set(dist, (c.distritos.get(dist) || 0) + 1);
    const ruta = String(ext.codigoRuta ?? '').trim();
    if (ruta) c.rutas.add(ruta.slice(0, 6));
    c.suministros.push(String(point.suministro));
  }
  return [...m.values()].sort((a, b) => b.pendientes - a.pendientes || a.nombre.localeCompare(b.nombre, 'es'));
}

const LISTA_MAX = 40;

/** Mensaje para el técnico con lo que tiene pendiente (WhatsApp o copiar). */
export function mensajeAsignacion(c: CargaTecnico, fecha = new Date()): string {
  const dia = fecha.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  const lineas = [
    `Hola ${c.nombre.split(/\s+/)[0]}, tu asignación para el ${dia}:`,
    '',
    `• ${c.pendientes} suministro${c.pendientes === 1 ? '' : 's'} pendiente${c.pendientes === 1 ? '' : 's'}`,
  ];
  [...c.porHoja].forEach(([h, n]) => lineas.push(`• ${h}: ${n}`));
  const dist = [...c.distritos].sort((a, b) => b[1] - a[1]);
  if (dist.length) lineas.push(`• Distritos: ${dist.map(([d, n]) => `${d} (${n})`).join(', ')}`);
  if (c.suministros.length <= LISTA_MAX) {
    lineas.push('', 'Suministros:', c.suministros.join(', '));
  }
  lineas.push('', 'Revisa los puntos en el mapa de la app TELCOM y sincroniza al terminar.');
  return lineas.join('\n');
}
