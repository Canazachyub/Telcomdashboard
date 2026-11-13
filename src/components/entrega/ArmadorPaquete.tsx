// Armador del paquete de «Entrega semanal»: opciones en una barra de interruptores, el árbol del ZIP a
// la izquierda y la vista previa grande a la derecha (a la altura de la ventana), más la barra de
// descarga fija abajo. Cada PDF de la vista previa sale del mismo generador y opciones que el ZIP.
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Download, Eye, FileText, Loader2, Maximize2, RefreshCw, X } from 'lucide-react';
import VistaPdf from '../formatos/VistaPdf';
import { ui } from '../ui';
import { ArbolPaquete } from './ArbolPaquete';
import { firmaDe, usePrevias } from './usePrevias';
import type { ArchivoPaquete, CarpetaPaquete, Progreso } from './paquete';
import type { OpcionesArmado, Paquete } from './usePaquete';

const fmt = (n: number) => n.toLocaleString('es-PE');
const plural = (n: number, uno: string, varios: string) => `${fmt(n)} ${n === 1 ? uno : varios}`;

// ------------------------------------------------------------------ armador (opciones + árbol + vista)

export function ArmadorPaquete({
  hoja,
  paq,
  zipNombre,
  generando,
  borrador,
  setBorrador,
}: {
  hoja: string;
  paq: Paquete;
  zipNombre: string;
  generando: boolean;
  borrador: boolean;
  setBorrador: (v: boolean) => void;
}) {
  const { op } = paq;
  const pv = usePrevias(hoja, op);
  const [ampliada, setAmpliada] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const cerrarAmpliada = useCallback(() => setAmpliada(false), []);
  const hay1A2A = paq.n1A + paq.n2A > 0;

  // Al cambiar una opción se sueltan las vistas que ya no corresponden
  const cambiarOp = (o: Partial<OpcionesArmado>) => {
    paq.setOp(o);
    pv.purgar({ ...op, ...o });
  };

  const ver = (a: ArchivoPaquete) => {
    if (window.matchMedia('(max-width: 1023px)').matches)
      panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void pv.ver(a);
  };

  const marcarTodo = () => {
    // Con el Formato 4 anexado, los anexos sueltos quedarían repetidos: esos no se marcan
    for (const c of paq.carpetas)
      if (c.archivos.length && !(c.grupo === 'f4' && op.anexarF4 && hay1A2A)) paq.marcarCarpeta(c.grupo, true);
  };

  const notaCarpeta = (c: CarpetaPaquete) =>
    c.grupo === 'f4' && c.archivos.length > 0 && hay1A2A && op.anexarF4
      ? c.archivos.some(paq.incluido)
        ? { tono: 'aviso' as const, texto: 'Ya van dentro de cada 1A / 2A: así quedan repetidos.' }
        : {
            tono: 'info' as const,
            texto: 'Ya van dentro de cada 1A / 2A. Márcalos solo si también los quieres sueltos.',
          }
      : undefined;

  const { vista, armando, error } = pv;
  const archivoDe = (clave: string) => paq.carpetas.flatMap((c) => c.archivos).find((a) => a.clave === clave);
  const enVista = vista ? archivoDe(vista.clave) : undefined;
  const vieja = !!vista && !!enVista && vista.firma !== firmaDe(enVista.grupo, op);

  return (
    <div className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:flex-1">
      <BarraOpciones
        paq={paq}
        hay1A2A={hay1A2A}
        generando={generando}
        cambiarOp={cambiarOp}
        borrador={borrador}
        setBorrador={setBorrador}
      />

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[minmax(0,1fr)]">
        <ArbolPaquete
          paq={paq}
          zipNombre={zipNombre}
          generando={generando}
          activo={armando?.clave ?? vista?.clave}
          armando={armando?.clave}
          tieneCache={pv.tieneCache}
          onVer={ver}
          notaCarpeta={notaCarpeta}
          onMarcarTodo={marcarTodo}
        />

        <section
          ref={panel}
          aria-label="Vista previa"
          className="flex h-[80vh] min-h-[24rem] min-w-0 scroll-mt-4 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white lg:h-auto lg:min-h-0"
        >
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
            <Eye size={16} className="shrink-0 text-electric" />
            <div className="min-w-0 flex-1">
              <p
                className="truncate font-mono text-sm font-semibold text-gray-900"
                title={armando?.nombre ?? vista?.nombre}
              >
                {armando?.nombre ?? vista?.nombre ?? 'Vista previa'}
              </p>
              <p className="truncate text-[11px] text-gray-500">
                {armando
                  ? 'Armando…'
                  : vista
                    ? [
                        vista.paginas ? plural(vista.paginas, 'hoja', 'hojas') : '',
                        vista.horizontal ? 'horizontal' : '',
                        vieja ? 'con las opciones de antes' : 'así va en el ZIP',
                        enVista && !paq.incluido(enVista) ? 'ahora está desmarcado' : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Nada abierto'}
              </p>
            </div>
            {vista && !armando && vieja && enVista && (
              <button
                type="button"
                onClick={() => ver(enVista)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:border-electric"
                title="Cambiaste las opciones: esta vista ya no es la que irá en el ZIP"
              >
                <RefreshCw size={13} /> Volver a armar
              </button>
            )}
            {vista && !armando && (
              <>
                {vieja ? (
                  <span
                    className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-400"
                    title="Esta vista es de antes de cambiar las opciones: vuelve a armarla para descargarla"
                  >
                    <Download size={13} /> Descargar este PDF
                  </span>
                ) : (
                  <a
                    href={vista.url}
                    download={vista.nombre}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-electric hover:text-electric"
                    title="Baja solo este PDF, tal como irá en el ZIP"
                  >
                    <Download size={13} /> <span className="hidden sm:inline">Descargar este PDF</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setAmpliada(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-electric hover:text-electric"
                >
                  <Maximize2 size={13} /> Ampliar
                </button>
              </>
            )}
          </div>
          {vieja && !armando && (
            <p className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              Cambiaste las opciones: esta vista es de antes. «Volver a armar» la actualiza.
            </p>
          )}
          {error && (
            <p role="alert" className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800">
              {error}
            </p>
          )}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {armando ? (
              <Armando texto={armando.texto} />
            ) : vista ? (
              <iframe
                key={vista.url}
                title={`Vista previa de ${vista.nombre}`}
                src={`${vista.url}#toolbar=0&navpanes=0&view=FitH`}
                className="min-h-0 w-full flex-1 bg-[#525659]"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <FileText size={40} className="text-gray-400" />
                <p className="text-sm font-medium text-gray-700">Elige un archivo de la lista para verlo aquí.</p>
                <p className="max-w-sm text-xs text-gray-500">
                  Clic en el nombre, o <b>Enter</b> sobre la fila. Se arma con el mismo generador y las opciones de
                  arriba, tal cual irá en el ZIP. No descarga nada.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {ampliada && vista && (
        <VistaPdf
          vista={{ url: vista.url, nombre: vista.nombre, horizontal: vista.horizontal, paginas: vista.paginas }}
          onCerrar={cerrarAmpliada}
        />
      )}
    </div>
  );
}

function Armando({ texto }: { texto: string }) {
  // «(3/10)» en el texto de avance → barra con porcentaje; si no, barra indeterminada
  const m = texto.match(/\((\d+)\/(\d+)\)/);
  const pct = m ? Math.round((Number(m[1]) / Math.max(1, Number(m[2]))) * 100) : null;
  return (
    <div role="status" aria-live="polite" className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
      <Loader2 size={28} className="animate-spin text-electric" />
      <p className="text-sm font-semibold text-gray-900">Armando la vista previa…</p>
      <p className="max-w-full truncate font-mono text-xs text-gray-600">{texto}</p>
      <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full bg-electric transition-all duration-300 ${pct == null ? 'animate-pulse' : ''}`}
          style={{ width: `${pct ?? 100}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">Con fotos puede tardar unos segundos por suministro.</p>
    </div>
  );
}

// ------------------------------------------------------------------ opciones del paquete

function BarraOpciones({
  paq,
  hay1A2A,
  generando,
  cambiarOp,
  borrador,
  setBorrador,
}: {
  paq: Paquete;
  hay1A2A: boolean;
  generando: boolean;
  cambiarOp: (o: Partial<OpcionesArmado>) => void;
  borrador: boolean;
  setBorrador: (v: boolean) => void;
}) {
  const { op } = paq;
  const sin1A2A = 'Marca algún 1A o 2A en la lista.';
  return (
    <div
      role="group"
      aria-label="Opciones del paquete"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2"
    >
      <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Opciones</span>
      <Interruptor
        on={op.fotos}
        disabled={!hay1A2A || generando}
        onChange={(v) => cambiarOp({ fotos: v })}
        texto="Fotos en 1A / 2A"
        nota={hay1A2A ? 'Evidencias de los NO y registro fotográfico adicional. Sin fotos pesan menos.' : sin1A2A}
      />
      <Interruptor
        on={op.anexarF4}
        disabled={!hay1A2A || generando}
        onChange={(v) => cambiarOp({ anexarF4: v })}
        texto="Formato 4 dentro de cada 1A / 2A"
        nota={
          hay1A2A
            ? 'Va en el mismo PDF, después de la hoja del formato y con sus fotos (tarda más). Los anexos sueltos se quitan para no repetirlos.'
            : sin1A2A
        }
      />
      <div
        className={`inline-flex items-center gap-1 rounded-full border border-gray-300 p-0.5 pl-2.5 text-xs ${
          paq.n4 ? '' : 'opacity-50'
        }`}
        title={paq.n4 ? 'Formato 4 de la carpeta Formato_4 (anexos sueltos)' : 'No hay anexos sueltos marcados.'}
      >
        <span className="font-semibold text-gray-700">Anexos sueltos</span>
        {[
          { v: false, t: 'Sin fotos · rápido' },
          { v: true, t: 'Con fotos · lento' },
        ].map((x) => (
          <button
            key={x.t}
            type="button"
            aria-pressed={op.f4Fotos === x.v}
            disabled={!paq.n4 || generando}
            onClick={() => cambiarOp({ f4Fotos: x.v })}
            className={`rounded-full px-2.5 py-1 font-medium transition disabled:cursor-not-allowed ${
              op.f4Fotos === x.v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-electric'
            }`}
          >
            {x.t}
          </button>
        ))}
      </div>
      {paq.provisionales > 0 && (
        <Interruptor
          on={borrador}
          peligro
          disabled={generando}
          onChange={setBorrador}
          texto={`Bajar como borrador (${fmt(paq.provisionales)} provisional${paq.provisionales === 1 ? '' : 'es'})`}
          nota="Hay archivos marcados con número provisional. El borrador sirve para revisar, no para entregar: el ZIP termina en «_BORRADOR»."
        />
      )}
    </div>
  );
}

function Interruptor({
  on,
  disabled,
  onChange,
  texto,
  nota,
  peligro,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  texto: string;
  nota: string;
  peligro?: boolean;
}) {
  const color = peligro
    ? on
      ? 'border-red-700 bg-red-50 text-gray-900'
      : 'border-red-200 text-red-800 hover:border-red-700'
    : on
      ? 'border-electric bg-blue-50 text-gray-900'
      : 'border-gray-300 text-gray-600 hover:border-electric';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      title={nota}
      className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric disabled:cursor-not-allowed disabled:opacity-50 ${color}`}
    >
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition ${
          on ? (peligro ? 'bg-red-600' : 'bg-blue-600') : 'bg-gray-300'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-gray-900 transition-all ${on ? 'left-3.5' : 'left-0.5'}`}
        />
      </span>
      {texto}
    </button>
  );
}

// ------------------------------------------------------------------ barra de descarga (fija abajo)

export interface Motivo {
  texto: ReactNode;
  acciones?: { texto: string; onClick: () => void }[];
}

export function BarraDescarga({
  paq,
  motivos,
  puedeDescargar,
  generando,
  progreso,
  onDescargar,
  resultado,
  onCerrarResultado,
}: {
  paq: Paquete;
  motivos: Motivo[];
  puedeDescargar: boolean;
  generando: boolean;
  progreso: Progreso | null;
  onDescargar: () => void;
  /** Resultado de la última descarga. */
  resultado?: { ok: boolean; texto: string } | null;
  onCerrarResultado?: () => void;
}) {
  const { op } = paq;
  const partes = [
    paq.n4 ? `${fmt(paq.n4)} Formato 4` : '',
    paq.n1A ? `${fmt(paq.n1A)} SP (1A)` : '',
    paq.n2A ? `${fmt(paq.n2A)} SC (2A)` : '',
  ].filter(Boolean);
  const extras = [
    paq.n1A + paq.n2A ? `1A/2A ${op.fotos ? 'con fotos' : 'sin fotos'}` : '',
    paq.n1A + paq.n2A && op.anexarF4 ? 'con el Formato 4 anexado' : '',
    paq.n4 ? `anexos sueltos ${op.f4Fotos ? 'con fotos' : 'sin fotos'}` : '',
  ].filter(Boolean);
  const m = motivos[0];

  return (
    <div className="z-[900] overflow-hidden rounded-2xl border border-gray-200 bg-navy-900 shadow-[0_-10px_30px_rgb(0_0_0/0.45)] max-lg:fixed max-lg:inset-x-2 max-lg:bottom-2">
      {progreso && (
        <div className="h-1.5 w-full bg-gray-100" aria-hidden>
          <div className="h-full bg-electric transition-all duration-300" style={{ width: `${progreso.pct}%` }} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4">
        <div className="min-w-[14rem] flex-1 space-y-0.5">
          {progreso ? (
            <p role="status" aria-live="polite" className="flex min-w-0 items-center gap-2 text-sm text-gray-700">
              <Loader2 size={15} className="shrink-0 animate-spin text-electric" />
              <span className="min-w-0 truncate font-mono">{progreso.texto}</span>
              <b className="shrink-0 font-mono text-gray-900">{progreso.pct}%</b>
              <span className="hidden shrink-0 text-xs text-gray-500 xl:inline">
                · No cierres ni recargues la pestaña
              </span>
            </p>
          ) : (
            <p className="truncate text-sm text-gray-700" title={[partes.join(', '), ...extras].join(' · ')}>
              {paq.total ? (
                <>
                  El ZIP llevará <b className="text-gray-900">{plural(paq.total, 'archivo', 'archivos')}</b>:{' '}
                  {partes.join(', ')}
                  {extras.length > 0 && <span className="text-gray-500"> · {extras.join(' · ')}</span>}
                </>
              ) : (
                'El ZIP todavía no lleva ningún archivo.'
              )}
            </p>
          )}
          {m && !generando ? (
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-amber-700" role="alert">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{m.texto}</span>
              {m.acciones?.map((x) => (
                <button
                  key={x.texto}
                  type="button"
                  onClick={x.onClick}
                  className="font-semibold text-electric underline-offset-2 hover:underline"
                >
                  {x.texto}
                </button>
              ))}
              {motivos.length > 1 && (
                <span className="text-gray-500">(y {plural(motivos.length - 1, 'cosa', 'cosas')} más)</span>
              )}
            </p>
          ) : (
            resultado &&
            !generando && (
              <p
                role="status"
                className={`flex min-w-0 items-start gap-1.5 text-sm ${resultado.ok ? 'text-green-700' : 'text-red-700'}`}
              >
                {resultado.ok ? (
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                )}
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{resultado.texto}</span>
                {onCerrarResultado && (
                  <button
                    type="button"
                    onClick={onCerrarResultado}
                    className="shrink-0 rounded p-0.5 text-gray-500 hover:text-gray-900"
                    aria-label="Cerrar el mensaje"
                  >
                    <X size={14} />
                  </button>
                )}
              </p>
            )
          )}
        </div>
        <button
          type="button"
          className={`${ui.btnPrimary} shrink-0 px-6 py-3 text-base`}
          disabled={!puedeDescargar}
          onClick={onDescargar}
          title={m && !generando && typeof m.texto === 'string' ? m.texto : undefined}
        >
          {generando ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          {generando
            ? 'Armando el ZIP…'
            : paq.total
              ? `Descargar el paquete (${fmt(paq.total)})`
              : 'Descargar el paquete'}
        </button>
      </div>
    </div>
  );
}
