// Paso 4 de «Entrega semanal»: el ZIP tal como saldrá (carpetas y archivos con su nombre real), las
// opciones del paquete en un solo bloque, la vista previa de cualquier archivo y la barra de descarga.
// Cada PDF de la vista previa se arma con el mismo generador y opciones que el ZIP.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Folder,
  Loader2,
  Maximize2,
  Package,
  RefreshCw,
} from 'lucide-react';
import VistaPdf from '../formatos/VistaPdf';
import { ui } from '../ui';
import { armarArchivo, type ArchivoPaquete, type CarpetaPaquete, type PdfArmado, type Progreso } from './paquete';
import type { OpcionesArmado, Paquete } from './usePaquete';

const fmt = (n: number) => n.toLocaleString('es-PE');
const plural = (n: number, uno: string, varios: string) => `${fmt(n)} ${n === 1 ? uno : varios}`;

/** Firma de las opciones que cambian el PDF de un archivo (para saber si la vista quedó vieja). */
const firma = (a: ArchivoPaquete, o: OpcionesArmado) =>
  a.grupo === 'f4' ? `f4:${o.f4Fotos}` : `fa:${o.fotos}:${o.anexarF4}`;

interface Vista extends PdfArmado {
  clave: string;
  nombre: string;
  firma: string;
}

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
  const { op, setOp } = paq;
  const [vista, setVista] = useState<Vista | null>(null);
  const [armando, setArmando] = useState<{ clave: string; nombre: string; texto: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState(false);
  const pedido = useRef(0);
  const panel = useRef<HTMLDivElement>(null);

  // La URL blob de la vista se libera al cambiarla o al salir de la página
  useEffect(() => {
    if (!vista) return;
    const u = vista.url;
    return () => URL.revokeObjectURL(u);
  }, [vista]);
  useEffect(
    () => () => {
      pedido.current++;
    },
    [],
  );
  const cerrarAmpliada = useCallback(() => setAmpliada(false), []);

  const ver = async (a: ArchivoPaquete) => {
    if (vista?.clave === a.clave && vista.firma === firma(a, op) && !armando) {
      // Ya está a la vista: en pantallas chicas, llevarla a la vista
      panel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const n = ++pedido.current;
    setError(null);
    setArmando({ clave: a.clave, nombre: a.nombre, texto: 'Preparando…' });
    if (window.matchMedia('(max-width: 1023px)').matches)
      panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const r = await armarArchivo(a, hoja, op, (texto) => {
        if (pedido.current === n) setArmando({ clave: a.clave, nombre: a.nombre, texto });
      });
      if (pedido.current !== n) {
        URL.revokeObjectURL(r.url);
        return;
      }
      setVista({ ...r, clave: a.clave, nombre: a.nombre, firma: firma(a, op) });
    } catch (e) {
      if (pedido.current === n) setError(`No se pudo armar «${a.nombre}»: ${(e as Error).message || 'error'}`);
    } finally {
      if (pedido.current === n) setArmando(null);
    }
  };

  const archivoDe = (clave: string) => paq.carpetas.flatMap((c) => c.archivos).find((a) => a.clave === clave);
  const enVista = vista ? archivoDe(vista.clave) : undefined;
  const vieja = !!vista && !!enVista && vista.firma !== firma(enVista, op);
  const activo = armando?.clave ?? vista?.clave;
  const hay1A2A = paq.n1A + paq.n2A > 0;

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------------------- opciones */}
      <fieldset className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-3" disabled={generando}>
        <legend className="px-1 text-sm font-semibold text-gray-900">Opciones del paquete</legend>
        <div className="grid gap-2 md:grid-cols-3">
          <Opcion
            checked={op.fotos}
            disabled={!hay1A2A}
            onChange={(v) => setOp({ fotos: v })}
            titulo="Incluir fotos en 1A / 2A"
            nota={
              hay1A2A
                ? 'Evidencias de los NO y registro adicional. Sin fotos pesan menos.'
                : 'Marca algún 1A o 2A en la lista.'
            }
          />
          <Opcion
            checked={op.anexarF4}
            disabled={!hay1A2A}
            onChange={(v) => setOp({ anexarF4: v })}
            titulo="Anexar el Formato 4 a cada 1A / 2A"
            nota={
              hay1A2A
                ? 'Va dentro del mismo PDF, después de la hoja del formato y con sus fotos (tarda más).'
                : 'Marca algún 1A o 2A en la lista.'
            }
          />
          <div className={`rounded-lg border border-gray-200 bg-white p-2.5 ${paq.n4 ? '' : 'opacity-60'}`}>
            <p className="text-sm font-semibold text-gray-900">Anexos sueltos (Formato_4)</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { v: false, t: 'Sin fotos · rápido' },
                { v: true, t: 'Con fotos · lento' },
              ].map((x) => (
                <label
                  key={x.t}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                    paq.n4 ? 'cursor-pointer' : 'cursor-not-allowed'
                  } ${op.f4Fotos === x.v ? 'border-electric text-gray-900' : 'border-gray-300 text-gray-600'}`}
                >
                  <input
                    type="radio"
                    name="f4fotos"
                    className="accent-blue-600"
                    checked={op.f4Fotos === x.v}
                    disabled={!paq.n4}
                    onChange={() => setOp({ f4Fotos: x.v })}
                  />
                  {x.t}
                </label>
              ))}
            </div>
            {!paq.n4 && <p className="mt-1 text-xs text-gray-500">No hay anexos sueltos marcados.</p>}
          </div>
        </div>
        {paq.provisionales > 0 && (
          <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-gray-900">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-red-500"
              checked={borrador}
              onChange={(e) => setBorrador(e.target.checked)}
            />
            <span>
              <b>Descargar borrador.</b>{' '}
              {plural(paq.provisionales, 'archivo marcado lleva', 'archivos marcados llevan')} número provisional. Sirve
              para revisar, no para entregar: el ZIP termina en «_BORRADOR».
            </span>
          </label>
        )}
      </fieldset>

      {/* -------------------------------------------------------------- árbol + vista */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5">
            <Package size={18} className="shrink-0 text-electric" />
            <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-gray-900" title={zipNombre}>
              {zipNombre}
            </span>
            <span className="shrink-0 text-xs text-gray-500">{plural(paq.total, 'archivo', 'archivos')}</span>
          </div>
          <p className="border-b border-gray-200 px-3 py-1.5 text-xs text-gray-500">
            Marca lo que va en el ZIP. Haz clic en un nombre para ver cómo saldrá.
          </p>
          <div className="max-h-[34rem] overflow-y-auto p-1.5 lg:max-h-[calc(100vh-16rem)]">
            {paq.carpetas.map((c) => (
              <Carpeta
                key={c.grupo}
                c={c}
                paq={paq}
                generando={generando}
                activo={activo}
                armando={armando?.clave}
                onVer={ver}
                nota={
                  c.grupo === 'f4' && c.archivos.length > 0 && hay1A2A && op.anexarF4
                    ? c.archivos.some(paq.incluido)
                      ? { tono: 'aviso', texto: 'Ya van dentro de cada 1A / 2A: así quedan repetidos.' }
                      : {
                          tono: 'info',
                          texto: 'Ya van dentro de cada 1A / 2A. Márcalos solo si también los quieres sueltos.',
                        }
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        <div
          ref={panel}
          className="flex min-h-[28rem] min-w-0 scroll-mt-4 flex-col overflow-hidden rounded-xl border border-gray-200 lg:sticky lg:top-4 lg:self-start lg:h-[calc(100vh-2rem)] lg:max-h-[56rem]"
        >
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
            <Eye size={16} className="shrink-0 text-electric" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-semibold text-gray-900">
                {armando?.nombre ?? vista?.nombre ?? 'Vista previa'}
              </p>
              <p className="truncate text-[11px] text-gray-500">
                {armando
                  ? 'Armando…'
                  : vista
                    ? `Así va en el ZIP${vista.paginas ? ` · ${plural(vista.paginas, 'hoja', 'hojas')}` : ''}${
                        enVista && !paq.incluido(enVista) ? ' · ahora está desmarcado' : ''
                      }`
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
              <button
                type="button"
                onClick={() => setAmpliada(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-electric hover:text-electric"
              >
                <Maximize2 size={13} /> Ampliar
              </button>
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
          <div className="relative flex flex-1 flex-col">
            {armando ? (
              <Armando texto={armando.texto} />
            ) : vista ? (
              <iframe
                title={`Vista previa de ${vista.nombre}`}
                src={`${vista.url}#toolbar=0&navpanes=0&view=FitH`}
                className="h-[70vh] w-full flex-1 bg-[#525659] lg:h-auto"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <FileText size={36} className="text-gray-400" />
                <p className="text-sm font-medium text-gray-700">Haz clic en un archivo de la lista para verlo aquí.</p>
                <p className="max-w-sm text-xs text-gray-500">
                  Se arma con el mismo generador y las opciones de arriba, tal cual irá en el ZIP. No descarga nada.
                </p>
              </div>
            )}
          </div>
        </div>
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
      <p className="text-sm font-semibold text-gray-900">Armando…</p>
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

