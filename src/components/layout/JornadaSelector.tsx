// Selector de jornada de la barra superior: nombre corto («Semana 19 · P-227») con el nombre
// completo debajo, buscador, las 8 más recientes primero y «Ver todas» para el resto.
// Elegir llama a la misma acción del store de siempre (setSelectedSheet).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarRange, ChevronDown, Check, Search } from 'lucide-react';
import { usePointsStore } from '../../stores/pointsStore';
import { etiquetaJornada, normBusqueda } from '../../utils/jornadaLabel';

const RECIENTES = 8;

interface Opcion {
  name: string;
  label: string;
  clave: string;
}

export default function JornadaSelector() {
  const { sheets, selectedSheet, setSelectedSheet } = usePointsStore();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [verTodas, setVerTodas] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const uid = useId();
  const listaId = `${uid}-lista`;
  const opId = (i: number) => `${uid}-op-${i}`;

  // Las hojas nuevas quedan al final del Spreadsheet: se invierte para ver primero las recientes
  const opciones = useMemo<Opcion[]>(
    () =>
      [...sheets].reverse().map((s) => {
        const label = etiquetaJornada(s.name);
        return { name: s.name, label, clave: normBusqueda(`${label} ${s.name}`) };
      }),
    [sheets],
  );
  const recientes = opciones.slice(0, RECIENTES);
  const resto = opciones.slice(RECIENTES);

  const palabras = q.split(/\s+/).map(normBusqueda).filter(Boolean);
  const buscando = palabras.length > 0;
  const visibles = buscando
    ? opciones.filter((o) => palabras.every((p) => o.clave.includes(p)))
    : verTodas
      ? opciones
      : recientes;

  const actual = selectedSheet ? opciones.find((o) => o.name === selectedSheet) : undefined;
  const etiquetaActual = actual?.label ?? (selectedSheet ? etiquetaJornada(selectedSheet) : 'Elegir jornada');

  const abrir = () => {
    setQ('');
    // Si la jornada actual no está entre las recientes, se abre con todas a la vista
    const enRecientes = recientes.findIndex((o) => o.name === selectedSheet);
    const todas = enRecientes < 0 && !!actual;
    setVerTodas(todas);
    setActivo(Math.max(0, todas ? opciones.findIndex((o) => o.name === selectedSheet) : enRecientes));
    setAbierto(true);
  };
  const cerrar = (devolverFoco = true) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  };
  const elegir = (o: Opcion | undefined) => {
    if (!o) return;
    if (o.name !== selectedSheet) setSelectedSheet(o.name);
    cerrar();
  };

  // Foco al buscador al abrir; clic fuera cierra
  useEffect(() => {
    if (!abierto) return;
    buscador.current?.focus();
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  // Mantener visible la opción activa al moverse con el teclado
  useEffect(() => {
    if (abierto) document.getElementById(opId(activo))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, abierto]);

  const onTecla = (e: React.KeyboardEvent) => {
    const ultimo = visibles.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activo >= ultimo && !buscando && !verTodas && resto.length) setVerTodas(true);
      setActivo((a) => Math.min(a + 1, buscando || verTodas ? ultimo : opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActivo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActivo(ultimo);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      elegir(visibles[activo]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
    } else if (e.key === 'Tab') {
      cerrar(false);
    }
  };

  return (
    <div ref={caja} className="relative min-w-0">
      <button
        ref={boton}
        type="button"
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={(e) => {
          if (!abierto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            abrir();
          }
        }}
        title={selectedSheet ? `Jornada: ${selectedSheet}` : 'Elegir jornada'}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`Jornada: ${etiquetaActual}. Cambiar jornada`}
        className="flex min-w-0 items-center gap-2 rounded-lg py-1 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-electric/60"
      >
        <CalendarRange size={16} className="shrink-0 text-electric" />
        <span className="min-w-0">
          <span className="hidden text-[10px] font-medium uppercase tracking-wider text-gray-400 sm:block">
            Jornada
          </span>
          <span className="block max-w-[46vw] truncate text-sm font-semibold text-gray-900 sm:max-w-[260px]">
            {etiquetaActual}
          </span>
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {abierto && (
        <div className="absolute left-0 top-full z-[1200] mt-2 w-[min(92vw,26rem)] overflow-hidden rounded-xl border border-line-strong bg-navy-900 shadow-2xl shadow-black/50">
          <div className="border-b border-line p-2">
            <label className="relative block">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                ref={buscador}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActivo(0);
                }}
                onKeyDown={onTecla}
                placeholder="Buscar: semana 19, P227, NTCSER…"
                role="combobox"
                aria-expanded="true"
                aria-controls={listaId}
                aria-autocomplete="list"
                aria-activedescendant={visibles.length ? opId(activo) : undefined}
                aria-label="Buscar jornada"
                className="w-full rounded-lg border border-line bg-navy-800 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-500 focus:border-electric/60"
              />
            </label>
          </div>

          <ul
            id={listaId}
            role="listbox"
            aria-label="Jornadas"
            className="max-h-[min(60vh,28rem)] overflow-y-auto py-1"
          >
            {!opciones.length && (
              <li role="presentation" className="px-3 py-3 text-sm text-gray-500">
                Cargando jornadas…
              </li>
            )}
            {!buscando && opciones.length > 0 && (
              <li
                role="presentation"
                className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400"
              >
                Recientes
              </li>
            )}
            {buscando && (
              <li role="presentation" className="px-3 pb-1 pt-2 text-[11px] text-gray-500">
                {visibles.length
                  ? `${visibles.length} de ${opciones.length} jornadas`
                  : `Ninguna jornada coincide con «${q.trim()}»`}
              </li>
            )}
            {visibles.map((o, i) => {
              const sel = o.name === selectedSheet;
              const distinto = o.label !== o.name.replace(/\s+/g, ' ').trim();
              return (
                <li key={o.name} role="presentation">
                  {!buscando && i === RECIENTES && (
                    <p className="border-t border-line px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                      Anteriores
                    </p>
                  )}
                  <div
                    id={opId(i)}
                    role="option"
                    aria-selected={sel}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegir(o)}
                    onMouseMove={() => activo !== i && setActivo(i)}
                    className={`mx-1 flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 ${
                      i === activo ? 'bg-navy-700' : ''
                    }`}
                  >
                    <Check size={15} className={`mt-0.5 shrink-0 text-electric ${sel ? '' : 'invisible'}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${sel ? 'font-bold text-white' : 'font-semibold text-gray-900'}`}>
                        {o.label}
                      </span>
                      {distinto && <span className="block break-words text-[11px] text-gray-500">{o.name}</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {!buscando && !verTodas && resto.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setVerTodas(true);
                buscador.current?.focus();
              }}
              className="w-full border-t border-line px-3 py-2.5 text-sm font-semibold text-electric hover:bg-navy-800"
            >
              Ver todas ({resto.length} más)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
