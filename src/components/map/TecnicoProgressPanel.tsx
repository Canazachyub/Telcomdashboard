import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Users, X } from 'lucide-react';
import { progressByTecnico, progressByFotografo, initialOf, type AnyPoint } from './techUtils';
import { safeHexColor } from '../../utils/html';

interface Props {
  points: AnyPoint[];
  activeTecnico: string;
  onSelectTecnico: (nombre: string) => void;
}

/** Panel flotante con el avance de cada técnico en la jornada. Clic = filtrar el mapa. */
export default function TecnicoProgressPanel({ points, activeTecnico, onSelectTecnico }: Props) {
  const [open, setOpen] = useState(true);
  const rows = useMemo(() => progressByTecnico(points), [points]);
  const fotografos = useMemo(() => progressByFotografo(points), [points]);
  const hayAsignados = rows.some((r) => r.nombre !== 'Sin asignar');
  const [tabElegida, setTab] = useState<'asignados' | 'fotografos' | null>(null);
  const tab = tabElegida ?? (hayAsignados ? 'asignados' : 'fotografos');
  const filtering = activeTecnico && activeTecnico !== 'Todos';
  const totalConFoto = fotografos.reduce((n, f) => n + f.puntos, 0);

  if (rows.length === 0) return null;

  return (
    <div className="absolute right-4 top-16 z-[500] w-72 overflow-hidden rounded-xl border border-gray-200 bg-navy-900/90 shadow-2xl backdrop-blur">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 border-b border-gray-200 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Users size={16} className="text-electric" />
          Avance por técnico
          <span className="rounded-md bg-gray-100 px-1.5 text-[11px] font-medium text-gray-600">{rows.length}</span>
        </span>
        {open ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
      </button>

      {open && (
        <>
          <div className="grid grid-cols-2 gap-1 border-b border-gray-200 p-1.5 text-xs">
            {(['asignados', 'fotografos'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md py-1.5 font-medium transition-colors ${
                  tab === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {t === 'asignados' ? 'Asignados' : 'Quién fotografió'}
              </button>
            ))}
          </div>

          {tab === 'fotografos' ? (
            <ul className="max-h-[46vh] divide-y divide-gray-200 overflow-y-auto">
              {fotografos.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-gray-500">Aún no hay fotos en esta jornada</li>
              )}
              {fotografos.map((f) => {
                const pct = totalConFoto ? (f.puntos / totalConFoto) * 100 : 0;
                return (
                  <li key={f.nombre} className="flex items-center gap-3 px-3 py-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: safeHexColor(f.color, '#2a4268') }}
                    >
                      {initialOf(f.nombre) || '?'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-medium text-gray-900">{f.nombre}</span>
                        <span className="font-mono text-[11px] text-gray-700">{f.puntos}</span>
                      </span>
                      <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-gray-200">
                        <span style={{ width: `${pct}%`, backgroundColor: safeHexColor(f.color, '#00d4ff') }} />
                      </span>
                      <span className="mt-0.5 block text-[10px] text-gray-500">
                        {f.puntos} puntos fotografiados · {f.completados} completados
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
          <>
          {filtering && (
            <button
              onClick={() => onSelectTecnico('Todos')}
              className="flex w-full items-center justify-center gap-1 border-b border-gray-200 bg-blue-50 py-1.5 text-xs text-blue-800 hover:bg-blue-100"
            >
              <X size={12} /> Ver todos los técnicos
            </button>
          )}
          <ul className="max-h-[46vh] divide-y divide-gray-200 overflow-y-auto">
            {rows.map((r) => {
              const pct = r.total ? (r.completados / r.total) * 100 : 0;
              const color = safeHexColor(r.color, '#2a4268');
              const active = filtering && activeTecnico === r.nombre;
              const clickable = r.nombre !== 'Sin asignar';
              return (
                <li key={r.nombre}>
                  <button
                    disabled={!clickable}
                    onClick={() => onSelectTecnico(active ? 'Todos' : r.nombre)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                      active ? 'bg-blue-50' : 'hover:bg-gray-50'
                    } disabled:cursor-default`}
                    title={clickable ? 'Ver solo los puntos de este técnico' : undefined}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {clickable ? initialOf(r.nombre) : '–'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-medium text-gray-900">{r.nombre}</span>
                        <span className="font-mono text-[11px] text-gray-700">{pct.toFixed(0)}%</span>
                      </span>
                      <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-gray-200">
                        <span className="bg-green-500" style={{ width: `${pct}%` }} />
                        <span className="bg-yellow-500" style={{ width: `${r.total ? (r.enProceso / r.total) * 100 : 0}%` }} />
                      </span>
                      <span className="mt-0.5 block text-[10px] text-gray-500">
                        {r.completados} de {r.total} completados
                        {r.enProceso > 0 && ` · ${r.enProceso} en proceso`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          </>
          )}
        </>
      )}
    </div>
  );
}
