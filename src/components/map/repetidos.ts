// Suministros repetidos entre las jornadas del mapa: se juntan en un solo punto y se
// clasifican según dónde está hecho y dónde sigue pendiente, distinguiendo el periodo
// (año + semestre S01/S02 del nombre de la hoja) de la programación pendiente.
import { getPointStatus, type GpsPointExtended, type PointStatus } from '../../types/point';
import { normSuministro, ocurrenciaDe } from '../../services/suministroHistory';
import { etiquetaHoja, ordenHoja } from './mapaHojas';
import type { AnyPoint } from './techUtils';

export type CategoriaRep = 'unico' | 'pend_hecho_reciente' | 'pend_hecho_anterior' | 'hecho_varias' | 'pend_varias';

/** Sin semestre en el nombre: una foto de hace más de estos días se considera de un periodo anterior. */
export const DIAS_PERIODO = 120;

export const INFO_CATEGORIA: Record<
  Exclude<CategoriaRep, 'unico'>,
  { label: string; corto: string; color: string; desc: string }
> = {
  pend_hecho_reciente: {
    label: 'Pendiente, ya hecho en el periodo',
    corto: 'Hecho en otra jornada',
    color: '#2dd4bf',
    desc: 'Sigue pendiente en una lista, pero tiene fotos del mismo periodo en otra jornada. Cuenta como hecho y no se asigna.',
  },
  pend_hecho_anterior: {
    label: 'Pendiente, hecho en un periodo anterior',
    corto: 'Hecho en periodo anterior',
    color: '#fbbf24',
    desc: 'Tiene fotos de un periodo anterior, pero la programación nueva sigue pendiente. Hay que volver a hacerlo.',
  },
  hecho_varias: {
    label: 'Fotografiado en varias jornadas',
    corto: 'Hecho en varias',
    color: '#60a5fa',
    desc: 'Tiene fotos en más de una jornada: re-contraste o trabajo repetido.',
  },
  pend_varias: {
    label: 'Pendiente en varias jornadas',
    corto: 'Pendiente en varias',
    color: '#f472b6',
    desc: 'Está en varias listas y nadie lo ha hecho todavía.',
  },
};

/** Periodo de una jornada (año·10 + semestre) según su nombre; null si no lo trae. */
export function periodoHoja(nombre: string): number | null {
  const u = nombre.toUpperCase();
  const anio = Number(u.match(/(20\d\d)/)?.[1] ?? 0);
  if (!anio) return null;
  const s = u.match(/-S0?([12])\b/)?.[1] ?? (/20\d\d-II\b/.test(u) ? '2' : /20\d\d-I\b/.test(u) ? '1' : null);
  return s ? anio * 10 + Number(s) : null;
}

export const etiquetaPeriodo = (p: number | null) => (p ? `S0${p % 10}-${Math.floor(p / 10)}` : '');

export interface EntradaRep {
  hoja: string;
  point: AnyPoint;
  estado: PointStatus;
  /** Última foto (o la fecha de supervisión) */
  fecha: Date | null;
  fotos: number;
  periodo: number | null;
  orden: number;
}

export interface GrupoRep {
  clave: string;
  /** De la jornada más nueva a la más vieja */
  entradas: EntradaRep[];
  /** Punto que se dibuja (el hecho más reciente o el pendiente de la jornada más nueva) */
  repr: AnyPoint;
  hojaRepr: string;
  categoria: CategoriaRep;
  /** Estado con el que cuenta: un pendiente ya hecho en el periodo cuenta como hecho */
  estado: PointStatus;
  /** Jornadas distintas en las que aparece */
  hojas: number;
  /** Registro con la foto más reciente (null si nadie lo hizo) */
  masReciente: EntradaRep | null;
}

const hecho = (e: EntradaRep) => e.estado !== 'pendiente';
const t = (d: Date | null) => d?.getTime() ?? 0;

/**
 * Agrupa por suministro los puntos de varias jornadas. `ordenLista` es el orden de las hojas en
 * el libro (respaldo para ordenar las que no traen semana en el nombre).
 */
