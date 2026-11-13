// Barra superior de «Entrega semanal»: la semana y su plazo, los chequeos como chips de estado (abren el
// cajón de revisión) y «Asignar números» cuando quedan provisionales. Reemplaza a los pasos 1 a 3.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, CheckCheck, ChevronDown, Hash, Loader2, RefreshCw, Send } from 'lucide-react';
import { usePointsStore } from '../../stores/pointsStore';
import { Badge, EmptyState, ui } from '../ui';
import { ChipEstado } from './ItemRevision';
import { nombreSemana, type Chequeo, type ClaveChequeo, type plazoDe } from './revision';

const fmt = (n: number) => n.toLocaleString('es-PE');
const plural = (n: number, uno: string, varios: string) => `${fmt(n)} ${n === 1 ? uno : varios}`;

export function BarraEntrega({
  hoja,
  plazo,
  checks,
  cargando,
  onChip,
  entregarIgual,
  avisos,
  provisionales,
  puedeAsignar,
  asignando,
  onAsignar,
  onRecargar,
  children,
}: {
  hoja: string;
  plazo: ReturnType<typeof plazoDe>;
  checks: Chequeo[];
  cargando: boolean;
  onChip: (c: ClaveChequeo) => void;
  entregarIgual: boolean;
  avisos: number;
  provisionales: number;
  puedeAsignar: boolean;
  asignando: boolean;
  onAsignar: () => void;
  onRecargar: () => void;
  /** Avisos del servidor y respuestas de las acciones, debajo de la barra. */
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Send size={18} className="shrink-0 text-electric" />
          <h1 className="shrink-0 text-base font-bold text-gray-900">Entrega semanal</h1>
        </div>
        <span className="hidden h-6 w-px bg-gray-200 sm:block" aria-hidden />
        <Semana hoja={hoja} plazo={plazo} />

        {hoja && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
            {cargando ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <Loader2 size={14} className="animate-spin text-electric" /> Revisando la semana…
              </span>
            ) : (
              <>
                {checks.map((c) => (
                  <ChipEstado
                    key={c.clave}
                    estado={c.estado}
                    etiqueta={c.etiqueta}
                    conteo={c.conteo}
                    titulo={c.titulo}
                    onClick={() => onChip(c.clave)}
                  />
                ))}
                {avisos > 0 && entregarIgual && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-800"
                    title="Marcaste «Entregar igual»: los puntos ámbar no frenan la descarga"
                  >
                    <CheckCheck size={13} /> Entregar igual
                  </span>
                )}
              </>
            )}
            {provisionales > 0 && !cargando && (
              <button
                type="button"
                className={`${ui.btnPrimary} ml-1 px-3 py-1.5`}
                disabled={!puedeAsignar}
                onClick={onAsignar}
                title="Da número fijo SP/SC a los formularios con número provisional (pide confirmación)"
              >
                {asignando ? <Loader2 size={15} className="animate-spin" /> : <Hash size={15} />}
                Asignar números ({fmt(provisionales)})
              </button>
            )}
            <button
              type="button"
              onClick={onRecargar}
              disabled={cargando}
              className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-electric disabled:opacity-50"
              title="Volver a leer los formularios de la semana"
              aria-label="Volver a leer los formularios de la semana"
            >
              <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Semana({ hoja, plazo }: { hoja: string; plazo: ReturnType<typeof plazoDe> }) {
  const { sheets, setSelectedSheet } = usePointsStore();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  // Las 8 jornadas más recientes (las hojas nuevas se agregan al final)
  const recientes = useMemo(() => {
    const r = [...sheets].reverse().slice(0, 8);
    if (hoja && !r.some((s) => s.name === hoja)) r.unshift({ name: hoja, id: -1 });
    return r;
  }, [sheets, hoja]);
  const { corto } = nombreSemana(hoja);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      window.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  const elegir = (nombre: string) => {
    if (nombre && nombre !== hoja) setSelectedSheet(nombre);
    setAbierto(false);
  };

  const lista = (
    <ul role="listbox" aria-label="Semanas más recientes" className="max-h-80 overflow-y-auto py-1">
      {recientes.map((s) => {
        const c = nombreSemana(s.name).corto;
        return (
          <li key={s.name}>
            <button
              type="button"
              role="option"
              aria-selected={s.name === hoja}
              onClick={() => elegir(s.name)}
              className={`flex w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-100 ${
                s.name === hoja ? 'text-electric' : 'text-gray-900'
              }`}
            >
              <span className="text-sm font-semibold">{c}</span>
              {c !== s.name.trim() && <span className="font-mono text-[11px] text-gray-500">{s.name.trim()}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (!hoja)
    return (
      <div className="w-full basis-full space-y-3 py-2">
        <EmptyState
          compact
          title="Primero elige la semana"
          description="Elige la jornada que vas a entregar. Puedes cambiarla cuando quieras."
        />
        <div className="mx-auto max-w-md rounded-xl border border-gray-200">{lista}</div>
        <p className="text-center text-xs text-gray-500">
          ¿No está? Elige cualquier jornada en el selector de arriba y vuelve aquí.
        </p>
      </div>
    );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div ref={caja} className="relative min-w-0">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1 text-left transition hover:border-electric"
          title={`Hoja: ${hoja} — clic para cambiar de semana`}
        >
          <CalendarDays size={16} className="shrink-0 text-electric" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-gray-900">{corto}</span>
            {corto !== hoja.trim() && (
              <span className="block truncate font-mono text-[10px] leading-tight text-gray-500">{hoja}</span>
            )}
          </span>
          <span className="ml-1 hidden shrink-0 text-xs text-gray-500 md:inline">Cambiar semana</span>
          <ChevronDown size={14} className="shrink-0 text-gray-500" />
        </button>
        {abierto && (
          <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-xl border border-gray-200 bg-navy-900 shadow-2xl">
            <p className="border-b border-gray-200 px-3 py-2 text-xs text-gray-500">
              Semanas más recientes · lo marcado vuelve a empezar
            </p>
            {lista}
            <p className="border-t border-gray-200 px-3 py-2 text-[11px] text-gray-500">
              ¿No está? Elige cualquier jornada en el selector de arriba.
            </p>
          </div>
        )}
      </div>
      {plazo ? (
        <span
          className="flex items-center gap-1.5 text-xs text-gray-600"
          title="5.º día hábil después del último día programado"
        >
          Vence <b className="text-gray-900">{plazo.venceTxt}</b>
          <Badge tone={plazo.quedan < 0 ? 'red' : plazo.quedan <= 2 ? 'amber' : 'green'}>
            {plazo.quedan < 0
              ? `Venció hace ${plural(-plazo.quedan, 'día hábil', 'días hábiles')}`
              : plazo.quedan === 0
                ? 'Vence hoy'
                : `Quedan ${plural(plazo.quedan, 'día hábil', 'días hábiles')}`}
          </Badge>
        </span>
      ) : (
        <span className="text-xs text-gray-500">Sin fechas programadas: no se calcula el plazo.</span>
      )}
    </div>
  );
}
