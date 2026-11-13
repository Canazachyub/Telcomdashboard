// Árbol del ZIP en el armador: carpetas y archivos con su nombre real, buscador, «Marcar todo / Quitar
// todo» y teclado (↑/↓ recorre, Espacio marca o desmarca, Enter muestra la vista previa).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Package,
  Search,
  Square,
  X,
  Zap,
} from 'lucide-react';
import type { ArchivoPaquete, CarpetaPaquete, GrupoPaquete } from './paquete';
import type { Paquete } from './usePaquete';

const fmt = (n: number) => n.toLocaleString('es-PE');
const plural = (n: number, uno: string, varios: string) => `${fmt(n)} ${n === 1 ? uno : varios}`;

const btnMini =
  'inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 transition hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-50';

/** Texto en el que busca el buscador: nombre, suministro, técnico, N.º de anexo y suministros del SP. */
const buscable = (a: ArchivoPaquete) =>
  [
    a.nombre,
    a.suministro,
    a.tecnico,
    a.numero != null ? `n.º ${a.numero}` : '',
    ...(a.bloque?.map((s) => `${s.punto.suministro} ${s.tecnico ?? ''}`) ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export function ArbolPaquete({
  paq,
  zipNombre,
  generando,
  activo,
  armando,
  tieneCache,
  onVer,
  notaCarpeta,
  onMarcarTodo,
}: {
  paq: Paquete;
  zipNombre: string;
  generando: boolean;
  /** Archivo a la vista (o armándose). */
  activo?: string;
  /** Archivo que se está armando. */
  armando?: string;
  tieneCache: (a: ArchivoPaquete) => boolean;
  onVer: (a: ArchivoPaquete) => void;
  notaCarpeta: (c: CarpetaPaquete) => { tono: 'aviso' | 'info'; texto: string } | undefined;
  /** «Marcar todo» sin buscador (respeta el Formato 4 anexado). */
  onMarcarTodo: () => void;
}) {
  const [q, setQ] = useState('');
  const [cerradas, setCerradas] = useState<Set<GrupoPaquete>>(() => new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [enfocado, setEnfocado] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const buscador = useRef<HTMLInputElement>(null);

  const qn = q.trim().toLowerCase();
  const todos = useMemo(() => paq.carpetas.flatMap((c) => c.archivos), [paq.carpetas]);
  const ids = useMemo(() => new Map(todos.map((a, i) => [a.clave, `arch-${i}`])), [todos]);
  const textos = useMemo(() => new Map(todos.map((a) => [a.clave, buscable(a)])), [todos]);
  const coincide = (a: ArchivoPaquete) => !qn || textos.get(a.clave)!.includes(qn);
  const vistas = paq.carpetas.map((c) => ({ c, archivos: c.archivos.filter(coincide) }));
  const abierta = (g: GrupoPaquete) => !!qn || !cerradas.has(g);
  /** Archivos que se ven, en orden: los que recorre el teclado. */
  const planos = vistas.flatMap((v) => (abierta(v.c.grupo) ? v.archivos : []));
  const encontrados = vistas.flatMap((v) => v.archivos);
  const actual = planos.find((a) => a.clave === cursor);
  const marcados = todos.filter(paq.incluido).length;

  useEffect(() => {
    if (cursor) document.getElementById(ids.get(cursor) ?? '')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, ids]);

  const mover = (d: number | 'ini' | 'fin') => {
    if (!planos.length) return;
    const i = planos.findIndex((a) => a.clave === cursor);
    const n =
      d === 'ini'
        ? 0
        : d === 'fin'
          ? planos.length - 1
          : i < 0
            ? d > 0
              ? 0
              : planos.length - 1
            : Math.min(planos.length - 1, Math.max(0, i + d));
    setCursor(planos[n].clave);
  };

  const onTecla = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'ArrowDown':
        mover(1);
        break;
      case 'ArrowUp':
        mover(-1);
        break;
      case 'PageDown':
        mover(10);
        break;
      case 'PageUp':
        mover(-10);
        break;
      case 'Home':
        mover('ini');
        break;
      case 'End':
        mover('fin');
        break;
      case ' ':
        if (!actual) mover(1);
        else if (!generando) paq.marcarArchivo(actual, !paq.incluido(actual));
        break;
      case 'Enter':
        if (!actual) mover(1);
        else if (!generando) onVer(actual);
        break;
      case '/':
        buscador.current?.focus();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const marcarTodo = (v: boolean) => {
    if (qn) paq.marcarVarios(encontrados, v);
    else if (v) onMarcarTodo();
    else paq.carpetas.forEach((c) => c.archivos.length && paq.marcarCarpeta(c.grupo, false));
  };

  const alternarCarpeta = (g: GrupoPaquete) =>
    setCerradas((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  // Clic en una fila: el foco queda en la lista (para seguir con el teclado)
  const tomarFoco = (e: MouseEvent) => {
    e.preventDefault();
    lista.current?.focus({ preventScroll: true });
  };

  return (
    <section
      aria-label="Contenido del ZIP"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white"
    >
      {/* cabecera: nombre del ZIP */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
        <Package size={17} className="shrink-0 text-electric" />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-gray-900" title={zipNombre}>
          {zipNombre}
        </span>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
          {fmt(paq.total)} en el ZIP
        </span>
      </div>

      {/* buscador + marcar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
        <label className="relative min-w-[10rem] flex-1">
          <span className="sr-only">Buscar por suministro, nombre o técnico</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={buscador}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                lista.current?.focus();
                if (planos.length && !planos.some((a) => a.clave === cursor)) setCursor(planos[0].clave);
              } else if (e.key === 'Escape' && q) {
                e.preventDefault();
                setQ('');
              }
            }}
            placeholder="Buscar suministro o archivo  ( / )"
            className="w-full rounded-lg border border-gray-300 bg-navy-900 py-1.5 pl-8 pr-7 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-electric [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                buscador.current?.focus();
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-900"
              aria-label="Borrar la búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className={btnMini}
            disabled={generando || (qn ? !encontrados.length : !todos.length)}
            onClick={() => marcarTodo(true)}
            title={
              qn
                ? 'Marca los archivos que encontró la búsqueda'
                : paq.op.anexarF4
                  ? 'Marca todos los 1A y 2A. Los anexos sueltos no, porque ya van dentro de cada 1A / 2A'
                  : 'Marca todos los archivos'
            }
          >
            <CheckSquare size={13} />
            {qn ? `Marcar ${fmt(encontrados.length)}` : 'Marcar todo'}
          </button>
          <button
            type="button"
            className={btnMini}
            disabled={generando || (qn ? !encontrados.length : !marcados)}
            onClick={() => marcarTodo(false)}
            title={qn ? 'Quita los archivos que encontró la búsqueda' : 'Quita todos los archivos'}
          >
            <Square size={13} />
            {qn ? `Quitar ${fmt(encontrados.length)}` : 'Quitar todo'}
          </button>
        </div>
        {qn && (
          <p className="basis-full text-xs text-gray-500" role="status">
            {encontrados.length
              ? `${plural(encontrados.length, 'archivo coincide', 'archivos coinciden')} con «${q.trim()}».`
              : `Nada coincide con «${q.trim()}».`}
          </p>
        )}
      </div>

      {/* árbol */}
      <div
        ref={lista}
        tabIndex={0}
        role="listbox"
        aria-multiselectable="true"
        aria-label="Archivos del ZIP: flechas para moverse, Espacio para marcar, Enter para ver"
        aria-activedescendant={actual ? ids.get(actual.clave) : undefined}
        onKeyDown={onTecla}
        onFocus={() => {
          setEnfocado(true);
          if (!actual && planos.length) setCursor(planos[0].clave);
        }}
        onBlur={() => setEnfocado(false)}
        className="min-h-[12rem] flex-1 overflow-y-auto p-1.5 outline-none max-lg:max-h-[60vh] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-electric/40"
      >
        {vistas.map(({ c, archivos }) => (
          <Carpeta
            key={c.grupo}
            c={c}
            visibles={archivos}
            buscando={!!qn}
            abierta={abierta(c.grupo)}
            onAlternar={() => alternarCarpeta(c.grupo)}
            paq={paq}
            generando={generando}
            nota={notaCarpeta(c)}
          >
            {archivos.map((a) => (
              <FilaArchivo
                key={a.clave}
                id={ids.get(a.clave)!}
                a={a}
                incluido={paq.incluido(a)}
                disabled={generando}
                cursor={enfocado && actual?.clave === a.clave}
                activo={activo === a.clave}
                armando={armando === a.clave}
                enCache={tieneCache(a)}
                onMouseDown={tomarFoco}
                onMarcar={(v) => {
                  setCursor(a.clave);
                  paq.marcarArchivo(a, v);
                }}
                onVer={() => {
                  setCursor(a.clave);
                  onVer(a);
                }}
              />
            ))}
          </Carpeta>
        ))}
      </div>

      <p className="hidden items-center gap-3 whitespace-nowrap border-t border-gray-200 px-3 py-1.5 text-[11px] text-gray-500 lg:flex">
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> moverse
        </span>
        <span>
          <Kbd>Espacio</Kbd> marcar
        </span>
        <span>
          <Kbd>Enter</Kbd> ver
        </span>
        <span>
          <Kbd>/</Kbd> buscar
        </span>
        <span className="ml-auto hidden items-center gap-1 2xl:flex">
          <Zap size={11} className="text-electric" /> ya armado: se ve al instante
        </span>
      </p>
    </section>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mr-0.5 rounded border border-gray-300 bg-gray-50 px-1 font-mono text-[10px] text-gray-700">
      {children}
    </kbd>
  );
}

function Carpeta({
  c,
  visibles,
  buscando,
  abierta,
  onAlternar,
  paq,
  generando,
  nota,
  children,
}: {
  c: CarpetaPaquete;
  visibles: ArchivoPaquete[];
  buscando: boolean;
  abierta: boolean;
  onAlternar: () => void;
  paq: Paquete;
  generando: boolean;
  nota?: { tono: 'aviso' | 'info'; texto: string };
  children: ReactNode;
}) {
  const marcados = c.archivos.filter(paq.incluido).length;
  const vacia = c.archivos.length === 0;
  const todos = !vacia && marcados === c.archivos.length;
  const parcial = marcados > 0 && !todos;
  if (buscando && !visibles.length) return null;

  return (
    <div className="mb-1" role="group" aria-label={c.ruta}>
      <div
        className={`sticky top-0 z-10 flex items-center gap-2 rounded-lg bg-white px-1.5 py-1.5 ${vacia ? 'opacity-60' : ''}`}
      >
        <input
          type="checkbox"
          tabIndex={-1}
          className="h-4 w-4 shrink-0 cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
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
          tabIndex={-1}
          onClick={onAlternar}
          disabled={vacia || buscando}
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
          <span className="min-w-0 truncate font-mono text-sm font-semibold text-gray-900" title={c.ruta}>
            {c.ruta}
          </span>
          <span className="hidden min-w-0 truncate text-xs text-gray-500 xl:inline">· {c.titulo}</span>
        </button>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${
            vacia
              ? 'text-gray-500'
              : todos
                ? 'bg-blue-50 text-blue-800'
                : parcial
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-gray-100 text-gray-500'
          }`}
          title={vacia ? c.vacia : `${fmt(marcados)} de ${fmt(c.archivos.length)} marcados`}
        >
          {vacia ? '—' : `${fmt(marcados)}/${fmt(c.archivos.length)}`}
        </span>
      </div>
      {vacia && <p className="ml-12 pb-1 text-xs text-gray-500">{c.vacia}</p>}
      {nota && (
        <p
          className={`mb-1 ml-12 flex items-start gap-1.5 text-xs ${nota.tono === 'aviso' ? 'text-amber-700' : 'text-gray-500'}`}
        >
          {nota.tono === 'aviso' && <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
          {nota.texto}
        </p>
      )}
      {abierta && !vacia && <ul className="ml-4 border-l border-gray-200 pl-1.5">{children}</ul>}
    </div>
  );
}

function FilaArchivo({
  id,
  a,
  incluido,
  disabled,
  cursor,
  activo,
  armando,
  enCache,
  onMouseDown,
  onMarcar,
  onVer,
}: {
  id: string;
  a: ArchivoPaquete;
  incluido: boolean;
  disabled: boolean;
  cursor: boolean;
  activo: boolean;
  armando: boolean;
  enCache: boolean;
  onMouseDown: (e: MouseEvent) => void;
  onMarcar: (v: boolean) => void;
  onVer: () => void;
}) {
  const datos: string[] = [];
  if (a.grupo === 'f4') {
    datos.push(`N.º ${a.numero}`);
    if (a.tecnico && a.tecnico !== '-') datos.push(a.tecnico);
  } else if (a.grupo === '1A') datos.push(plural(a.muestras ?? 0, 'muestra', 'muestras'));
  else {
    datos.push(`Sum. ${a.suministro}`);
    if (a.tecnico) datos.push(a.tecnico);
  }

  return (
    <li
      id={id}
      role="option"
      aria-selected={incluido}
      onMouseDown={onMouseDown}
      className={`group flex items-center gap-2 rounded-md border-l-2 px-1.5 py-[3px] ${
        activo ? 'border-electric bg-blue-50' : 'border-transparent hover:bg-gray-50'
      } ${cursor ? 'ring-2 ring-inset ring-electric' : ''}`}
    >
      <input
        type="checkbox"
        tabIndex={-1}
        className="h-4 w-4 shrink-0 cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
        checked={incluido}
        disabled={disabled}
        onChange={(e) => onMarcar(e.target.checked)}
        aria-label={`Incluir ${a.nombre}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={onVer}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:cursor-not-allowed"
        title={`Ver ${a.nombre}${datos.length ? ` — ${datos.join(' · ')}` : ''}`}
      >
        <FileText size={14} className={`shrink-0 ${incluido ? 'text-electric' : 'text-gray-400'}`} />
        <span
          className={`min-w-0 shrink truncate font-mono text-[13px] ${
            incluido ? 'text-gray-900' : 'text-gray-400 line-through'
          } group-hover:text-electric`}
        >
          {a.nombre}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500">{datos.join(' · ')}</span>
        {a.grupo !== 'f4' &&
          (a.noConformes ? (
            <Pill tono="amber" titulo={plural(a.noConformes, 'muestra no conforme', 'muestras no conformes')}>
              {a.grupo === '2A' ? 'NC' : `${fmt(a.noConformes)} NC`}
            </Pill>
          ) : (
            <Pill tono="green" titulo={a.grupo === '2A' ? 'Conforme' : 'Todas conformes'}>
              OK
            </Pill>
          ))}
        {a.provisional && (
          <Pill tono="red" titulo="Lleva número provisional: asigna los números antes de entregar">
            Provisional
          </Pill>
        )}
        {a.repetido && (
          <Pill tono="amber" titulo="Otro archivo de la carpeta se llama igual: en el ZIP queda uno solo">
            Repetido
          </Pill>
        )}
        {armando ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-electric" />
        ) : enCache ? (
          <span title="Ya armado: se ve al instante" className="shrink-0">
            <Zap size={13} className="text-electric" aria-label="Ya armado" />
          </span>
        ) : (
          <Eye size={14} className={`shrink-0 ${activo ? 'text-electric' : 'text-gray-400'}`} />
        )}
      </button>
    </li>
  );
}

function Pill({ tono, titulo, children }: { tono: 'amber' | 'green' | 'red'; titulo: string; children: ReactNode }) {
  const c = {
    amber: 'border-amber-200 text-amber-800',
    green: 'border-green-200 text-green-800',
    red: 'border-red-200 bg-red-50 text-red-800',
  }[tono];
  return (
    <span title={titulo} className={`shrink-0 rounded border px-1 text-[10px] font-semibold leading-4 ${c}`}>
      {children}
    </span>
  );
}
