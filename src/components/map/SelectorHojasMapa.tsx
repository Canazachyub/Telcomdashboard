// Jornadas adicionales que se ven junto a la principal en el mapa.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Search, X } from 'lucide-react';
import { colorDeHoja, etiquetaHoja, ordenHoja } from './mapaHojas';

interface Props {
  hojas: string[];
  principal: string | null;
  extras: string[];
  onChange: (extras: string[]) => void;
  /** Avance de la carga, si está cargando */
  progreso: { hechas: number; total: number } | null;
}

export default function SelectorHojasMapa({ hojas, principal, extras, onChange, progreso }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  // Las más recientes primero por año, semestre y semana; las que no tienen semana, al final
  const otras = useMemo(
    () =>
      hojas
        .filter((h) => h !== principal)
        .map((h, i) => ({ h, i, o: ordenHoja(h) }))
        .sort((a, b) => b.o - a.o || b.i - a.i)
        .map((x) => x.h),
    [hojas, principal],
  );
  const visibles = useMemo(() => {
    const partes = q.trim().toUpperCase().split(/\s+/).filter(Boolean);
    return partes.length ? otras.filter((h) => partes.every((p) => h.toUpperCase().includes(p))) : otras;
  }, [otras, q]);

  const alternar = (h: string) => onChange(extras.includes(h) ? extras.filter((x) => x !== h) : [...extras, h]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
          extras.length
            ? 'border-electric text-electric'
            : 'border-gray-300 text-gray-700 hover:border-electric hover:text-electric'
        }`}
        title="Ver otras jornadas junto a la actual"
      >
        <Layers size={16} className={progreso ? 'animate-pulse' : ''} />
        {progreso
          ? `Cargando ${progreso.hechas}/${progreso.total}`
          : extras.length
            ? `+${extras.length} jornada${extras.length === 1 ? '' : 's'}`
            : 'Más jornadas'}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-[1100] w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
          <div className="border-b border-gray-200 p-3">
            <p className="text-sm font-semibold text-gray-900">Jornadas en el mapa</p>
            <p className="mt-0.5 text-xs text-gray-500">
              La principal es la elegida arriba. Las que marques se suman con un anillo de color.
            </p>
            <div className="relative mt-2">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filtrar: SEM14, VILC…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-2 text-sm"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => onChange([...new Set([...extras, ...otras.slice(0, 3)])])}
                className="rounded-md border border-gray-300 px-2 py-1 text-gray-700 hover:border-electric hover:text-electric"
              >
                + Las 3 más recientes
              </button>
              {extras.length > 0 && (
                <button
                  onClick={() => onChange([])}
                  className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-gray-700 hover:border-red-400 hover:text-red-700"
                >
                  <X size={12} /> Quitar todas
                </button>
              )}
            </div>
          </div>
          {principal && (
            <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <span className="h-3 w-3 shrink-0 rounded-full border-2 border-white/80 bg-gray-400" />
              <span className="min-w-0 break-all">
                <b>Principal:</b> {principal}
              </span>
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto py-1">
            {visibles.length === 0 && <li className="px-3 py-4 text-center text-sm text-gray-500">Ninguna coincide</li>}
            {visibles.map((h) => {
              const color = colorDeHoja(extras, h);
              return (
                <li key={h}>
                  <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-gray-50">
                    <input type="checkbox" checked={!!color} onChange={() => alternar(h)} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-all text-sm text-gray-900">{h}</span>
                    </span>
                    {color && (
                      <span
                        className="shrink-0 rounded px-1.5 text-[10px] font-semibold text-navy-950"
                        style={{ background: color }}
                      >
                        {etiquetaHoja(h)}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          {extras.length > 6 && (
            <p className="border-t border-gray-200 px-3 py-2 text-[11px] text-amber-700">
              {extras.length} jornadas: la carga y el mapa pueden ir más lentos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
