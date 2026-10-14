// Barra de mando para asignar la selección del mapa a un técnico (estilo juego de
// estrategia): los técnicos tienen tecla 1–9, Enter asigna y Esc limpia.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, X, CheckCircle2 } from 'lucide-react';
import { getPointStatus, type GpsPointExtended } from '../../types/point';
import { getTecnicos, assignTecnico } from '../../services/tecnicoService';
import { workersOf } from '../../services/pointsService';
import { progressByTecnico, initialOf, type AnyPoint } from './techUtils';
import { safeHexColor } from '../../utils/html';

interface Props {
  seleccion: AnyPoint[];
  allPoints: AnyPoint[];
  sheetName: string;
  onLimpiar: () => void;
  onAsignado: () => void;
}

export default function BarraAsignacion({ seleccion, allPoints, sheetName, onLimpiar, onAsignado }: Props) {
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [noReasignar, setNoReasignar] = useState(false);
  const [elegido, setElegido] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    getTecnicos().then((r) => {
      if (r.success && r.tecnicos) setUsuarios(r.tecnicos.map((t) => t.nombre));
    });
  }, []);

  // Técnicos: usuarios TECNICO + los que ya figuran en la jornada + quienes tomaron fotos
  const carga = useMemo(() => progressByTecnico(allPoints), [allPoints]);
  const opciones = useMemo(() => {
    const porNombre = new Map(carga.filter((c) => c.nombre !== 'Sin asignar').map((c) => [c.nombre, c]));
    // Cuántos suministros fotografió cada uno en esta jornada (los que trabajan aquí van primero)
    const fotos = new Map<string, number>();
    allPoints.forEach((p) => {
      const n = ((p as GpsPointExtended).odtNombre || '').trim();
      if (n && getPointStatus(p) !== 'pendiente') fotos.set(n, (fotos.get(n) || 0) + 1);
    });
    const nombres = new Set([...usuarios, ...porNombre.keys()]);
    allPoints.forEach((p) => workersOf(p as GpsPointExtended).forEach((n) => nombres.add(n)));
    return [...nombres]
      .map((n) => ({ nombre: n, info: porNombre.get(n), hechos: fotos.get(n) || 0 }))
      .sort((a, b) => {
        // Orden estable: quienes trabajan en la jornada, luego por nombre (las teclas no se mueven)
        const ta = a.hechos || a.info?.total ? 0 : 1;
        const tb = b.hechos || b.info?.total ? 0 : 1;
        return ta - tb || a.nombre.localeCompare(b.nombre, 'es');
      });
  }, [carga, usuarios, allPoints]);

  const resumen = useMemo(() => {
    const r = { pendientes: 0, enProceso: 0, completados: 0, conTecnico: 0 };
    seleccion.forEach((p) => {
      const st = getPointStatus(p);
      if (st === 'completado') r.completados++;
      else if (st === 'en_proceso') r.enProceso++;
      else r.pendientes++;
      if (((p as GpsPointExtended).tecnico || '').trim()) r.conTecnico++;
    });
    return r;
  }, [seleccion]);

  const aAsignar = useMemo(
    () =>
      seleccion.filter((p) => {
        if (soloPendientes && getPointStatus(p) !== 'pendiente') return false;
        if (noReasignar && ((p as GpsPointExtended).tecnico || '').trim()) return false;
        return true;
      }),
    [seleccion, soloPendientes, noReasignar],
  );

  const asignar = useCallback(async () => {
    if (!elegido || aAsignar.length === 0 || guardando) return;
    setGuardando(true);
    setMensaje(null);
    const r = await assignTecnico(sheetName, [...new Set(aAsignar.map((p) => String(p.suministro)))], elegido);
    setGuardando(false);
    if (r.success) {
      setMensaje({ ok: true, texto: `${r.updated ?? aAsignar.length} suministros asignados a ${elegido}` });
      setElegido('');
      onAsignado();
    } else {
      setMensaje({ ok: false, texto: r.message || 'No se pudo asignar' });
    }
  }, [elegido, aAsignar, guardando, sheetName, onAsignado]);

  // Atajos: 1–9 elige técnico, Enter asigna, Esc limpia
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key === 'Escape') {
        if (elegido) setElegido('');
        else onLimpiar();
      } else if (e.key === 'Enter') {
        asignar();
      } else if (/^[1-9]$/.test(e.key) && seleccion.length) {
        const o = opciones[Number(e.key) - 1];
        if (o) setElegido(o.nombre);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [opciones, asignar, onLimpiar, elegido, seleccion.length]);

  // El mensaje de resultado se va solo
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(null), 4000);
    return () => clearTimeout(t);
  }, [mensaje]);

  return (
    <div className="absolute inset-x-3 bottom-3 z-[600] rounded-2xl border border-electric/40 bg-navy-900/95 p-3 shadow-2xl backdrop-blur">
      {seleccion.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
          <span>
            <b className="text-electric">Arrastra</b> sobre el mapa para seleccionar puntos · <b>Shift</b> suma ·{' '}
            <b>Alt</b> quita · clic en un punto lo marca · <b>Espacio</b> + arrastrar mueve el mapa
          </span>
          {mensaje && (
            <span className={`flex items-center gap-1.5 text-sm ${mensaje.ok ? 'text-green-700' : 'text-red-700'}`}>
              {mensaje.ok && <CheckCircle2 size={15} />} {mensaje.texto}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Selección */}
          <div className="shrink-0 lg:w-64">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-900">
                <span className="font-mono text-2xl font-semibold text-electric">{seleccion.length}</span> seleccionados
              </p>
              <button
                onClick={onLimpiar}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                title="Limpiar selección (Esc)"
                aria-label="Limpiar selección"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              <span className="text-red-700">{resumen.pendientes} pend.</span> ·{' '}
              <span className="text-yellow-700">{resumen.enProceso} en proc.</span> ·{' '}
              <span className="text-green-700">{resumen.completados} compl.</span>
              {resumen.conTecnico > 0 && <> · {resumen.conTecnico} ya con técnico</>}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              <button
                onClick={() => setSoloPendientes((v) => !v)}
                className={`rounded-md border px-2 py-0.5 ${soloPendientes ? 'border-electric/60 text-electric' : 'border-gray-200 text-gray-500'}`}
              >
                {soloPendientes ? '✓' : '+'} Solo pendientes
              </button>
              <button
                onClick={() => setNoReasignar((v) => !v)}
                className={`rounded-md border px-2 py-0.5 ${noReasignar ? 'border-electric/60 text-electric' : 'border-gray-200 text-gray-500'}`}
              >
                {noReasignar ? '✓' : '+'} No reasignar
              </button>
            </div>
          </div>

          {/* Técnicos con atajo */}
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {opciones.map((o, i) => {
              const activo = elegido === o.nombre;
              return (
                <button
                  key={o.nombre}
                  onClick={() => setElegido(activo ? '' : o.nombre)}
                  className={`relative flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                    activo ? 'border-electric bg-electric/10' : 'border-gray-200 hover:border-electric/60'
                  }`}
                  title={i < 9 ? `Tecla ${i + 1}` : undefined}
                >
                  {i < 9 && (
                    <span className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded bg-gray-200 font-mono text-[10px] text-gray-700">
                      {i + 1}
                    </span>
                  )}
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: safeHexColor(o.info?.color, '#2a4268') }}
                  >
                    {initialOf(o.nombre)}
                  </span>
                  <span>
                    <span className="block whitespace-nowrap text-sm font-medium text-gray-900">{o.nombre}</span>
                    <span className="block whitespace-nowrap text-[11px] text-gray-500">
                      {o.info ? `${o.info.total} asignados · ` : ''}
                      {o.hechos ? `${o.hechos} fotografiados` : o.info ? '' : 'Sin trabajo aquí aún'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Acción */}
          <div className="flex shrink-0 flex-col items-stretch gap-1 lg:w-56">
            <button
              onClick={asignar}
              disabled={!elegido || aAsignar.length === 0 || guardando}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <UserPlus size={16} />
              )}
              {elegido ? `Asignar ${aAsignar.length} a ${elegido}` : 'Elige un técnico (1–9)'}
            </button>
            <p className="text-center text-[11px] text-gray-500">
              {aAsignar.length < seleccion.length
                ? `${seleccion.length - aAsignar.length} quedan fuera por los filtros`
                : 'Enter asigna · Esc limpia'}
            </p>
            {mensaje && (
              <p className={`text-center text-xs ${mensaje.ok ? 'text-green-700' : 'text-red-700'}`}>{mensaje.texto}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
