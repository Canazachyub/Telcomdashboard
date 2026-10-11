import { useEffect, useMemo, useState } from 'react';
import { X, UserPlus, Search, MapPinned, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getPointStatus, type GpsPointExtended } from '../../types/point';
import { getTecnicos, assignTecnico } from '../../services/tecnicoService';
import { progressByTecnico, initialOf, type AnyPoint } from './techUtils';
import { safeHexColor } from '../../utils/html';
import { workersOf } from '../../services/pointsService';

interface Props {
  /** Puntos que quedaron dentro del área dibujada */
  areaPoints: AnyPoint[];
  /** Todos los puntos de la jornada (para mostrar la carga de cada técnico) */
  allPoints: AnyPoint[];
  sheetName: string;
  onClose: () => void;
  onAssignComplete: () => void;
}

/**
 * Panel lateral para asignar un área dibujada en el mapa a un técnico.
 * Usa la misma acción del servidor que antes (assignTecnico); lo nuevo es que
 * muestra qué hay dentro del área y deja elegir qué puntos se asignan.
 */
export default function AssignAreaPanel({ areaPoints, allPoints, sheetName, onClose, onAssignComplete }: Props) {
  const [incluirCompletados, setIncluirCompletados] = useState(false);
  const [mantenerAsignados, setMantenerAsignados] = useState(false);
  const [usuariosTecnicos, setUsuariosTecnicos] = useState<string[]>([]);
  const [loadingTecnicos, setLoadingTecnicos] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getTecnicos().then((r) => {
      if (r.success && r.tecnicos) setUsuariosTecnicos(r.tecnicos.map((t) => t.nombre));
      setLoadingTecnicos(false);
    });
  }, []);

  // Resumen del área
  const resumen = useMemo(() => {
    let pendientes = 0, enProceso = 0, completados = 0;
    const porTecnico = new Map<string, number>();
    for (const p of areaPoints) {
      const st = getPointStatus(p);
      if (st === 'completado') completados++;
      else if (st === 'en_proceso') enProceso++;
      else pendientes++;
      const t = ((p as GpsPointExtended).tecnico || '').trim();
      if (t) porTecnico.set(t, (porTecnico.get(t) || 0) + 1);
    }
    return { pendientes, enProceso, completados, porTecnico: [...porTecnico.entries()].sort((a, b) => b[1] - a[1]) };
  }, [areaPoints]);

  // Puntos que realmente se van a asignar según las opciones
  const aAsignar = useMemo(
    () =>
      areaPoints.filter((p) => {
        if (!incluirCompletados && getPointStatus(p) === 'completado') return false;
        if (mantenerAsignados && ((p as GpsPointExtended).tecnico || '').trim()) return false;
        return true;
      }),
    [areaPoints, incluirCompletados, mantenerAsignados],
  );

  // Lista de técnicos: usuarios TECNICO + los que ya figuran en la jornada, con su carga actual
  const carga = useMemo(() => progressByTecnico(allPoints), [allPoints]);
  // Operadores con dispositivo: los que tomaron fotos en esta jornada + los registrados en Rastreo
  const operadores = useMemo(() => {
    const set = new Set<string>();
    allPoints.forEach((p) => workersOf(p as GpsPointExtended).forEach((n) => set.add(n)));
    try {
      const cache = JSON.parse(localStorage.getItem('telcom-tracking-cache') || 'null') as { tecnicos?: { nombre?: string }[] } | null;
      cache?.tecnicos?.forEach((t) => t.nombre && set.add(t.nombre.trim()));
    } catch {
      // sin caché de rastreo: no es crítico
    }
    return set;
  }, [allPoints]);

  const opciones = useMemo(() => {
    const byName = new Map(carga.filter((c) => c.nombre !== 'Sin asignar').map((c) => [c.nombre, c]));
    const nombres = new Set([...usuariosTecnicos, ...byName.keys(), ...operadores]);
    return [...nombres]
      .map((n) => ({ nombre: n, info: byName.get(n) }))
      .filter((o) => o.nombre.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [carga, usuariosTecnicos, operadores, query]);

  const handleAssign = async () => {
    if (!selected || aAsignar.length === 0) return;
    setSaving(true);
    setError('');
    const result = await assignTecnico(sheetName, aAsignar.map((p) => p.suministro), selected);
    setSaving(false);
    if (result.success) {
      setSuccess(`Se asignaron ${result.updated ?? aAsignar.length} puntos a ${selected}`);
      setTimeout(() => {
        onAssignComplete();
        onClose();
      }, 1400);
    } else {
      setError(result.message || 'Error al asignar técnico');
    }
  };

  return (
    <div className="absolute inset-y-0 right-0 z-[600] flex w-full max-w-sm flex-col border-l border-gray-200 bg-navy-900/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <p className="brand-kicker">Asignación por área</p>
          <h3 className="mt-0.5 flex items-center gap-2 font-semibold text-gray-900">
            <MapPinned size={18} className="text-electric" />
            {areaPoints.length} puntos en el área
          </h3>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Resumen */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { l: 'Pendientes', v: resumen.pendientes, c: 'text-red-700' },
            { l: 'En proceso', v: resumen.enProceso, c: 'text-yellow-700' },
            { l: 'Completados', v: resumen.completados, c: 'text-green-700' },
          ].map((x) => (
            <div key={x.l} className="rounded-lg border border-gray-200 bg-gray-50 py-2">
              <p className={`font-mono text-lg font-semibold ${x.c}`}>{x.v}</p>
              <p className="text-[10px] text-gray-500">{x.l}</p>
            </div>
          ))}
        </div>

        {resumen.porTecnico.length > 0 && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
            <p className="mb-1 flex items-center gap-1 font-semibold">
              <AlertTriangle size={13} /> Ya tienen técnico en esta área:
            </p>
            <ul className="space-y-0.5">
              {resumen.porTecnico.slice(0, 5).map(([n, c]) => (
                <li key={n} className="flex justify-between gap-2">
                  <span className="truncate">{n}</span>
                  <span className="font-mono">{c}</span>
                </li>
              ))}
              {resumen.porTecnico.length > 5 && <li>… y {resumen.porTecnico.length - 5} más</li>}
            </ul>
          </div>
        )}

        {/* Opciones */}
        <div className="space-y-2 text-sm">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={incluirCompletados} onChange={(e) => setIncluirCompletados(e.target.checked)} className="mt-0.5 accent-blue-600" />
            <span className="text-gray-700">Incluir puntos ya completados</span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={mantenerAsignados} onChange={(e) => setMantenerAsignados(e.target.checked)} className="mt-0.5 accent-blue-600" />
            <span className="text-gray-700">Solo puntos sin técnico (no reasignar)</span>
          </label>
        </div>

        {/* Técnico */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Asignar a</p>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar técnico…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm outline-none focus:border-electric"
            />
          </div>
          {loadingTecnicos && opciones.length === 0 ? (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-electric" />
            </div>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {opciones.map(({ nombre, info }) => {
                const active = selected === nombre;
                return (
                  <li key={nombre}>
                    <button
                      onClick={() => setSelected(nombre)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                        active ? 'border-electric bg-blue-50' : 'border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                        style={{ backgroundColor: safeHexColor(info?.color, '#2a4268') }}
                      >
                        {initialOf(nombre)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-900">{nombre}</span>
                        <span className="text-[11px] text-gray-500">
                          {info ? `${info.total} asignados · ${info.completados} completados` : 'Sin puntos en esta jornada'}
                        </span>
                      </span>
                      {active && <CheckCircle2 size={16} className="text-electric" />}
                    </button>
                  </li>
                );
              })}
              {opciones.length === 0 && <li className="py-4 text-center text-sm text-gray-500">No hay técnicos que coincidan</li>}
            </ul>
          )}
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        {success && <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{success}</div>}
      </div>

      <div className="space-y-2 border-t border-gray-200 p-4">
        <p className="text-center text-xs text-gray-500">
          Se asignarán <span className="font-mono font-semibold text-gray-900">{aAsignar.length}</span> de {areaPoints.length} puntos
          {selected && (
            <>
              {' '}a <span className="font-semibold text-gray-900">{selected}</span>
            </>
          )}
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleAssign}
            disabled={saving || !selected || aAsignar.length === 0 || !!success}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>
                <UserPlus size={16} /> Asignar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
