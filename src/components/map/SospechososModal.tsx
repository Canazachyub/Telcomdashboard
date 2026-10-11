import { useState } from 'react';
import { corregirEnHoja } from '../../services/corregirSuministro';
import { X, AlertTriangle, MapPin, FileSearch, Wand2, CheckCircle2, Undo2, Download } from 'lucide-react';
import { buscarCorreccion, type Correccion } from '../../utils/correcciones';
import type { Sospechoso } from '../../utils/suministroCheck';
import { MOTIVO_TEXTO, fmtDistancia, LEJOS_M, MAX_SUGERENCIA_M, esMalEscrito, posFoto } from '../../utils/suministroCheck';
import type { GpsPointExtended, PhotoLink } from '../../types/point';
import { Badge, ui } from '../ui';
import PhotoStrip from '../PhotoStrip';
import PhotoGalleryModal from '../PhotoGalleryModal';

interface Props {
  jornada: string;
  items: Sospechoso[];
  onClose: () => void;
  onVerEnMapa: (suministro: string) => void;
  onFicha: (point: GpsPointExtended) => void;
  /** Mostrar en el mapa la sugerencia «indice» junto al punto mal escrito */
  onComparar: (item: Sospechoso, indice: number) => void;
  correcciones: Correccion[];
  onDeshacer: (c: Correccion) => void;
  onExportar: () => void;
  /** Tras corregir en la hoja: quitar la corrección local y recargar la jornada */
  onCorregido: (c: Correccion) => void;
}

/**
 * Lista de suministros probablemente mal escritos por el técnico, con sus fotos
 * (en la foto del medidor se ve el número real) y el suministro sugerido.
 */