function Opcion({
  checked,
  disabled,
  onChange,
  titulo,
  nota,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  titulo: string;
  nota: string;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-lg border border-gray-200 bg-white p-2.5 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-electric'
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-900">{titulo}</span>
        <span className="block text-xs text-gray-500">{nota}</span>
      </span>
    </label>
  );
}

function Carpeta({
  c,
  paq,
  generando,
  activo,
  armando,
  onVer,
  nota,
}: {
  c: CarpetaPaquete;
  paq: Paquete;
  generando: boolean;
  activo?: string;
  armando?: string;
  onVer: (a: ArchivoPaquete) => void;
  nota?: { tono: 'aviso' | 'info'; texto: string };
}) {
  const [abierta, setAbierta] = useState(c.archivos.length <= 40);
  const marcados = c.archivos.filter(paq.incluido).length;
  const vacia = c.archivos.length === 0;
  const todos = !vacia && marcados === c.archivos.length;
  const parcial = marcados > 0 && !todos;

  return (
    <div className="mb-1">
      <div className={`flex items-center gap-2 rounded-lg px-1.5 py-1.5 ${vacia ? 'opacity-60' : ''}`}>
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-blue-600"
          ref={(el) => {
            if (el) el.indeterminate = parcial;
          }}
          checked={todos}
          disabled={vacia || generando}
          onChange={() => paq.marcarCarpeta(c.grupo, !todos)}
          aria-label={`Incluir toda la carpeta ${c.ruta}`}
          title={todos ? 'Quitar toda la carpeta' : 'Incluir toda la carpeta'}
        />
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          disabled={vacia}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:cursor-default"
          aria-expanded={abierta}
        >
          {vacia ? (
            <span className="w-[14px]" />
          ) : abierta ? (
            <ChevronDown size={14} className="shrink-0 text-gray-500" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-gray-500" />
          )}
          {abierta && !vacia ? (
            <FolderOpen size={16} className="shrink-0 text-amber-500" />
          ) : (
            <Folder size={16} className="shrink-0 text-amber-500" />
          )}
          <span className="min-w-0">
            <span className="block truncate font-mono text-sm font-semibold text-gray-900" title={c.ruta}>
              {c.ruta}
            </span>
            <span className="block text-xs text-gray-500">{c.titulo}</span>
          </span>
        </button>
        <span className="shrink-0 font-mono text-xs text-gray-500">
          {vacia ? '—' : `${fmt(marcados)}/${fmt(c.archivos.length)}`}
        </span>
      </div>
      {vacia && <p className="ml-12 pb-1 text-xs text-gray-500">{c.vacia}</p>}
      {nota && (
        <p
          className={`ml-12 mb-1 flex items-start gap-1.5 text-xs ${nota.tono === 'aviso' ? 'text-amber-700' : 'text-gray-500'}`}
        >
          {nota.tono === 'aviso' && <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
          {nota.texto}
        </p>
      )}
      {abierta && !vacia && (
        <ul className="ml-5 border-l border-gray-200 pl-2">
          {c.archivos.map((a) => (
            <FilaArchivo
              key={a.clave}
              a={a}
              incluido={paq.incluido(a)}
              disabled={generando}
              activo={activo === a.clave}
              armando={armando === a.clave}
              onMarcar={(v) => paq.marcarArchivo(a, v)}
              onVer={() => onVer(a)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaArchivo({
  a,
  incluido,
  disabled,
  activo,
  armando,
  onMarcar,
  onVer,
}: {
  a: ArchivoPaquete;
  incluido: boolean;
  disabled: boolean;
  activo: boolean;
  armando: boolean;
  onMarcar: (v: boolean) => void;
  onVer: () => void;
}) {
  const datos: ReactNode[] = [];
  if (a.grupo === 'f4') {
    datos.push(`N.º ${a.numero}`);
    if (a.tecnico && a.tecnico !== '-') datos.push(a.tecnico);
  } else if (a.grupo === '1A') {
    datos.push(plural(a.muestras ?? 0, 'muestra', 'muestras'));
  } else {
    datos.push(`Suministro ${a.suministro}`);
  }
  if (a.grupo !== 'f4')
    datos.push(
      a.noConformes ? (
        <span key="nc" className="text-amber-700">
          {a.grupo === '2A' ? 'No conforme' : plural(a.noConformes, 'no conforme', 'no conformes')}
        </span>
      ) : (
        <span key="c" className="text-green-700">
          {a.grupo === '2A' ? 'Conforme' : 'Todas conformes'}
        </span>
      ),
    );
  if (a.provisional)
    datos.push(
      <span key="p" className="font-semibold text-red-700">
        N.º provisional
      </span>,
    );
  if (a.repetido)
    datos.push(
      <span key="r" className="text-amber-700">
        Nombre repetido: en el ZIP queda uno
      </span>,
    );

  return (
    <li
      className={`group flex items-start gap-2 rounded-lg px-1.5 py-1 ${
        activo ? 'bg-gray-100 ring-1 ring-electric' : 'hover:bg-gray-50'
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
        checked={incluido}
        disabled={disabled}
        onChange={(e) => onMarcar(e.target.checked)}
        aria-label={`Incluir ${a.nombre}`}
      />
      <button
        type="button"
        onClick={onVer}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-start gap-1.5 text-left disabled:cursor-not-allowed"
        title={`Ver ${a.nombre}`}
      >
        <FileText size={14} className={`mt-0.5 shrink-0 ${incluido ? 'text-electric' : 'text-gray-400'}`} />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-mono text-sm ${
              incluido ? 'text-gray-900' : 'text-gray-400 line-through'
            } group-hover:text-electric`}
          >
            {a.nombre}
          </span>
          <span className="flex flex-wrap gap-x-1.5 text-[11px] text-gray-500">
            {datos.map((d, k) => (
              <span key={k}>
                {k > 0 && <span className="mr-1.5 text-gray-400">·</span>}
                {d}
              </span>
            ))}
          </span>
        </span>
        {armando ? (
          <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-electric" />
        ) : (
          <Eye size={14} className={`mt-0.5 shrink-0 ${activo ? 'text-electric' : 'text-gray-400'}`} />
        )}
      </button>
    </li>
  );
}

// ------------------------------------------------------------------ barra de descarga

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
  children,
}: {
  paq: Paquete;
  motivos: Motivo[];
  puedeDescargar: boolean;
  generando: boolean;
  progreso: Progreso | null;
  onDescargar: () => void;
  /** Resultado de la última descarga. */
  children?: ReactNode;
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
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
      <p className="text-sm text-gray-700">
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          className={`${ui.btnPrimary} px-6 py-3 text-base`}
          disabled={!puedeDescargar}
          onClick={onDescargar}
        >
          {generando ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          {paq.total ? `Descargar el paquete (${plural(paq.total, 'archivo', 'archivos')})` : 'Descargar el paquete'}
        </button>
        {m && !generando && (
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-amber-700">
            <AlertTriangle size={16} className="shrink-0" />
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
        )}
      </div>
      {progreso && (
        <div role="status" aria-live="polite">
          <div className="mb-1 flex justify-between gap-3 text-sm text-gray-600">
            <span className="truncate font-mono">{progreso.texto}</span>
            <span className="font-mono">{progreso.pct}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-electric transition-all duration-300"
              style={{ width: `${progreso.pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">No cierres ni recargues esta pestaña.</p>
        </div>
      )}
      {children}
    </div>
  );
}
