// Cálculos puros de «Entrega semanal»: nombre corto de la semana, plazo y la lista de revisión
// (qué falta antes de entregar). Sin React, sin servidor.
import { normSuministro, plazoEntrega, type PlanItem, type SupervisadaApp } from '../../services/formatosService';
import { parseFecha, procedimiento } from '../../utils/pdfFormatos';
import type { GpsPointExtended } from '../../types/point';

/** Fotos mínimas del Formato 4 por tipo de formulario (igual que la app: supervision_datos.dart). */
export const FOTOS_F4: Record<'1A' | '2A', string[]> = {
  '1A': ['Panorámica del predio', 'Medidor: placa, sticker y precinto', 'Caja portamedidor cerrada'],
  '2A': [
    'Panorámica con el personal trabajando',
    'Ensayo de precisión o marcha en vacío',
    'Medidor: placa, sticker y precinto',
    'Caja portamedidor cerrada',
  ],
};

/** Nombre corto para mostrar: «Semana 19 · P-227 · Cusco». Si no se reconoce, el nombre tal cual. */
export function nombreSemana(hoja: string): { corto: string; semana: number | null; proc: string } {
  const h = hoja.trim();
  const { proc, sector } = procedimiento(h);
  const m = h.match(/SEM(?:ANA)?\s*[-_.]?\s*0*(\d{1,3})(?!\d)/i);
  if (!m) return { corto: h, semana: null, proc };
  const semana = Number(m[1]);
  const partes = [`Semana ${semana}`];
  // El procedimiento solo si la hoja lo nombra (las hojas antiguas «SEMANA 19» no lo dicen)
  if (/P-?227|NTCSE/i.test(h)) partes.push(proc);
  if (sector !== '—')
    partes.push(
      sector
        .split(' / ')
        .map((s) => s.charAt(0) + s.slice(1).toLowerCase())
        .join(' / '),
    );
  return { corto: partes.join(' · '), semana, proc };
}

/** Nombre del paquete: Entrega_P-227_Semana19[_CUSCO][_BORRADOR].zip */
export function nombreZip(hoja: string, borrador: boolean): string {
  const { semana, proc } = nombreSemana(hoja);
  // Con el sector, para que la semana 5 de Cusco y la de Urubamba no se llamen igual
  const { sector } = procedimiento(hoja);
  const sec = semana != null && sector !== '—' ? `_${sector.replace(/\s+/g, '').replace(/\//g, '-')}` : '';
  const base = semana != null ? `Semana${semana}${sec}` : hoja.trim().replace(/[^\w-]+/g, '_') || 'Jornada';
  return `Entrega_${proc}_${base}${borrador ? '_BORRADOR' : ''}.zip`;
}

/** Plazo: 5.º día hábil después del último día programado (de la programación o, si no hay, de la hoja). */
export function plazoDe(plan: PlanItem[], puntos: GpsPointExtended[]) {
  const delPlan = plan.map((p) => parseFecha(p.fechaProgramada)).filter((d) => d);
  return plazoEntrega(delPlan.length ? delPlan : puntos.map((p) => parseFecha(p.fecha)));
}

/** Fotos del Formato 4 que le faltan a un formulario. */
export function fotosFaltantes(s: SupervisadaApp): string[] {
  const tiene = new Set(s.fotosApp.map((f) => f.rol));
  return FOTOS_F4[s.tipo].filter((r) => !tiene.has(r));
}

export interface Revision {
  /** La lista viene de la programación del servidor (si no, de los suministros de la hoja). */
  planDisponible: boolean;
  programados: number;
  faltanSupervisar: string[];
  sinFotos: { s: SupervisadaApp; faltan: string[] }[];
  /** Supervisados cuyo punto no tiene lectura: no salen en el Formato 4. */
  sinLectura: SupervisadaApp[];
  noConformes: SupervisadaApp[];
  porAvisar: SupervisadaApp[];
  coincidentes: number;
  metaCoincidentes: number;
  provisionales: SupervisadaApp[];
}

export function revisar(sup: SupervisadaApp[], plan: PlanItem[], puntos: GpsPointExtended[]): Revision {
  const planDisponible = plan.length > 0;
  const lista = planDisponible
    ? plan.map((p) => p.suministro)
    : [...new Set(puntos.map((p) => String(p.suministro ?? '').trim()).filter(Boolean))];
  const vistos = new Set<string>();
  const programados = lista.filter((x) => {
    const k = normSuministro(x);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  const supervisados = new Set(sup.map((s) => normSuministro(s.punto.suministro)));
  const noConformes = sup.filter((s) => !s.conforme);
  return {
    planDisponible,
    programados: programados.length,
    faltanSupervisar: programados.filter((x) => !supervisados.has(normSuministro(x))),
    sinFotos: sup.map((s) => ({ s, faltan: fotosFaltantes(s) })).filter((x) => x.faltan.length > 0),
    sinLectura: sup.filter((s) => s.punto.lectura == null || s.punto.lectura === ''),
    noConformes,
    porAvisar: noConformes.filter((s) => !s.avisado),
    coincidentes: sup.filter((s) => s.tipo === '2A').length,
    metaCoincidentes: sup.length ? Math.ceil(sup.length * 0.1) : 0,
    provisionales: sup.filter((s) => s.provisional),
  };
}