export default function SospechososModal({
  jornada,
  items,
  onClose,
  onVerEnMapa,
  onFicha,
  onComparar,
  correcciones,
  onDeshacer,
  onExportar,
  onCorregido,
}: Props) {
  const [galeria, setGaleria] = useState<{ s: string; photos: PhotoLink[]; i: number } | null>(null);
  const malEscritos = items.filter(esMalEscrito);
  const fueraDeLista = items.filter((x) => !esMalEscrito(x));
  const [verFuera, setVerFuera] = useState(malEscritos.length === 0);
  // Corrección en la hoja: clave del registro que pide confirmación / que se está enviando
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Record<string, { ok: boolean; texto: string }>>({});

  const aplicar = async (clave: string, c: Correccion) => {
    setEnviando(clave);
    try {
      const r = await corregirEnHoja({ sheetName: c.jornada, original: c.original, corregido: c.corregido, lat: c.lat, lng: c.lng });
      const texto = r.success
        ? `Corregido en la hoja: ${r.fotos ?? ''} foto(s) ahora son ${c.corregido}${r.conFilaDeLista === false ? ' (no estaba en la lista)' : ''}.`
        : r.sinInstalar
          ? 'El servidor todavía no tiene la acción «corregirSuministro». Usa el Excel de confirmadas mientras tanto.'
          : r.message || 'No se pudo corregir';
      setResultado((x) => ({ ...x, [clave]: { ok: r.success, texto } }));
      if (r.success) onCorregido(c);
    } catch (e) {
      setResultado((x) => ({ ...x, [clave]: { ok: false, texto: `Sin conexión con el servidor: ${(e as Error).message}` } }));
    } finally {
      setEnviando(null);
      setAConfirmar(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
          <div>
            <p className="brand-kicker">Control de calidad</p>
            <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <AlertTriangle size={18} className="text-purple-700" />
              {malEscritos.length} suministro{malEscritos.length === 1 ? '' : 's'} mal escrito{malEscritos.length === 1 ? '' : 's'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Jornada <span className="font-medium text-gray-700">{jornada}</span>. Revisa la foto del medidor para confirmar el
              número real. La sugerencia es el suministro más cercano al GPS de la foto (de esta jornada y, si ya revisaste
              «Hechos en otras jornadas», también de las demás).
            </p>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            {correcciones.length > 0 && (
              <button
                onClick={onExportar}
                className={`${ui.btnSecondary} px-3 py-1.5 text-xs`}
                title="Lista de correcciones confirmadas para corregir la hoja"
              >
                <Download size={13} /> {correcciones.length} confirmada{correcciones.length === 1 ? '' : 's'} · Excel
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {malEscritos.length === 0 && (
            <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">No hay suministros con letras ni largo raro en esta jornada.</p>
          )}
          {[...malEscritos, ...(verFuera ? fueraDeLista : [])].map((it, idx) => {
            const p = it.point as GpsPointExtended;
            const fotos = p.photoLinks || [];
            const pos = posFoto(p);
            const corr = buscarCorreccion(correcciones, String(p.suministro), pos?.[0] ?? null, pos?.[1] ?? null);
            const clave = `${p.suministro}|${pos?.join(',')}`;
            const res = resultado[clave];
            return (
              <div key={`${p.suministro}-${p.latReal}-${p.longReal}`}>
              {verFuera && idx === malEscritos.length && (
                <div className="mb-3 mt-2 border-t border-gray-200 pt-4">
                  <p className="brand-kicker">Fuera de la lista · {fueraDeLista.length}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Códigos con formato válido que no figuran en la lista de esta jornada. Pueden ser trabajos adicionales o un
                    dígito cambiado; compáralos con la foto del medidor.
                  </p>
                </div>
              )}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-gray-500">Escrito por el técnico</p>
                    <p className="font-mono text-xl font-semibold text-purple-700">«{p.suministro}»</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {it.motivos.map((m) => (
                        <Badge key={m} tone="purple">
                          {MOTIVO_TEXTO[m]}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {p.odtNombre || p.tecnico || 'Técnico desconocido'} · {fotos.length} fotos
                      {p.lectura != null && p.lectura !== '' && ` · lectura ${p.lectura}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onVerEnMapa(p.suministro)} className={`${ui.btnSecondary} px-3 py-1.5 text-xs`}>
                      <MapPin size={13} /> En el mapa
                    </button>
                    <button onClick={() => onFicha(p)} className={`${ui.btnSecondary} px-3 py-1.5 text-xs`}>
                      <FileSearch size={13} /> Ficha
                    </button>
                  </div>
                </div>

                {fotos.length > 0 && (
                  <div className="mt-3">
                    <PhotoStrip photos={fotos} max={6} size={64} onOpen={(i) => setGaleria({ s: p.suministro, photos: fotos, i })} />
                  </div>
                )}

                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-semibold text-gray-600">Suministro sugerido</p>
                  {it.sugerencias.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      Ningún suministro de la lista a menos de {MAX_SUGERENCIA_M} m ni con dígitos parecidos. Lee el número en la foto del medidor.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {it.sugerencias.map((sg, i) => (
                        <button
                          key={sg.point.suministro}
                          onClick={() => onComparar(it, i)}
                          title="Ver este punto en el mapa junto a la foto y confirmar"
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition hover:border-cyan-400 hover:shadow-[0_0_0_3px_rgb(34_211_238/0.15)] ${
                            corr?.corregido === String(sg.point.suministro)
                              ? 'border-cyan-400 bg-cyan-50'
                              : i === 0
                                ? 'border-green-200 bg-green-50'
                                : 'border-gray-200 bg-white'
                          }`}
                        >
                          <MapPin size={12} className="text-cyan-600" />
                          <span className="font-mono font-semibold text-gray-900">{sg.point.suministro}</span>
                          <span className={sg.distancia != null && sg.distancia > LEJOS_M ? 'text-amber-700' : 'text-gray-500'}>
                            a {fmtDistancia(sg.distancia)}
                          </span>
                          {sg.jornada && <Badge tone="blue">{sg.jornada}</Badge>}
                          {sg.coincideDigitos && <Badge tone="green">coinciden los dígitos</Badge>}
                          {sg.distancia != null && sg.distancia > LEJOS_M && !sg.coincideDigitos && <Badge tone="amber">lejos: confirma con la foto</Badge>}
                          {i === 0 && (sg.coincideDigitos || (sg.distancia != null && sg.distancia <= LEJOS_M)) && <Badge tone="cyan">más probable</Badge>}
                        </button>
                      ))}
                    </div>
                  )}
                  {it.sugerencias.length > 0 && !corr && (
                    <p className="mt-1.5 text-[11px] text-gray-500">Toca una sugerencia para verla en el mapa y confirmarla.</p>
                  )}
                  {corr && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-300/50 bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
                      <CheckCircle2 size={14} />
                      Confirmado: «{corr.original}» → <span className="font-mono font-semibold">{corr.corregido}</span>
                      <button
                        onClick={() => onDeshacer(corr)}
                        className="ml-auto inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
                      >
                        <Undo2 size={12} /> Deshacer
                      </button>
                    </div>
                  )}
                  {res && (
                    <p
                      className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                        res.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}
                    >
                      {res.texto}
                    </p>
                  )}
                  {corr && !res?.ok && (
                    aConfirmar === clave ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-gray-700">
                          Se cambiará «{corr.original}» por <span className="font-mono font-semibold">{corr.corregido}</span> en
                          las {fotos.length} fotos de esta visita y se copiarán los datos de la lista.
                        </span>
                        <button
                          onClick={() => aplicar(clave, corr)}
                          disabled={enviando === clave}
                          className={`${ui.btnPrimary} px-3 py-1.5 text-xs`}
                        >
                          <Wand2 size={13} /> {enviando === clave ? 'Corrigiendo…' : 'Sí, corregir en la hoja'}
                        </button>
                        <button onClick={() => setAConfirmar(null)} className={`${ui.btnSecondary} px-3 py-1.5 text-xs`}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setAConfirmar(clave)} className={`${ui.btnPrimary} mt-3 px-3 py-1.5 text-xs`}>
                        <Wand2 size={13} /> Corregir en la hoja
                      </button>
                    )
                  )}
                </div>
              </div>
              </div>
            );
          })}
          {fueraDeLista.length > 0 && (
            <button onClick={() => setVerFuera((v) => !v)} className={`${ui.btnSecondary} w-full justify-center text-xs`}>
              {verFuera ? 'Ocultar' : 'Ver'} {fueraDeLista.length} código{fueraDeLista.length === 1 ? '' : 's'} fuera de la lista de la jornada
            </button>
          )}
        </div>
      </div>

      {galeria && (
        <div className="fixed inset-0 z-[1200]" onClick={(e) => e.stopPropagation()}>
          <PhotoGalleryModal photos={galeria.photos} suministro={galeria.s} initialIndex={galeria.i} onClose={() => setGaleria(null)} />
        </div>
      )}
    </div>
  );
}
