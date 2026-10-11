import { useEffect, useState } from 'react';
import { CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import { Check, X, ChevronRight, List } from 'lucide-react';
import type { Sospechoso } from '../../utils/suministroCheck';
import { fmtDistancia, LEJOS_M, posCandidato, posFoto } from '../../utils/suministroCheck';
import type { GpsPointExtended } from '../../types/point';
import PhotoStrip from '../PhotoStrip';
import PhotoGalleryModal from '../PhotoGalleryModal';
import { Badge, ui } from '../ui';

export interface Comparacion {
  item: Sospechoso;
  indice: number; // sugerencia que se está mirando
}


/**
 * Capa dentro del mapa: el candidato se dibuja como un punto «fantasma» (borroso y
 * punteado) unido por una línea al punto mal escrito, y el mapa encuadra a ambos.
 */
export function CompararCapa({ comp }: { comp: Comparacion }) {
  const map = useMap();
  const sg = comp.item.sugerencias[comp.indice];
  const a = posFoto(comp.item.point);
  const b = sg ? posCandidato(sg.point) : null;
  const clave = `${a?.join(',')}|${b?.join(',')}`;

  useEffect(() => {
    if (!a) return;
    const bounds = new LatLngBounds([a, a]);
    if (b) bounds.extend(b);
    map.flyToBounds(bounds, { paddingTopLeft: [80, 260], paddingBottomRight: [360, 80], maxZoom: 17, duration: 0.6 });
    // a y b se recalculan en cada render; la clave resume su valor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, clave]);

  if (!a) return null;
  return (
    <>
      {/* Halo sobre el punto mal escrito */}
      <CircleMarker center={a} radius={20} pathOptions={{ color: '#c084fc', weight: 2, fillColor: '#c084fc', fillOpacity: 0.12 }}>
        <Tooltip permanent direction="top" offset={[0, -18]} className="comparar-tip">
          «{comp.item.point.suministro}» (foto)
        </Tooltip>
      </CircleMarker>
      {b && sg && (
        <>
          <Polyline positions={[a, b]} pathOptions={{ color: '#c084fc', weight: 2, dashArray: '6 6', opacity: 0.9 }}>
            <Tooltip permanent direction="center" className="comparar-tip">
              {fmtDistancia(sg.distancia)}
            </Tooltip>
          </Polyline>
          {/* Punto fantasma del candidato */}
          <CircleMarker
            center={b}
            radius={14}
            className="punto-fantasma"
            pathOptions={{ color: '#22d3ee', weight: 3, dashArray: '4 4', fillColor: '#22d3ee', fillOpacity: 0.25, opacity: 0.8 }}
          >
            <Tooltip permanent direction="bottom" offset={[0, 14]} className="comparar-tip">
              ¿{sg.point.suministro}?
            </Tooltip>
          </CircleMarker>
        </>
      )}
    </>
  );
}

interface PanelProps {
  comp: Comparacion;
  onConfirmar: () => void;
  onSiguiente: () => void;
  onVolver: () => void;
  onCerrar: () => void;
}

/** Panel flotante sobre el mapa para confirmar o descartar la sugerencia. */
export function CompararPanel({ comp, onConfirmar, onSiguiente, onVolver, onCerrar }: PanelProps) {
  const p = comp.item.point as GpsPointExtended;
  const sg = comp.item.sugerencias[comp.indice];
  const total = comp.item.sugerencias.length;
  const cand = sg?.point as GpsPointExtended | undefined;
  const lejos = sg?.distancia != null && sg.distancia > LEJOS_M && !sg.coincideDigitos;
  const [foto, setFoto] = useState<number | null>(null);

  return (
    <div className="absolute left-1/2 top-3 z-[1000] w-[min(560px,calc(100%-24px))] -translate-x-1/2 rounded-2xl border border-purple-300/40 bg-navy-900/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="brand-kicker">
            Confirmar corrección · sugerencia {comp.indice + 1} de {total}
          </p>
          <p className="mt-1 text-sm text-gray-700">
            ¿El técnico quiso escribir <span className="font-mono font-semibold text-cyan-700">{sg?.point.suministro}</span> en vez
            de <span className="font-mono font-semibold text-purple-700">«{p.suministro}»</span>?
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
            {sg && <span className={lejos ? 'text-amber-700' : ''}>a {fmtDistancia(sg.distancia)} del GPS de la foto</span>}
            {sg?.jornada && <Badge tone="blue">{sg.jornada}</Badge>}
            {sg?.coincideDigitos && <Badge tone="green">coinciden los dígitos</Badge>}
            {lejos && <Badge tone="amber">lejos: confirma con la foto</Badge>}
          </div>
          {cand && (cand.clienteNombre || cand.serie) && (
            <p className="mt-1 truncate text-xs text-gray-500">
              {cand.clienteNombre && (
                <>
                  Cliente: <span className="text-gray-700">{cand.clienteNombre}</span>
                </>
              )}
              {cand.serie && <> · Medidor {cand.serie}</>}
            </p>
          )}
        </div>
        <button onClick={onCerrar} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>

      {(p.photoLinks?.length || 0) > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] text-gray-500">Fotos de «{p.suministro}»: busca el número del medidor</p>
          <PhotoStrip photos={p.photoLinks || []} max={5} size={56} onOpen={setFoto} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onConfirmar} disabled={!sg} className={`${ui.btnPrimary} px-3 py-1.5 text-xs`}>
          <Check size={14} /> Confirmar: es {sg?.point.suministro}
        </button>
        <button onClick={onSiguiente} className={`${ui.btnSecondary} px-3 py-1.5 text-xs`}>
          {comp.indice + 1 < total ? (
            <>
              No es este · ver siguiente <ChevronRight size={14} />
            </>
          ) : (
            'No es ninguno'
          )}
        </button>
        <button onClick={onVolver} className={`${ui.btnSecondary} px-3 py-1.5 text-xs`}>
          <List size={14} /> Volver a la lista
        </button>
      </div>

      {foto != null && (
        <div className="fixed inset-0 z-[1200]">
          <PhotoGalleryModal photos={p.photoLinks || []} suministro={p.suministro} initialIndex={foto} onClose={() => setFoto(null)} />
        </div>
      )}
    </div>
  );
}
