import { useMemo, useState } from 'react';
import { X, Copy, CheckCircle2, AlertTriangle, Camera } from 'lucide-react';
import type { Ocurrencia } from '../../services/suministroHistory';
import { copiarRegistro, escribeEnPrueba } from '../../services/copiarRegistro';
import { OBSERVACION_EJECUTADO, OBSERVACION_NO_EJECUTADO } from '../../config/report';
import { Badge, STATUS_UI, ui } from '../ui';
import PhotoStrip from '../PhotoStrip';

interface Props {
  destino: string;
  ocurrencias: Ocurrencia[]; // de otras jornadas, con fotos (más reciente primero)
  onClose: () => void;
  onDone: () => void;
}

const fmtF = (d: Date | null) =>
  d ? d.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Trae a la jornada actual el registro de un suministro ya hecho en otra jornada:
 * copia sus fotos (sin volver a tomarlas) y permite corregir lectura y observación.
 */
export default function TraerRegistroModal({ destino, ocurrencias, onClose, onDone }: Props) {
  const [sel, setSel] = useState(0);
  const origen = ocurrencias[sel];
  const fotos = useMemo(() => origen.point.photoLinks || [], [origen]);
  const [marcadas, setMarcadas] = useState<Set<number>>(() => new Set(fotos.map((_, i) => i)));
  const [lectura, setLectura] = useState(origen.lectura != null ? String(origen.lectura) : '');
  const [observacion, setObservacion] = useState(origen.observacion || '');
  const [estado, setEstado] = useState<'editando' | 'copiando' | 'listo'>('editando');
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0, mensaje: '' });
  const [resultado, setResultado] = useState<{ ok: number; fallidas: { foto: number; error: string }[] } | null>(null);

  const elegirOrigen = (i: number) => {
    const o = ocurrencias[i];
    setSel(i);
    setMarcadas(new Set((o.point.photoLinks || []).map((_, k) => k)));
    setLectura(o.lectura != null ? String(o.lectura) : '');
    setObservacion(o.observacion || '');
  };

  const toggle = (i: number) =>
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return s;
    });

  const copiar = async () => {
    const elegidas = fotos.filter((_, i) => marcadas.has(i));
    if (elegidas.length === 0) return;
    setEstado('copiando');
    const r = await copiarRegistro({
      destino,
      origen: origen.point,
      jornadaOrigen: origen.jornada,
      fotos: elegidas,
      lectura: lectura.trim(),
      observacion: observacion.trim(),
      onProgress: (hechas, total, mensaje) => setProgreso({ hechas, total, mensaje }),
    });
    setResultado(r);
    setEstado('listo');
    if (r.ok > 0) onDone();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={estado === 'copiando' ? undefined : onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-5">
          <div>
            <p className="brand-kicker">Traer registro a esta jornada</p>
            <h3 className="mt-1 font-mono text-lg font-semibold text-gray-900">{origen.point.suministro}</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Destino: <span className="font-medium text-gray-800">{destino}</span>
            </p>
          </div>
          {estado !== 'copiando' && (
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Cerrar">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {estado === 'listo' && resultado ? (
            <div className="space-y-3 text-sm">
              {resultado.ok > 0 && (
                <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-green-800">
                  <CheckCircle2 size={16} /> Se registraron {resultado.ok} foto(s) en «{destino}». El mapa se está actualizando.
                </p>
              )}
              {resultado.fallidas.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle size={15} /> {resultado.fallidas.length} foto(s) no se pudieron registrar
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {resultado.fallidas.map((f) => (
                      <li key={f.foto}>
                        Foto {f.foto}: {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Origen */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Copiar desde</p>
                <div className="space-y-2">
                  {ocurrencias.map((o, i) => (
                    <button
                      key={o.jornada}
                      disabled={estado === 'copiando'}
                      onClick={() => elegirOrigen(i)}
                      className={`w-full rounded-xl border p-3 text-left text-xs transition-colors ${
                        i === sel ? 'border-electric bg-blue-50' : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-gray-900">{o.jornada}</span>
                        <Badge tone={STATUS_UI[o.estado]?.tone || 'gray'}>{STATUS_UI[o.estado]?.label || o.estado}</Badge>
                      </div>
                      <p className="mt-1 text-gray-600">
                        {fmtF(o.ultimaFoto)} · {o.trabajadores.join(', ') || '—'} · {o.fotos} fotos
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fotos */}
              <div>
                <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Camera size={13} /> Fotos a copiar ({marcadas.size} de {fotos.length})
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {fotos.map((f, i) => (
                    <label key={`${f.url}-${i}`} className="relative cursor-pointer">
                      <input
                        type="checkbox"
                        checked={marcadas.has(i)}
                        onChange={() => toggle(i)}
                        disabled={estado === 'copiando'}
                        className="absolute left-1 top-1 z-10 accent-blue-600"
                      />
                      <div className={marcadas.has(i) ? '' : 'opacity-40'}>
                        <PhotoStrip photos={[f]} max={1} size={64} onOpen={() => toggle(i)} />
                      </div>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-gray-500">Se reutilizan las fotos originales con su fecha y el técnico que las tomó.</p>
              </div>

              {/* Lectura y observación */}
              <div className="grid gap-3">
                <label className="text-xs font-semibold text-gray-600">
                  Lectura
                  <input
                    value={lectura}
                    onChange={(e) => setLectura(e.target.value)}
                    disabled={estado === 'copiando'}
                    inputMode="decimal"
                    placeholder="Sin lectura"
                    className={`${ui.input} mt-1 font-mono`}
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Observación
                  <select
                    value={[OBSERVACION_EJECUTADO, OBSERVACION_NO_EJECUTADO].includes(observacion) ? observacion : '__otra'}
                    onChange={(e) => setObservacion(e.target.value === '__otra' ? '' : e.target.value)}
                    disabled={estado === 'copiando'}
                    className={`${ui.input} mt-1`}
                  >
                    <option value={OBSERVACION_EJECUTADO}>Ejecutado</option>
                    <option value={OBSERVACION_NO_EJECUTADO}>No ejecutado</option>
                    <option value="__otra">Otra (escribir)</option>
                  </select>
                  {![OBSERVACION_EJECUTADO, OBSERVACION_NO_EJECUTADO].includes(observacion) && (
                    <textarea
                      value={observacion}
                      onChange={(e) => setObservacion(e.target.value)}
                      disabled={estado === 'copiando'}
                      rows={2}
                      placeholder="Escribe la observación…"
                      className={`${ui.input} mt-2`}
                    />
                  )}
                </label>
              </div>

              {estado === 'copiando' && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{progreso.mensaje}</span>
                    <span className="font-mono">
                      {progreso.hechas}/{progreso.total}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200">
                    <div className="h-full bg-electric transition-all" style={{ width: `${progreso.total ? (progreso.hechas / progreso.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}

              <p className="rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                {escribeEnPrueba
                  ? 'MODO PRUEBA: se enviará al servidor simulado, no a la hoja real.'
                  : `Se escribirá en la hoja «${destino}», igual que si el técnico hubiera sincronizado estas fotos desde la app.`}
              </p>
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-200 p-4">
          {estado === 'listo' ? (
            <button onClick={onClose} className={`${ui.btnPrimary} flex-1`}>
              Cerrar
            </button>
          ) : (
            <>
              <button onClick={onClose} disabled={estado === 'copiando'} className={`${ui.btnSecondary} flex-1`}>
                Cancelar
              </button>
              <button onClick={copiar} disabled={estado === 'copiando' || marcadas.size === 0} className={`${ui.btnPrimary} flex-1`}>
                <Copy size={16} /> {estado === 'copiando' ? 'Registrando…' : `Registrar ${marcadas.size} foto(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