export function agruparRepetidos(
  items: { point: AnyPoint; hoja: string }[],
  ordenLista: string[] = [],
  hoy = new Date(),
) {
  const posLista = new Map(ordenLista.map((h, i) => [h, i]));
  const porClave = new Map<string, EntradaRep[]>();
  for (const { point, hoja } of items) {
    const clave = normSuministro(point.suministro);
    if (!clave) continue;
    const oc = ocurrenciaDe(hoja, point as GpsPointExtended);
    const e: EntradaRep = {
      hoja,
      point,
      estado: getPointStatus(point),
      fecha: oc.ultimaFoto,
      fotos: oc.fotos,
      periodo: periodoHoja(hoja),
      orden: ordenHoja(hoja) * 1000 + (posLista.get(hoja) ?? 0),
    };
    const arr = porClave.get(clave);
    if (arr) arr.push(e);
    else porClave.set(clave, [e]);
  }

  const grupos: GrupoRep[] = [];
  porClave.forEach((entradas, clave) => {
    const hojas = new Set(entradas.map((e) => e.hoja)).size;
    if (hojas < 2) {
      // Solo en una jornada: cada fila se dibuja como siempre
      entradas.forEach((e) =>
        grupos.push({
          clave,
          entradas: [e],
          repr: e.point,
          hojaRepr: e.hoja,
          categoria: 'unico',
          estado: e.estado,
          hojas: 1,
          masReciente: hecho(e) ? e : null,
        }),
      );
      return;
    }
    // La más reciente primero: los hechos por fecha de foto, luego por jornada
    entradas.sort((a, b) => t(b.fecha) - t(a.fecha) || b.orden - a.orden);
    const hechos = entradas.filter(hecho);
    const pendientes = entradas.filter((e) => !hecho(e));
    const pendNueva = [...pendientes].sort((a, b) => b.orden - a.orden)[0];

    let categoria: CategoriaRep;
    if (pendientes.length && hechos.length) {
      const periodoPend = Math.max(...pendientes.map((e) => e.periodo ?? 0));
      const reciente = hechos.some((h) =>
        h.periodo && periodoPend
          ? h.periodo >= periodoPend
          : !!h.fecha && (hoy.getTime() - h.fecha.getTime()) / 86_400_000 <= DIAS_PERIODO,
      );
      categoria = reciente ? 'pend_hecho_reciente' : 'pend_hecho_anterior';
    } else if (hechos.length) categoria = 'hecho_varias';
    else categoria = 'pend_varias';

    const repr = categoria === 'pend_hecho_reciente' || categoria === 'hecho_varias' ? hechos[0] : pendNueva;
    grupos.push({
      clave,
      // Para mostrar: de la jornada más nueva a la más vieja
      entradas: [...entradas].sort((a, b) => b.orden - a.orden || t(b.fecha) - t(a.fecha)),
      repr: repr.point,
      hojaRepr: repr.hoja,
      categoria,
      estado: categoria === 'pend_hecho_reciente' ? hechos[0].estado : repr.estado,
      hojas,
      masReciente: hechos[0] ?? null,
    });
  });
  return grupos;
}

/** Puntos que no deben asignarse ni avisarse: copias pendientes de algo ya hecho en el periodo. */
export function copiasResueltas(grupos: GrupoRep[]): Set<AnyPoint> {
  const s = new Set<AnyPoint>();
  grupos.forEach((g) => {
    if (g.categoria === 'pend_hecho_reciente') g.entradas.forEach((e) => e.estado === 'pendiente' && s.add(e.point));
  });
  return s;
}

/** Texto corto de dónde está: «SEM14 ✓ · SEM15 pend. · SEM08 ✓» */
export const resumenGrupo = (g: GrupoRep) =>
  g.entradas.map((e) => `${etiquetaHoja(e.hoja)} ${e.estado === 'pendiente' ? 'pend.' : '✓'}`).join(' · ');
