// Corregir las respuestas de un formulario 1A / 2A desde el escritorio, con las mismas reglas que la
// app: SI / NO por ítem (N.A. solo donde la app lo permite), conforme = ninguna en NO, la observación
// se llena sola con «Observación: …» y es obligatoria si hay algún NO, certificados con N° y fecha.
// Cada ítem en NO puede llevar fotos de evidencia elegidas entre las fotos del suministro.
// Guarda con «editarFormato» (admin / supervisor); la hoja registra quién y cuándo (columna BB).
// No toca las casillas de fotos del formato, el número SP / SC ni el aviso.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, CheckCircle2, ImagePlus, Loader2, PencilLine, X } from 'lucide-react';
import { ui } from '../ui';
import { Thumb } from '../PhotoStrip';
import { loadImageWithCache } from '../../utils/imageCache';
import { editarFormato, type CambiosFormato, type SupervisadaApp } from '../../services/formatosService';
import {
  bloquesDe,
  errorFecha,
  formatearFechaDma,
  leerResp,
  preguntasDe,
  separarCertificado,
  sincronizarObservacion,
  unirCertificado,
  type RespApp,
} from '../../utils/preguntasApp';

interface Props {
  s: SupervisadaApp;
  hoja: string;
  onCerrar: () => void;
  /** Se guardó: la página vuelve a leer la jornada. */
  onGuardado: (texto: string) => void;
}

