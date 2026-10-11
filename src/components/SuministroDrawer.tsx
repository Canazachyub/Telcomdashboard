import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, History, Camera, MapPin, Search, User, Gauge } from 'lucide-react';
import { useSuministroDrawer } from '../stores/suministroDrawerStore';
import { usePointsStore } from '../stores/pointsStore';
import { buscarEnJornadas, ocurrenciaDe, ordenar, primeCache, type Ocurrencia } from '../services/suministroHistory';
import { workersOf } from '../services/pointsService';
import { Badge, STATUS_UI } from './ui';
import PhotoGalleryModal from './PhotoGalleryModal';
import type { PhotoLink } from '../types/point';
import PhotoStrip from './PhotoStrip';
import { detectarSospechosos, MOTIVO_TEXTO, fmtDistancia } from '../utils/suministroCheck';

const fmtFecha = (d: Date | null) =>
  d ? d.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function Dato({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className={`text-gray-900 ${mono ? 'font-mono text-[13px]' : ''}`}>{value}</dd>
    </>
  );
}

/**
 * Ficha de un suministro: datos de la jornada actual, quién lo trabajó, fotos,
 * y su historial en todas las jornadas (un mismo suministro puede trabajarse
 * varias veces en hojas distintas).
 */
export default function SuministroDrawer() {
  const { point, jornada, autoBuscar, close } = useSuministroDrawer();
  const { sheets, pointsExtended, selectedSheet } = usePointsStore();
  const [historial, setHistorial] = useState<Ocurrencia[] | null>(null);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [fotos, setFotos] = useState<{ photos: PhotoLink[]; index: number } | null>(null);

  // Al cambiar de suministro, reiniciar el historial
  useEffect(() => {
    setHistorial(null);
    setProgreso(null);
  }, [point?.suministro]);

  // Cerrar con Escape
  useEffect(() => {
    if (!point) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !fotos && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [point, fotos, close]);

  const buscar = useCallback(async () => {
    if (!point) return;
    if (selectedSheet && pointsExtended.length) primeCache(selectedSheet, pointsExtended);
    const nombres = sheets.map((s) => s.name);
    setProgreso({ hechas: 0, total: nombres.length });
    const res = await buscarEnJornadas(point.suministro, nombres, (hechas, total, parciales) => {
      setProgreso({ hechas, total });
      setHistorial(ordenar(parciales));
    });
    setHistorial(res);
    setProgreso(null);
  }, [point, selectedSheet, pointsExtended, sheets]);

  // Abierta desde la consulta rápida: buscar el historial de inmediato
  useEffect(() => {
    if (point && autoBuscar) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.suministro, autoBuscar]);

  // ¿Es un suministro posiblemente mal escrito? (solo para la jornada cargada)
  const sospecha = useMemo(() => {
    if (!point || jornada !== selectedSheet) return null;
    return detectarSospechosos(pointsExtended).find((x) => x.point.suministro === point.suministro) || null;
  }, [point, jornada, selectedSheet, pointsExtended]);

  const actual = useMemo(() => (point ? ocurrenciaDe(jornada || '', point) : null), [point, jornada]);

  if (!point || !actual) return null;
  const st = STATUS_UI[actual.estado];

  const coords = (lat?: number | null, lng?: number | null) =>
    lat != null && lng != null ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : null;

  return (
    <>
      <div className="fixed inset-0 z-[1150] bg-black/50 backdrop-blur-[2px]" onClick={close} />
      <aside className="fixed inset-y-0 right-0 z-[1151] flex w-full max-w-md flex-col border-l border-gray-200 bg-navy-900 shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-5">
          <div className="min-w-0">
            <p className="brand-kicker">Ficha de suministro</p>
            <h2 className="mt-1 font-mono text-2xl font-semibold text-gray-900">{point.suministro}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={st?.tone || 'gray'} dot>
                {st?.label || actual.estado}
              </Badge>
              {jornada && <Badge tone="blue">{jornada}</Badge>}
            </div>
          </div>
          <button onClick={close} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {sospecha && (
            <section className="rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm">
              <p className="font-semibold text-purple-800">Suministro posiblemente mal escrito</p>
              <p className="mt-1 text-xs text-purple-800">{sospecha.motivos.map((m) => MOTIVO_TEXTO[m]).join(' · ')}</p>
              {sospecha.sugerencias.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {sospecha.sugerencias.map((sg, i) => (
                    <p key={sg.point.suministro} className="flex items-center justify-between text-xs text-gray-700">
                      <span>
                        {i === 0 ? 'Más probable: ' : 'Otra opción: '}
                        <span className="font-mono font-semibold text-gray-900">{sg.point.suministro}</span>
                      </span>
                      <span className="text-gray-500">
                        a {fmtDistancia(sg.distancia)}
                        {sg.jornada ? ` · ${sg.jornada}` : ''}
                      </span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-600">Sin pendientes cercanos; revisa la foto del medidor.</p>
              )}
            </section>
          )}

          {/* Datos */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <MapPin size={14} className="text-electric" /> Datos del suministro
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Dato label="Cliente" value={point.clienteNombre} />
              <Dato label="Dirección" value={point.direccion} />
              <Dato label="Distrito" value={point.distrito} />
              <Dato label="Código ruta" value={point.codigoRuta} mono />
              <Dato label="Serie" value={point.serie} mono />
              <Dato label="Marca / modelo" value={[point.marca, point.modelo].filter(Boolean).join(' · ')} />
              <Dato label="Coord. referencia" value={coords(point.latRef, point.longRef)} mono />
              <Dato label="Coord. en campo" value={coords(point.latReal, point.longReal)} mono />
            </dl>
          </section>

          {/* Trabajo */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <User size={14} className="text-electric" /> Trabajo en esta jornada
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Dato label="Técnico asignado" value={point.tecnico || 'Sin asignar'} />
              <Dato label="Trabajado por" value={workersOf(point).join(', ') || '—'} />
              <Dato label="Primera foto" value={fmtFecha(actual.primeraFoto)} />
              <Dato label="Última foto" value={fmtFecha(actual.ultimaFoto)} />
              <Dato label="Lectura" value={point.lectura != null && point.lectura !== '' ? String(point.lectura) : null} mono />
              <Dato label="Observación" value={point.notas} />
            </dl>
            {point.photoLinks?.length > 0 && (
              <div className="mt-3">
                <PhotoStrip photos={point.photoLinks} max={6} size={60} onOpen={(i) => setFotos({ photos: point.photoLinks, index: i })} />
              </div>
            )}
            {point.photoLinks?.length > 0 && (
              <button
                onClick={() => setFotos({ photos: point.photoLinks, index: 0 })}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                <Camera size={16} /> Ver fotos ({point.photoLinks.length})
              </button>
            )}
          </section>

          {/* Historial */}
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <History size={16} className="text-electric" /> Historial en todas las jornadas
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Un mismo suministro puede trabajarse varias veces en jornadas distintas. Aquí se ven todas, ordenadas por
              fecha.
            </p>

            {!historial && !progreso && (
              <button
                onClick={buscar}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 py-2 text-sm text-gray-700 hover:border-electric hover:text-electric"
              >
                <Search size={15} /> Buscar en las {sheets.length} jornadas
              </button>
            )}

            {progreso && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-gray-500">
                  <span>Revisando jornadas…</span>
                  <span className="font-mono">
                    {progreso.hechas}/{progreso.total}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full bg-electric transition-all"
                    style={{ width: `${progreso.total ? (progreso.hechas / progreso.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-gray-400">La primera búsqueda tarda; después queda en memoria.</p>
              </div>
            )}

            {historial && (
              <ol className="mt-3 space-y-2">
                {historial.length === 0 && !progreso && (
                  <li className="text-center text-xs text-gray-500">No aparece en otras jornadas.</li>
                )}
                {historial.map((o) => {
                  const s = STATUS_UI[o.estado];
                  const esActual = o.jornada === jornada;
                  return (
                    <li
                      key={o.jornada}
                      className={`rounded-xl border p-3 text-xs ${esActual ? 'border-electric/60 bg-blue-50' : 'border-gray-200 bg-navy-900'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-gray-900">{o.jornada}</span>
                        <Badge tone={s?.tone || 'gray'}>{s?.label || o.estado}</Badge>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
                        <span>Fecha: {fmtFecha(o.ultimaFoto)}</span>
                        <span className="flex items-center gap-1">
                          <Camera size={11} /> {o.fotos} fotos
                        </span>
                        <span className="truncate">Por: {o.trabajadores.join(', ') || '—'}</span>
                        {o.lectura != null && o.lectura !== '' && (
                          <span className="flex items-center gap-1 font-mono">
                            <Gauge size={11} /> {String(o.lectura)}
                          </span>
                        )}
                      </div>
                      {o.observacion && <p className="mt-1 truncate text-gray-500" title={o.observacion}>{o.observacion}</p>}
                      {o.point.photoLinks?.length > 0 && (
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <PhotoStrip
                            photos={o.point.photoLinks}
                            max={5}
                            size={42}
                            onOpen={(i) => setFotos({ photos: o.point.photoLinks, index: i })}
                          />
                          <button
                            onClick={() => setFotos({ photos: o.point.photoLinks, index: 0 })}
                            className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:border-electric hover:text-electric"
                          >
                            Ver {o.point.photoLinks.length} fotos
                          </button>
                        </div>
                      )}
                      {esActual && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-electric">Jornada actual</p>}
                    </li>
                  );
                })}
              </ol>
            )}
            {historial && historial.length > 1 && (
              <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                Este suministro aparece en {historial.length} jornadas.
              </p>
            )}
          </section>
        </div>
      </aside>

      {fotos && (
        // Contenedor propio para que la galería quede por encima de la ficha
        <div className="fixed inset-0 z-[1200]">
        <PhotoGalleryModal
          photos={fotos.photos}
          suministro={point.suministro}
          initialIndex={Math.min(fotos.index, fotos.photos.length - 1)}
          onClose={() => setFotos(null)}
        />
        </div>
      )}
    </>
  );
}
