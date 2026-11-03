// Globo de un suministro que aparece en varias jornadas: dónde está hecho, dónde sigue
// pendiente y de qué periodo es cada registro.
import { Copy } from 'lucide-react';
import PhotoStrip from '../PhotoStrip';
import { getStatusLabel, type GpsPointExtended } from '../../types/point';
import { ocurrenciaDe, type Ocurrencia } from '../../services/suministroHistory';
import { etiquetaHoja } from './mapaHojas';
import { INFO_CATEGORIA, etiquetaPeriodo, type GrupoRep } from './repetidos';
import type { AnyPoint } from './techUtils';

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const ESTADO_UI = {
  completado: 'bg-green-100 text-green-800',
  en_proceso: 'bg-yellow-100 text-yellow-800',
  pendiente: 'bg-red-100 text-red-800',
} as const;

interface Props {
  grupo: GrupoRep;
  principal: string | null;
  isTecnico: boolean;
  onFicha: (p: AnyPoint, hoja: string) => void;
  onFotos: (p: AnyPoint, i: number) => void;
  onTraer: (ocurrencias: Ocurrencia[], destino: string) => void;
}

export default function RepetidoPopup({ grupo, principal, isTecnico, onFicha, onFotos, onTraer }: Props) {
  if (grupo.categoria === 'unico') return null;
  const info = INFO_CATEGORIA[grupo.categoria];
  // Los hechos, la foto más reciente primero (es la que se ofrece para traer)
  const hechos = grupo.entradas
    .filter((e) => e.estado !== 'pendiente')
    .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));
  const masReciente = grupo.masReciente;
  const periodos = new Set(grupo.entradas.map((e) => e.periodo).filter(Boolean));
  const pendientes = grupo.entradas.filter((e) => e.estado === 'pendiente');

  return (
    <div className="min-w-[270px] max-w-[320px]">
      <div className="mb-2 border-b border-gray-200 pb-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">Suministro en {grupo.hojas} jornadas</p>
        <h3 className="font-mono text-base font-semibold text-gray-900">{grupo.repr.suministro}</h3>
        <p className="mt-1 flex items-start gap-1.5 text-xs font-semibold" style={{ color: info.color }}>
          <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: info.color }} />
          {info.label}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{info.desc}</p>
      </div>

      <ul className="max-h-72 space-y-2 overflow-y-auto">
        {grupo.entradas.map((e, i) => {
          const ext = e.point as GpsPointExtended;
          const tag = e === masReciente ? 'Más reciente' : e.estado !== 'pendiente' ? 'Anterior' : '';
          return (
            <li key={`${e.hoja}-${i}`} className="rounded-lg border border-gray-200 p-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-gray-900" title={e.hoja}>
                  {etiquetaHoja(e.hoja)}
                </span>
                {periodos.size > 1 && e.periodo && <span className="text-gray-500">{etiquetaPeriodo(e.periodo)}</span>}
                {e.hoja === principal && <span className="text-gray-500">· principal</span>}
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ESTADO_UI[e.estado]}`}>
                  {getStatusLabel(e.estado)}
                </span>
                {tag && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      tag === 'Más reciente' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tag}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {e.estado !== 'pendiente'
                  ? [fmt(e.fecha), `${e.fotos} foto${e.fotos === 1 ? '' : 's'}`, ext.odtNombre || ext.tecnico]
                      .filter(Boolean)
                      .join(' · ')
                  : ext.tecnico
                    ? `Asignado a ${ext.tecnico}`
                    : 'Sin técnico asignado'}
              </p>
              {(e.point.photoLinks?.length || 0) > 0 && (
                <div className="mt-1.5">
                  <PhotoStrip photos={e.point.photoLinks || []} max={4} size={36} onOpen={(k) => onFotos(e.point, k)} />
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  onClick={() => onFicha(e.point, e.hoja)}
                  className="rounded-md border border-gray-300 px-2 py-0.5 text-[11px] text-gray-700 hover:border-electric hover:text-electric"
                >
                  Ficha
                </button>
                {/* Traer solo si ya se hizo en el periodo: con fotos de un periodo anterior hay que volver a hacerlo */}
                {!isTecnico && e.estado === 'pendiente' && grupo.categoria === 'pend_hecho_reciente' && (
                  <button
                    onClick={() =>
                      onTraer(
                        hechos.map((h) => ocurrenciaDe(h.hoja, h.point as GpsPointExtended)),
                        e.hoja,
                      )
                    }
                    className="flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:brightness-110"
                    title={`Copiar las fotos de ${etiquetaHoja(hechos[0].hoja)} a ${etiquetaHoja(e.hoja)}`}
                  >
                    <Copy size={11} /> Traer a {etiquetaHoja(e.hoja)}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {pendientes.length > 0 && grupo.categoria === 'pend_hecho_reciente' && (
        <p className="mt-2 text-[11px] text-gray-500">Las copias pendientes no entran al asignar ni en los avisos.</p>
      )}
    </div>
  );
}