export default function EditorFormato({ s, hoja, onCerrar, onGuardado }: Props) {
  const f = s.servidor!;
  const tipo = s.tipo;
  const preguntas = useMemo(() => preguntasDe(tipo), [tipo]);

  // ---------------------------------------------------------------- estado inicial (lo que llegó)
  const inicial = useMemo(() => {
    const resp: Record<string, RespApp | undefined> = {};
    for (const p of preguntas) resp[p.id] = leerResp(f.resp?.[p.id]);
    const pa = separarCertificado(f.patron ?? '');
    const ca = separarCertificado(f.carga ?? '');
    return {
      resp,
      observacion: String(f.observacion ?? ''),
      fechaSticker: String(f.fechaSticker ?? '').trim(),
      lectura: String(f.lectura ?? '').trim(),
      patronN: pa.numero,
      patronF: pa.fecha,
      cargaN: ca.numero,
      cargaF: ca.fecha,
      evid: evidenciasDe(f.fotos),
    };
  }, [f, preguntas]);

  // Fotos del suministro que pueden ser evidencia: todas menos las casillas del formato
  const casillas = useMemo(
    () => new Set((f.fotos ?? []).filter((x) => !esRolEvidencia(x.rol)).map((x) => String(x.timestamp).trim())),
    [f],
  );
  const disponibles = useMemo(() => {
    const vistas = new Set<string>();
    const out: { timestamp: string; url: string }[] = [];
    for (const x of f.fotos ?? []) {
      const t = String(x.timestamp).trim();
      if (esRolEvidencia(x.rol) && x.url && !vistas.has(t)) {
        out.push({ timestamp: t, url: x.url });
        vistas.add(t);
      }
    }
    for (const l of s.punto.photoLinks ?? []) {
      const t = String(l.fecha ?? '').trim();
      if (!t || !l.url || casillas.has(t) || vistas.has(t)) continue;
      vistas.add(t);
      out.push({ timestamp: t, url: l.url });
    }
    return out;
  }, [f, s.punto.photoLinks, casillas]);

  const [resp, setResp] = useState(inicial.resp);
  const [obs, setObs] = useState(inicial.observacion);
  const [fechaSticker, setFechaSticker] = useState(inicial.fechaSticker);
  const [lectura, setLectura] = useState(inicial.lectura);
  const [patronN, setPatronN] = useState(inicial.patronN);
  const [patronF, setPatronF] = useState(inicial.patronF);
  const [cargaN, setCargaN] = useState(inicial.cargaN);
  const [cargaF, setCargaF] = useState(inicial.cargaF);
  const [evid, setEvid] = useState(inicial.evid);
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  /** Foto que se ve grande en el panel de la derecha. */
  const [vista, setVista] = useState<{ url: string; timestamp: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  /** Pone o quita una foto como evidencia del ítem (si era de otro ítem, pasa a este). */
  const alternarFoto = (pid: string, timestamp: string) =>
    setEvid((e) => {
      const n = { ...e };
      if (n[timestamp] === pid) delete n[timestamp];
      else n[timestamp] = pid;
      return n;
    });

  const enNo = preguntas.filter((p) => resp[p.id] === 'NO');
  const conforme = enNo.length === 0;

  const marcar = (id: string, v: RespApp) => {
    const nuevo = { ...resp, [id]: v };
    setResp(nuevo);
    // Un ítem que deja de estar en NO ya no lleva evidencia (la foto queda en la hoja, sin etiqueta)
    if (v !== 'NO') {
      setEvid((e) => Object.fromEntries(Object.entries(e).filter(([, pid]) => pid !== id)));
      if (eligiendo === id) setEligiendo(null);
    }
    // Como en la app: la observación agrega o quita sola las líneas «No cumple: …»
    setObs((o) =>
      sincronizarObservacion(
        o,
        preguntas.filter((p) => nuevo[p.id] === 'NO').map((p) => p.texto),
        preguntas.map((p) => p.texto),
      ),
    );
  };

  // Esc cierra (si no está guardando); el fondo no se desplaza
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !guardando && onCerrar();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [onCerrar, guardando]);

  // ---------------------------------------------------------------- qué cambió y validación
  const cambios: CambiosFormato = {};
  const respCambiadas: Record<string, string> = {};
  for (const p of preguntas) if (resp[p.id] !== inicial.resp[p.id]) respCambiadas[p.id] = resp[p.id] ?? '';
  if (Object.keys(respCambiadas).length) cambios.resp = respCambiadas;
  if (obs.trim() !== inicial.observacion.trim()) cambios.observacion = obs.trim();
  if (tipo === '1A') {
    if (fechaSticker.trim() !== inicial.fechaSticker) cambios.fechaSticker = fechaSticker.trim();
    if (lectura.trim() !== inicial.lectura) cambios.lectura = lectura.trim();
  } else {
    const p = unirCertificado(patronN, patronF);
    const c = unirCertificado(cargaN, cargaF);
    if (p !== unirCertificado(inicial.patronN, inicial.patronF)) cambios.patron = p;
    if (c !== unirCertificado(inicial.cargaN, inicial.cargaF)) cambios.carga = c;
  }
  const claveEvid = (e: Record<string, string>) =>
    Object.entries(e)
      .map(([t, pid]) => `${t}|${pid}`)
      .sort()
      .join(';');
  if (claveEvid(evid) !== claveEvid(inicial.evid)) {
    cambios.evidencias = Object.entries(evid).map(([timestamp, pregunta]) => ({ timestamp, pregunta }));
  }
  const hayCambios = Object.keys(cambios).length > 0;

  const errores: string[] = [];
  const sinResponder = preguntas.filter((p) => !resp[p.id]);
  if (sinResponder.length) errores.push(`Falta responder: ${sinResponder.map((p) => p.texto).join('; ')}`);
  if (!conforme && !obs.trim()) errores.push('Escribe la observación de lo que está en NO');
  if (tipo === '1A') {
    const e = errorFecha(fechaSticker, 'Fecha del sticker');
    if (e) errores.push(e);
  } else {
    for (const [n, fe, que] of [
      [patronN, patronF, 'del patrón'],
      [cargaN, cargaF, 'de la carga'],
    ] as const) {
      const e = errorFecha(fe, `Fecha de calibración ${que}`);
      if (e) errores.push(e);
      else if (fe.trim() && !n.trim()) errores.push(`Escribe el N° de certificado ${que}`);
    }
  }

  const guardar = async () => {
    if (!hayCambios || errores.length) return;
    setGuardando(true);
    setError('');
    try {
      const r = await editarFormato(hoja, s.id, cambios);
      if (r.success) {
        onGuardado(
          `Formulario ${tipo} de ${s.punto.suministro} corregido (${conforme ? 'conforme' : `no conforme · ${enNo.length} en NO`}).`,
        );
        onCerrar();
      } else setError(r.message || 'El servidor rechazó la corrección.');
    } finally {
      setGuardando(false);
    }
  };

  // ---------------------------------------------------------------- vista
  const campoFecha = (valor: string, set: (v: string) => void, etiqueta: string) => (
    <label className="block min-w-0 text-xs text-gray-500">
      {etiqueta}
      <input
        value={valor}
        onChange={(e) => set(formatearFechaDma(e.target.value))}
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        className={`${ui.input} mt-1 tabular-nums`}
      />
    </label>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/80 p-3 sm:p-6"
      onClick={() => !guardando && onCerrar()}
    >
      <div
        className="flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-navy-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Corregir formulario ${tipo} del suministro ${s.punto.suministro}`}
      >
        {/* Encabezado */}
        <div className="flex items-start gap-3 border-b border-gray-200 px-5 py-3.5">
          <span className="mt-0.5 rounded-lg bg-blue-100 p-2 text-electric">
            <PencilLine size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-gray-900">
              Corregir formulario {tipo} · {s.punto.suministro}
            </p>
            <p className="text-xs text-gray-500">
              {s.tecnico} · {s.fechaTxt} {s.horaTxt}
              {s.reporte && !s.provisional ? ` · ${s.reporte} (el número no cambia)` : ''}. La hoja guarda quién
              corrigió y cuándo. Las casillas de fotos del formato no cambian.
            </p>
          </div>
          <button
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {bloquesDe(tipo).map((b) => (
              <section key={b.titulo}>
                <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">{b.titulo}</h3>
                <div className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200">
                  {b.preguntas.map((p) => {
                    const v = resp[p.id];
                    const cambio = v !== inicial.resp[p.id];
                    const opciones: RespApp[] = p.conNA ? ['SI', 'NO', 'N.A.'] : ['SI', 'NO'];
                    const fotosItem = Object.entries(evid)
                      .filter(([, pid]) => pid === p.id)
                      .map(([t]) => disponibles.find((d) => d.timestamp === t) ?? { timestamp: t, url: '' });
                    return (
                      <div key={p.id} className={v === 'NO' ? 'bg-red-50' : ''}>
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="min-w-0">
                            <p className={`text-sm ${v === 'NO' ? 'font-semibold text-red-800' : 'text-gray-800'}`}>
                              {p.texto}
                              {cambio && (
                                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                  cambiado
                                </span>
                              )}
                            </p>
                            {p.ayuda && <p className="text-[11px] text-gray-500">{p.ayuda}</p>}
                          </div>
                          <div
                            className="flex shrink-0 overflow-hidden rounded-lg border border-gray-300"
                            role="radiogroup"
                            aria-label={p.texto}
                          >
                            {opciones.map((o) => {
                              const activo = v === o;
                              const color =
                                o === 'SI'
                                  ? 'bg-green-600 text-white'
                                  : o === 'NO'
                                    ? 'bg-red-600 text-white'
                                    : 'bg-gray-600 text-white';
                              return (
                                <button
                                  key={o}
                                  role="radio"
                                  aria-checked={activo}
                                  onClick={() => marcar(p.id, o)}
                                  disabled={guardando}
                                  className={`min-w-[52px] px-3 py-1.5 text-xs font-bold transition ${
                                    activo ? color : 'text-gray-600 hover:bg-gray-100'
                                  }`}
                                >
                                  {o}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {v === 'NO' && (
                          <div className="space-y-2 px-3 pb-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              {fotosItem.map((x) => (
                                <span
                                  key={x.timestamp}
                                  className="relative cursor-zoom-in"
                                  onMouseEnter={() => x.url && setVista(x)}
                                  onClick={() => x.url && setVista(x)}
                                >
                                  {x.url ? (
                                    <Thumb url={x.url} size={56} />
                                  ) : (
                                    <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-gray-300 text-[9px] text-gray-500">
                                      sin link
                                    </span>
                                  )}
                                  <button
                                    onClick={() => alternarFoto(p.id, x.timestamp)}
                                    disabled={guardando}
                                    className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white shadow"
                                    aria-label="Quitar esta foto de evidencia"
                                    title="Quitar de la evidencia (la foto queda en la hoja)"
                                  >
                                    <X size={11} />
                                  </button>
                                </span>
                              ))}
                              <button
                                onClick={() => setEligiendo(eligiendo === p.id ? null : p.id)}
                                disabled={guardando}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                              >
                                <ImagePlus size={13} />
                                {eligiendo === p.id
                                  ? 'Listo'
                                  : fotosItem.length
                                    ? 'Cambiar fotos de evidencia'
                                    : 'Elegir foto de evidencia (opcional)'}
                              </button>
                            </div>
                            {eligiendo === p.id && (
                              <div className="rounded-lg border border-gray-200 bg-navy-900 p-2">
                                {disponibles.length ? (
                                  <>
                                    <p className="mb-1.5 text-[11px] text-gray-500">
                                      Fotos de este suministro (sin las casillas del formato). Clic para marcar o
                                      quitar.
                                    </p>
                                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                                      {disponibles.map((d) => {
                                        const de = evid[d.timestamp];
                                        const aqui = de === p.id;
                                        const otro = de !== undefined && !aqui;
                                        return (
                                          <button
                                            key={d.timestamp}
                                            onClick={() => {
                                              alternarFoto(p.id, d.timestamp);
                                              setVista(d);
                                            }}
                                            onMouseEnter={() => setVista(d)}
                                            onFocus={() => setVista(d)}
                                            disabled={guardando}
                                            title={
                                              otro
                                                ? `Hoy es evidencia de «${textoDe(preguntas, de)}»: al marcarla pasa a este ítem`
                                                : d.timestamp
                                            }
                                            className={`relative min-w-0 rounded-lg p-0.5 text-left ${
                                              aqui
                                                ? 'ring-2 ring-red-500'
                                                : otro
                                                  ? 'opacity-60'
                                                  : 'hover:ring-2 hover:ring-gray-300'
                                            }`}
                                          >
                                            <Thumb url={d.url} size={72} />
                                            {aqui && (
                                              <span className="absolute right-1 top-1 rounded-full bg-red-600 p-0.5 text-white">
                                                <Check size={11} />
                                              </span>
                                            )}
                                            <span className="mt-0.5 block truncate text-[9px] text-gray-500">
                                              {otro ? `en: ${textoDe(preguntas, de)}` : horaCorta(d.timestamp)}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </>
                                ) : (
                                  <p className="text-[11px] text-gray-500">
                                    Este suministro no tiene más fotos aparte de las casillas del formato. Una foto
                                    nueva se toma con la app («Foto de evidencia» en el ítem).
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {/* Datos del formulario */}
            {tipo === '1A' ? (
              <section className="grid gap-3 sm:grid-cols-2">
                {campoFecha(fechaSticker, setFechaSticker, 'Fecha del sticker')}
                <label className="block min-w-0 text-xs text-gray-500">
                  Lectura del medidor (kWh)
                  <input
                    value={lectura}
                    onChange={(e) => setLectura(e.target.value.replace(/[^0-9.,]/g, ''))}
                    inputMode="decimal"
                    className={`${ui.input} mt-1 tabular-nums`}
                  />
                </label>
              </section>
            ) : (
              <section className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ['Equipo patrón', patronN, setPatronN, patronF, setPatronF],
                    ['Carga inductiva / resistiva', cargaN, setCargaN, cargaF, setCargaF],
                  ] as const
                ).map(([titulo, n, setN, fe, setF]) => (
                  <div key={titulo} className="space-y-2 rounded-xl border border-gray-200 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{titulo}</p>
                    <label className="block text-xs text-gray-500">
                      N° de certificado
                      <input value={n} onChange={(e) => setN(e.target.value)} className={`${ui.input} mt-1`} />
                    </label>
                    {campoFecha(fe, setF, 'Fecha de calibración')}
                  </div>
                ))}
              </section>
            )}

            {/* Observación */}
            <section>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Observación (va al PDF y al aviso de 24 h)
              </h3>
              {enNo.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {enNo.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700"
                    >
                      ✕ {p.texto}
                    </span>
                  ))}
                </div>
              )}
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={4}
                placeholder={conforme ? 'Opcional si todo está en SI' : 'Obligatoria: qué se observó'}
                className={`${ui.input} resize-y`}
              />
            </section>
          </div>

          {/* Vista grande de la foto (al pasar el mouse o al elegir) */}
          <aside className="hidden w-[400px] shrink-0 flex-col border-l border-gray-200 p-4 lg:flex">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">Vista de la foto</p>
            {vista ? (
              <>
                <FotoGrande url={vista.url} />
                <p className="mt-2 text-xs text-gray-700">
                  {evid[vista.timestamp] !== undefined ? (
                    <b className="text-red-700">Evidencia: {textoDe(preguntas, evid[vista.timestamp])}</b>
                  ) : (
                    <span className="text-gray-500">No es evidencia</span>
                  )}
                </p>
                <p className="text-[11px] text-gray-500">Tomada: {fechaHora(vista.timestamp)}</p>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">
                Pasa el mouse sobre una foto de evidencia para verla aquí en grande.
              </div>
            )}
          </aside>
        </div>

        {/* Pie */}
        <div className="space-y-2 border-t border-gray-200 px-5 py-3">
          {(error || (hayCambios && errores.length > 0)) && (
            <p className="flex items-start gap-2 text-xs text-red-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error || errores[0]}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
                conforme ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {conforme ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {conforme ? 'CONFORME · todo en SI' : `NO CONFORME · ${enNo.length} en NO`}
            </span>
            {!hayCambios && <span className="text-xs text-gray-500">Sin cambios todavía.</span>}
            <span className="ml-auto flex gap-2">
              <button className={ui.btnSecondary} onClick={onCerrar} disabled={guardando}>
                Cancelar
              </button>
              <button
                className={ui.btnPrimary}
                onClick={guardar}
                disabled={guardando || !hayCambios || errores.length > 0}
              >
                {guardando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Guardar corrección
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ fotos de evidencia

const PREFIJO_EVIDENCIA = 'Evidencia · ';
const EVIDENCIA_GENERAL = 'Evidencia de la observación';
const esRolEvidencia = (rol: unknown) => {
  const r = String(rol ?? '').trim();
  return r === EVIDENCIA_GENERAL || r.startsWith(PREFIJO_EVIDENCIA);
};

/** Evidencias actuales del formulario: hora de la foto → id del ítem ('' = evidencia general). */
function evidenciasDe(fotos: { timestamp: string; rol: string }[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const x of fotos ?? []) {
    const r = String(x.rol ?? '').trim();
    const t = String(x.timestamp ?? '').trim();
    if (!t) continue;
    if (r === EVIDENCIA_GENERAL) out[t] = '';
    else if (r.startsWith(PREFIJO_EVIDENCIA)) out[t] = r.slice(PREFIJO_EVIDENCIA.length).trim();
  }
  return out;
}

const textoDe = (preguntas: { id: string; texto: string }[], id: string) =>
  id ? (preguntas.find((p) => p.id === id)?.texto ?? id) : 'observación general';

/** «HH:mm» de «dd/MM/yyyy HH:mm:ss» o de una fecha en texto (Date.toString / ISO). */
function horaCorta(t: string): string {
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(t) && m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime()))
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

/** Foto en grande (misma caché que la galería), sin recortar. */
function FotoGrande({ url }: { url: string }) {
  const [src, setSrc] = useState<{ url: string; data: string | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    loadImageWithCache(url).then((d) => vivo && setSrc({ url, data: d }));
    return () => {
      vivo = false;
    };
  }, [url]);
  const lista = src?.url === url;
  return (
    <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-black">
      {lista && src.data ? (
        <img src={src.data} alt="Foto de evidencia" className="h-full w-full object-contain" />
      ) : lista ? (
        <span className="text-xs text-gray-400">No se pudo cargar la foto</span>
      ) : (
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-500 border-t-electric" />
      )}
    </div>
  );
}

/** «dd/MM/yyyy HH:mm» de «dd/MM/yyyy HH:mm:ss» o de una fecha en texto (Date.toString / ISO). */
function fechaHora(t: string): string {
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(t)) return t.slice(0, 16);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  const z = (n: number) => String(n).padStart(2, '0');
  return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
}
