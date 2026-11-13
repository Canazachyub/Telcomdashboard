// Corregir las respuestas de un formulario 1A / 2A desde el escritorio, con las mismas reglas que la
// app: SI / NO por ítem (N.A. solo donde la app lo permite), conforme = ninguna en NO, la observación
// se llena sola con «No cumple: …» y es obligatoria si hay algún NO, certificados con N° y fecha.
// Guarda con «editarFormato» (admin / supervisor); la hoja registra quién y cuándo (columna BB).
// No toca fotos, número SP / SC ni el aviso.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Loader2, PencilLine, X } from 'lucide-react';
import { ui } from '../ui';
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
    };
  }, [f, preguntas]);

  const [resp, setResp] = useState(inicial.resp);
  const [obs, setObs] = useState(inicial.observacion);
  const [fechaSticker, setFechaSticker] = useState(inicial.fechaSticker);
  const [lectura, setLectura] = useState(inicial.lectura);
  const [patronN, setPatronN] = useState(inicial.patronN);
  const [patronF, setPatronF] = useState(inicial.patronF);
  const [cargaN, setCargaN] = useState(inicial.cargaN);
  const [cargaF, setCargaF] = useState(inicial.cargaF);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const enNo = preguntas.filter((p) => resp[p.id] === 'NO');
  const conforme = enNo.length === 0;

  const marcar = (id: string, v: RespApp) => {
    const nuevo = { ...resp, [id]: v };
    setResp(nuevo);
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
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-navy-900 shadow-2xl"
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
              corrigió y cuándo. Las fotos no se tocan.
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
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {bloquesDe(tipo).map((b) => (
            <section key={b.titulo}>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">{b.titulo}</h3>
              <div className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200">
                {b.preguntas.map((p) => {
                  const v = resp[p.id];
                  const cambio = v !== inicial.resp[p.id];
                  const opciones: RespApp[] = p.conNA ? ['SI', 'NO', 'N.A.'] : ['SI', 'NO'];
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2 ${v === 'NO' ? 'bg-red-50' : ''}`}
                    >
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
