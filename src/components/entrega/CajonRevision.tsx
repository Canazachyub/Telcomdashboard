// Cajón lateral de «Entrega semanal»: la lista completa de lo que se revisa antes de entregar, con las
// mismas acciones de siempre («Arreglar», «Marcar como avisado», asignar números) y «Entregar igual».
// Se abre desde los chips de la barra superior, con el chequeo elegido desplegado.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck, Hash, Loader2, X } from 'lucide-react';
import { Badge } from '../ui';
import { ItemRevision } from './ItemRevision';
import type { Chequeo, ClaveChequeo, Revision } from './revision';
import { etiquetaReporte, type SupervisadaApp } from '../../services/formatosService';

const btnArreglar =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-50';
const fmt = (n: number) => n.toLocaleString('es-PE');
const plural = (n: number, uno: string, varios: string) => `${fmt(n)} ${n === 1 ? uno : varios}`;

export interface Respuesta {
  ok: boolean;
  texto: string;
}

export function CajonRevision({
  foco,
  onCerrar,
  checks,
  rev,
  conDatos,
  hayFormularios,
  planSinServidor,
  supervisados,
  avisos,
  entregarIgual,
  setEntregarIgual,
  enfocarEntregarIgual,
  ocupado,
  respuestas,
  onAvisar,
  onAsignar,
  bloques,
  coincidentes,
  irA,
  aFormatos,
}: {
  /** Chequeo que se abrió desde su chip (o null: el panel completo). */
  foco: ClaveChequeo | null;
  onCerrar: () => void;
  checks: Chequeo[];
  rev: Revision;
  conDatos: boolean;
  hayFormularios: boolean;
  planSinServidor: boolean;
  supervisados: number;
  avisos: number;
  entregarIgual: boolean;
  setEntregarIgual: (v: boolean) => void;
  /** Abrir con el foco en «Entregar igual». */
  enfocarEntregarIgual?: boolean;
  ocupado: string | null;
  respuestas: Record<string, Respuesta>;
  onAvisar: (s: SupervisadaApp) => void;
  onAsignar: () => void;
  bloques: [string, SupervisadaApp[]][];
  coincidentes: SupervisadaApp[];
  irA: (ruta: string) => void;
  aFormatos: (s?: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const est = (c: ClaveChequeo) => checks.find((i) => i.clave === c)!.estado;
  const tit = (c: ClaveChequeo) => checks.find((i) => i.clave === c)!.titulo;

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCerrar]);

  useEffect(() => {
    if (enfocarEntregarIgual) {
      const el = document.getElementById('entregar-igual');
      el?.scrollIntoView({ block: 'center' });
      el?.focus({ preventScroll: true });
    } else if (foco) {
      document.getElementById(`rev-${foco}`)?.scrollIntoView({ block: 'start' });
      panel.current?.focus({ preventScroll: true });
    } else panel.current?.focus({ preventScroll: true });
  }, [foco, enfocarEntregarIgual]);

  const item = (c: ClaveChequeo) => ({
    id: `rev-${c}`,
    estado: est(c),
    titulo: tit(c),
    resaltado: foco === c,
  });

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex justify-end bg-black/60 backdrop-blur-sm" onClick={onCerrar}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cajon-revision"
        className="flex h-full w-full max-w-2xl flex-col border-l border-gray-200 bg-navy-900 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <ClipboardCheck size={20} className="shrink-0 text-electric" />
          <div className="min-w-0 flex-1">
            <h2 id="cajon-revision" className="font-semibold text-gray-900">
              Revisión antes de entregar
            </h2>
            <p className="text-xs text-gray-500">
              Verde: listo · Ámbar: conviene arreglarlo · Rojo: impide la entrega final · Esc para cerrar
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-2">
            <ItemRevision
              {...item('programados')}
              abiertoInicial={foco === 'programados'}
              resumen={
                !conDatos ? (
                  'Se revisa cuando lleguen los formularios del servidor.'
                ) : !rev.programados ? (
                  'La semana no tiene suministros programados.'
                ) : (
                  <>
                    {fmt(rev.programados - rev.faltanSupervisar.length)} de {fmt(rev.programados)} tienen su formulario
                    1A o 2A
                    {rev.faltanSupervisar.length
                      ? ` · ${rev.faltanSupervisar.length === 1 ? 'falta' : 'faltan'} ${fmt(rev.faltanSupervisar.length)}`
                      : ''}
                    {!rev.planDisponible &&
                      (planSinServidor
                        ? ' (según los suministros de la hoja: el servidor aún no envía la programación)'
                        : ' (según los suministros de la hoja)')}
                  </>
                )
              }
              accion={
                conDatos &&
                rev.faltanSupervisar.length > 0 && (
                  <button type="button" className={btnArreglar} onClick={() => irA('/mapa')}>
                    Arreglar
                  </button>
                )
              }
              detalle={
                conDatos &&
                rev.faltanSupervisar.length > 0 && (
                  <>
                    <p className="mb-2 text-sm text-gray-600">
                      Falta que el técnico los supervise y envíe el formulario desde la app. Si alguno no tiene técnico,
                      asígnalo en el <b>Mapa</b>.
                    </p>
                    <Chips lista={rev.faltanSupervisar} />
                  </>
                )
              }
            />

            <ItemRevision
              {...item('fotos')}
              abiertoInicial={foco === 'fotos'}
              resumen={
                !hayFormularios ? (
                  'Sin formularios todavía.'
                ) : (
                  <>
                    Fotos mínimas: panorámica, medidor y caja (2A: también ensayo).{' '}
                    {rev.sinFotos.length || rev.sinLectura.length
                      ? [
                          rev.sinFotos.length
                            ? `${plural(rev.sinFotos.length, 'formulario con', 'formularios con')} fotos faltantes`
                            : '',
                          rev.sinLectura.length ? `${fmt(rev.sinLectura.length)} sin lectura en la hoja` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : 'Todas completas.'}
                  </>
                )
              }
              accion={
                (rev.sinFotos.length > 0 || rev.sinLectura.length > 0) && (
                  <button
                    type="button"
                    className={btnArreglar}
                    onClick={() => aFormatos((rev.sinFotos[0]?.s ?? rev.sinLectura[0]).punto.suministro)}
                  >
                    Arreglar
                  </button>
                )
              }
              detalle={
                (rev.sinFotos.length > 0 || rev.sinLectura.length > 0) && (
                  <ul className="divide-y divide-gray-200 text-sm">
                    {rev.sinFotos.map(({ s, faltan }) => (
                      <FilaSuministro key={`f-${s.id}`} s={s} onAbrir={() => aFormatos(s.punto.suministro)}>
                        Falta: {faltan.join(', ')}
                      </FilaSuministro>
                    ))}
                    {rev.sinLectura.map((s) => (
                      <FilaSuministro key={`l-${s.id}`} s={s} onAbrir={() => aFormatos(s.punto.suministro)}>
                        Sin lectura en la hoja: no sale en el Formato 4
                      </FilaSuministro>
                    ))}
                  </ul>
                )
              }
            />

            <ItemRevision
              {...item('avisos')}
              key={`avisos-${rev.porAvisar.length > 0}`}
              abiertoInicial={rev.porAvisar.length > 0}
              resumen={
                !rev.noConformes.length
                  ? 'No hay supervisiones no conformes.'
                  : rev.porAvisar.length
                    ? `${fmt(rev.porAvisar.length)} de ${fmt(rev.noConformes.length)} no conformes sin avisar.`
                    : `Los ${fmt(rev.noConformes.length)} no conformes ya están avisados.`
              }
              detalle={
                rev.porAvisar.length > 0 && (
                  <ul className="divide-y divide-gray-200 text-sm">
                    {rev.porAvisar.map((s) => {
                      const clave = `avisado-${s.id}`;
                      const r = respuestas[clave];
                      return (
                        <FilaSuministro key={clave} s={s} onAbrir={() => aFormatos(s.punto.suministro)}>
                          <span className="block truncate" title={s.observacion}>
                            {s.observacion || 'Sin observación escrita'}
                          </span>
                          {r && <span className={r.ok ? 'text-green-700' : 'text-red-700'}>{r.texto}</span>}
                          <button
                            type="button"
                            className={`${btnArreglar} mt-1`}
                            disabled={ocupado !== null}
                            onClick={() => onAvisar(s)}
                          >
                            {ocupado === clave ? <Loader2 size={14} className="animate-spin" /> : null}
                            Marcar como avisado
                          </button>
                        </FilaSuministro>
                      );
                    })}
                  </ul>
                )
              }
            />

            <ItemRevision
              {...item('coincidentes')}
              resumen={
                !hayFormularios
                  ? 'Sin formularios todavía.'
                  : `${plural(rev.coincidentes, 'coincidente', 'coincidentes')} (2A) de ${fmt(
                      supervisados,
                    )} supervisados · se necesitan al menos ${fmt(rev.metaCoincidentes)}.`
              }
              accion={
                <button type="button" className={btnArreglar} onClick={() => irA('/formatos#coincidentes')}>
                  Planificar
                </button>
              }
            />

            <ItemRevision
              {...item('numeros')}
              abiertoInicial={foco === 'numeros'}
              resumen={
                !hayFormularios
                  ? 'Sin formularios para numerar.'
                  : rev.provisionales.length
                    ? `${plural(rev.provisionales.length, 'formulario tiene', 'formularios tienen')} número provisional. Esto sí impide la entrega final.`
                    : 'Todos los formularios tienen número fijo.'
              }
              accion={
                rev.provisionales.length > 0 && (
                  <button
                    type="button"
                    className={btnArreglar}
                    disabled={ocupado !== null || !conDatos}
                    onClick={onAsignar}
                  >
                    {ocupado === 'numeros' ? <Loader2 size={14} className="animate-spin" /> : <Hash size={14} />}
                    Asignar números ({fmt(rev.provisionales.length)})
                  </button>
                )
              }
              detalle={
                hayFormularios && (
                  <>
                    {respuestas.numeros && (
                      <p className={`mb-2 text-sm ${respuestas.numeros.ok ? 'text-green-700' : 'text-red-700'}`}>
                        {respuestas.numeros.texto}
                      </p>
                    )}
                    <p className="mb-2 text-sm text-gray-600">
                      Los reportes SP (1A, de 10 en 10) y SC (2A, uno por suministro) llevan un número fijo del año.
                    </p>
                    <ListaNumeros bloques={bloques} coincidentes={coincidentes} />
                  </>
                )
              }
            />
          </ul>
        </div>

        {avisos > 0 && (
          <div className="border-t border-gray-200 bg-navy-900 p-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-gray-900">
              <input
                id="entregar-igual"
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500"
                checked={entregarIgual}
                onChange={(e) => setEntregarIgual(e.target.checked)}
              />
              <span>
                <b>Entregar igual.</b> Revisé {avisos === 1 ? 'el punto ámbar' : `los ${fmt(avisos)} puntos ámbar`} y
                entrego así, sabiendo lo que falta.
                {est('numeros') === 'bloquea' && (
                  <span className="mt-1 block text-xs text-red-700">
                    Los números provisionales (rojo) no se saltan con esto: hay que asignarlos o bajar un borrador.
                  </span>
                )}
              </span>
            </label>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Chips({ lista }: { lista: string[] }) {
  return (
    <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
      {lista.map((x) => (
        <span
          key={x}
          className="rounded-md border border-gray-200 bg-white px-2 py-0.5 font-mono text-xs text-gray-700"
        >
          {x}
        </span>
      ))}
    </div>
  );
}

function FilaSuministro({ s, onAbrir, children }: { s: SupervisadaApp; onAbrir: () => void; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-start gap-3 py-2">
      <Badge tone={s.tipo === '1A' ? 'blue' : 'amber'}>{s.tipo}</Badge>
      <button
        type="button"
        onClick={onAbrir}
        className="font-mono font-semibold text-gray-900 underline-offset-2 hover:text-electric hover:underline"
        title="Abrir en Formatos"
      >
        {s.punto.suministro}
      </button>
      <span className="text-gray-500">{s.tecnico}</span>
      <div className="flex min-w-[12rem] flex-1 flex-col items-start gap-1 text-gray-700">{children}</div>
    </li>
  );
}

function ListaNumeros({
  bloques,
  coincidentes,
}: {
  bloques: [string, SupervisadaApp[]][];
  coincidentes: SupervisadaApp[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-gray-200 p-3">
        <p className="mb-2 text-sm font-semibold text-gray-900">Formato 1A · reportes SP</p>
        {bloques.length ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {bloques.map(([num, b]) => (
              <li key={num} className="flex items-center justify-between gap-2">
                <span className="font-mono text-gray-900">
                  {etiquetaReporte({ reporte: num, provisional: b[0]?.provisional })}
                </span>
                <span className="text-gray-500">{plural(b.length, 'muestra', 'muestras')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Sin formularios 1A.</p>
        )}
      </div>
      <div className="rounded-xl border border-gray-200 p-3">
        <p className="mb-2 text-sm font-semibold text-gray-900">Formato 2A · reportes SC</p>
        {coincidentes.length ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {coincidentes.map((s) => (
              <li key={s.id || s.punto.suministro} className="flex items-center justify-between gap-2">
                <span className="font-mono text-gray-900">{etiquetaReporte(s)}</span>
                <span className="font-mono text-gray-500">{s.punto.suministro}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Sin formularios 2A.</p>
        )}
      </div>
    </div>
  );
}
