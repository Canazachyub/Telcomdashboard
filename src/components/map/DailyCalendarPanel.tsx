import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X, MapPin } from 'lucide-react';
import { computeDailyProgress, dayKey, type DayStats } from './dailyProgress';
import { initialOf, type AnyPoint } from './techUtils';
import { safeHexColor } from '../../utils/html';

interface Props {
  points: AnyPoint[];
  sheetName: string;
  selectedDay: string | null;
  onSelectDay: (key: string | null) => void;
  onClose: () => void;
}

const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const fmtDia = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
};

/**
 * Calendario del avance diario de la jornada: cuántos puntos se avanzaron cada día
 * (día de la primera foto) y quién los hizo. Al elegir un día, el mapa muestra solo esos puntos.
 */
export default function DailyCalendarPanel({ points, sheetName, selectedDay, onSelectDay, onClose }: Props) {
  const daily = useMemo(() => computeDailyProgress(points), [points]);
  const hoyKey = dayKey(new Date());

  // Mes inicial: el del día seleccionado, el de la última actividad, o el actual
  const ultimoDia = useMemo(() => [...daily.days.keys()].sort().at(-1) ?? hoyKey, [daily, hoyKey]);
  const [mes, setMes] = useState(() => {
    const [y, m] = (selectedDay || ultimoDia).split('-').map(Number);
    return { y, m: m - 1 };
  });

  const celdas = useMemo(() => {
    const primero = new Date(mes.y, mes.m, 1);
    const offset = (primero.getDay() + 6) % 7; // lunes primero
    const diasMes = new Date(mes.y, mes.m + 1, 0).getDate();
    return Array.from({ length: Math.ceil((offset + diasMes) / 7) * 7 }, (_, i) => {
      const d = i - offset + 1;
      if (d < 1 || d > diasMes) return null;
      return dayKey(new Date(mes.y, mes.m, d));
    });
  }, [mes]);

  const totalMes = useMemo(
    () =>
      [...daily.days.values()]
        .filter((d) => d.key.startsWith(`${mes.y}-${String(mes.m + 1).padStart(2, '0')}`))
        .reduce((n, d) => n + d.puntos, 0),
    [daily, mes],
  );

  const detalle: DayStats | undefined = daily.days.get(selectedDay || hoyKey);
  const detalleKey = selectedDay || hoyKey;

  const moverMes = (delta: number) =>
    setMes(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <div className="absolute inset-y-0 right-0 z-[600] flex w-full max-w-sm flex-col border-l border-gray-200 bg-navy-900/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <p className="brand-kicker">Avance diario</p>
          <h3 className="mt-0.5 flex items-center gap-2 truncate font-semibold text-gray-900">
            <CalendarDays size={18} className="shrink-0 text-electric" />
            <span className="truncate">{sheetName || 'Jornada'}</span>
          </h3>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Calendario */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => moverMes(-1)} className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Mes anterior">
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold capitalize text-gray-900">
                {MESES[mes.m]} {mes.y}
              </p>
              <p className="text-[11px] text-gray-500">{totalMes} puntos avanzados en el mes</p>
            </div>
            <button onClick={() => moverMes(1)} className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Mes siguiente">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {DIAS.map((d) => (
              <span key={d} className="py-1 text-[10px] font-semibold uppercase text-gray-400">
                {d}
              </span>
            ))}
            {celdas.map((key, i) => {
              if (!key) return <span key={`e${i}`} />;
              const st = daily.days.get(key);
              const intensidad = st && daily.maxPuntos ? st.puntos / daily.maxPuntos : 0;
              const activo = selectedDay === key;
              const esHoy = key === hoyKey;
              return (
                <button
                  key={key}
                  onClick={() => onSelectDay(activo ? null : key)}
                  disabled={!st}
                  title={st ? `${st.puntos} puntos · ${st.fotos} fotos` : undefined}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
                    activo
                      ? 'border-electric text-white'
                      : esHoy
                      ? 'border-energy/60 text-gray-900'
                      : 'border-transparent text-gray-600'
                  } ${st ? 'hover:border-electric/60' : 'opacity-40'}`}
                  style={
                    st
                      ? { backgroundColor: `rgba(16, 185, 129, ${0.12 + intensidad * 0.55})` }
                      : undefined
                  }
                >
                  <span className="leading-none">{Number(key.slice(8))}</span>
                  {st && <span className="mt-0.5 font-mono text-[10px] font-semibold leading-none text-white">{st.puntos}</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            El número es la cantidad de puntos avanzados ese día (día de la primera foto). Más verde = más avance.
          </p>
        </div>

        {/* Detalle del día */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {detalleKey === hoyKey ? 'Hoy' : 'Día seleccionado'}
              </p>
              <p className="text-sm font-semibold capitalize text-gray-900">{fmtDia(detalleKey)}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-semibold text-green-700">{detalle?.puntos ?? 0}</p>
              <p className="text-[10px] text-gray-500">puntos · {detalle?.fotos ?? 0} fotos</p>
            </div>
          </div>

          {detalle && detalle.tecnicos.length > 0 ? (
            <ul className="space-y-2">
              {detalle.tecnicos.map((t) => {
                const pct = detalle.puntos ? (t.puntos / detalle.puntos) * 100 : 0;
                return (
                  <li key={t.nombre} className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: safeHexColor(t.color, '#2a4268') }}
                    >
                      {initialOf(t.nombre) || '?'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2 text-xs">
                        <span className="truncate text-gray-900">{t.nombre}</span>
                        <span className="font-mono text-gray-700">
                          {t.puntos} <span className="text-gray-400">/ {t.fotos} fotos</span>
                        </span>
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-gray-200">
                        <span className="block h-full" style={{ width: `${pct}%`, backgroundColor: safeHexColor(t.color, '#10b981') }} />
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-3 text-center text-xs text-gray-500">Sin avance registrado este día.</p>
          )}

          {selectedDay && detalle && (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] text-blue-800">
              <MapPin size={12} /> El mapa muestra los puntos avanzados este día y los pendientes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
