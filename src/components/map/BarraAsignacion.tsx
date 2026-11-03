// Barra de mando para asignar la selección del mapa a un técnico (estilo juego de
// estrategia): los técnicos tienen tecla 1–9, Enter asigna, Ctrl+Z deshace y Esc limpia.
// La selección puede mezclar varias jornadas: se asigna hoja por hoja.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, X, CheckCircle2, Undo2, MessageCircle } from 'lucide-react';
import { getPointStatus, type GpsPointExtended } from '../../types/point';
import { getTecnicos, assignTecnico } from '../../services/tecnicoService';
import { workersOf } from '../../services/pointsService';
import { progressByTecnico, initialOf, type AnyPoint } from './techUtils';
import { etiquetaHoja, tecnicoDe } from './mapaHojas';
import { safeHexColor } from '../../utils/html';

interface Cambio {
  hoja: string;
  suministro: string;
  antes: string;
}

interface Props {
  seleccion: AnyPoint[];
  allPoints: AnyPoint[];
  /** Jornada a la que pertenece cada punto */
  hojaDe: (p: AnyPoint) => string;
  /** Color del técnico en el mapa («Colorear por asignado») */
  colorDe: (nombre: string) => string | undefined;
  onLimpiar: () => void;
  /** Se escribió en estas jornadas: hay que releerlas */
  onAsignado: (hojas: string[]) => void;
  onAvisar: (nombre: string) => void;
}

/** Asigna agrupando por jornada; devuelve cuántos actualizó el servidor y los errores. */
async function asignarPorHoja(grupos: Map<string, string[]>, tecnico: string) {
  let updated = 0;
  const errores: string[] = [];
  for (const [hoja, sums] of grupos) {
    const r = await assignTecnico(hoja, sums, tecnico);
    if (r.success) updated += r.updated ?? sums.length;
    else errores.push(`${etiquetaHoja(hoja)}: ${r.message || 'error'}`);
  }
  return { updated, errores };
}

export default function BarraAsignacion({
  seleccion,
  allPoints,
  hojaDe,
  colorDe,
  onLimpiar,
  onAsignado,
  onAvisar,
}: Props) {
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [noReasignar, setNoReasignar] = useState(false);
  const [elegido, setElegido] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ultimo, setUltimo] = useState<{ tecnico: string; cambios: Cambio[] } | null>(null);

  useEffect(() => {
    getTecnicos().then((r) => {
      if (r.success && r.tecnicos) setUsuarios(r.tecnicos.map((t) => t.nombre));
    });
  }, []);

  // Técnicos: usuarios TECNICO + los que ya figuran en las jornadas + quienes tomaron fotos
  const carga = useMemo(() => progressByTecnico(allPoints), [allPoints]);
  const opciones = useMemo(() => {
    const porNombre = new Map(carga.filter((c) => c.nombre !== 'Sin asignar').map((c) => [c.nombre, c]));
    // Cuántos suministros fotografió cada uno (los que trabajan aquí van primero)
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
    const r = { pendientes: 0, enProceso: 0, completados: 0, conTecnico: 0, hojas: new Set<string>() };
    seleccion.forEach((p) => {
      const st = getPointStatus(p);
      if (st === 'completado') r.completados++;
      else if (st === 'en_proceso') r.enProceso++;
      else r.pendientes++;
      if (tecnicoDe(p)) r.conTecnico++;
      r.hojas.add(hojaDe(p));
    });
    return r;
  }, [seleccion, hojaDe]);

  const aAsignar = useMemo(
    () =>
      seleccion.filter((p) => {
        if (soloPendientes && getPointStatus(p) !== 'pendiente') return false;
        if (noReasignar && tecnicoDe(p)) return false;
        return true;
      }),
    [seleccion, soloPendientes, noReasignar],
  );

  const asignar = useCallback(async () => {
    if (!elegido || aAsignar.length === 0 || guardando) return;
    setGuardando(true);
    setMensaje(null);
    const grupos = new Map<string, string[]>();
    const cambios: Cambio[] = [];
    const vistos = new Set<string>();
    aAsignar.forEach((p) => {
      const hoja = hojaDe(p);
      const sum = String(p.suministro);
      if (vistos.has(`${hoja}|${sum}`)) return;
      vistos.add(`${hoja}|${sum}`);
      grupos.set(hoja, [...(grupos.get(hoja) || []), sum]);
      cambios.push({ hoja, suministro: sum, antes: tecnicoDe(p) });
    });
    const { updated, errores } = await asignarPorHoja(grupos, elegido);
    setGuardando(false);
    if (updated > 0) {
      setUltimo({ tecnico: elegido, cambios });
      setMensaje({
        ok: errores.length === 0,
        texto:
          `${updated} suministros asignados a ${elegido}` +
          (grupos.size > 1 ? ` en ${grupos.size} jornadas` : '') +
          (errores.length ? ` · falló ${errores.join('; ')}` : ''),
      });
      setElegido('');
      onAsignado([...grupos.keys()]);
    } else {
      setMensaje({ ok: false, texto: errores.join('; ') || 'No se pudo asignar' });
    }
  }, [elegido, aAsignar, guardando, hojaDe, onAsignado]);

  // Deshacer: devuelve cada suministro a su técnico anterior. El servidor no deja un
  // suministro sin técnico, así que los que no tenían ninguno se quedan como están.
  const deshacer = useCallback(async () => {
    if (!ultimo || guardando) return;
    setGuardando(true);
    setMensaje(null);
    const porTecnico = new Map<string, Map<string, string[]>>();
    let sinAnterior = 0;
    ultimo.cambios.forEach((c) => {
      if (!c.antes) {
        sinAnterior++;
        return;
      }
      if (c.antes === ultimo.tecnico) return;
      const g = porTecnico.get(c.antes) || new Map<string, string[]>();
      g.set(c.hoja, [...(g.get(c.hoja) || []), c.suministro]);
      porTecnico.set(c.antes, g);
    });
    let updated = 0;
    const errores: string[] = [];
    const hojas = new Set<string>();
    for (const [tecnico, grupos] of porTecnico) {
      const r = await asignarPorHoja(grupos, tecnico);
      updated += r.updated;
      errores.push(...r.errores);
      grupos.forEach((_, h) => hojas.add(h));
    }
    setGuardando(false);
    setUltimo(null);
    setMensaje({
      ok: errores.length === 0,
      texto:
        `Deshecho: ${updated} vuelven a su técnico anterior` +
        (sinAnterior ? ` · ${sinAnterior} no tenían técnico y siguen con ${ultimo.tecnico}` : '') +
        (errores.length ? ` · falló ${errores.join('; ')}` : ''),
    });
    if (hojas.size) onAsignado([...hojas]);
  }, [ultimo, guardando, onAsignado]);

  // Atajos: 1–9 elige técnico, Enter asigna, Ctrl+Z deshace, Esc limpia
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key === 'Escape') {
        if (elegido) setElegido('');
        else onLimpiar();
      } else if (e.key === 'Enter') {
        asignar();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        deshacer();
      } else if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && seleccion.length) {
        const o = opciones[Number(e.key) - 1];
        if (o) setElegido(o.nombre);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [opciones, asignar, deshacer, onLimpiar, elegido, seleccion.length]);

  // El mensaje de resultado se va solo
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(null), 7000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const accionesUltimo = ultimo && (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
      <button
        onClick={deshacer}
        disabled={guardando}
        className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:border-electric hover:text-electric disabled:opacity-50"
        title="Devolver los suministros a su técnico anterior (Ctrl+Z)"
      >
        <Undo2 size={13} /> Deshacer
      </button>
      <button
        onClick={() => onAvisar(ultimo.tecnico)}
        className="flex items-center gap-1 rounded-lg border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
        title="Enviarle su asignación por WhatsApp"
      >
        <MessageCircle size={13} /> Avisar a {ultimo.tecnico.split(/\s+/)[0]}
      </button>
    </span>
  );

  return (
    <div className="absolute inset-x-3 bottom-3 z-[600] rounded-2xl border border-electric/40 bg-navy-900/95 p-3 shadow-2xl backdrop-blur">
      {seleccion.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
          <span>
            <b className="text-electric">Arrastra</b> para seleccionar · <b>Shift</b> suma · <b>Alt</b> quita · clic
            marca un punto · <b>doble clic</b> = sus iguales en pantalla · <b>Ctrl+A</b> = pendientes en pantalla ·{' '}
            <b>Espacio</b> mueve el mapa
          </span>
          {(mensaje || ultimo) && (
            <span className="flex flex-wrap items-center gap-2">
              {mensaje && (
                <span className={`flex items-center gap-1.5 text-sm ${mensaje.ok ? 'text-green-700' : 'text-red-700'}`}>
                  {mensaje.ok && <CheckCircle2 size={15} />} {mensaje.texto}
                </span>
              )}
              {accionesUltimo}
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
                {resumen.hojas.size > 1 && <span className="text-gray-500"> · {resumen.hojas.size} jornadas</span>}
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
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 pt-1.5 pl-1.5">
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
                    style={{ backgroundColor: safeHexColor(colorDe(o.nombre) ?? o.info?.color, '#2a4268') }}
                  >
                    {initialOf(o.nombre)}
                  </span>
                  <span>
                    <span className="block whitespace-nowrap text-sm font-medium text-gray-900">{o.nombre}</span>
                    <span className="block whitespace-nowrap text-[11px] text-gray-500">
                      {o.info ? `${o.info.pendientes} pend. de ${o.info.total} · ` : ''}
                      {o.hechos ? `${o.hechos} fotografiados` : o.info ? '' : 'Sin trabajo aquí aún'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Acción */}
          <div className="flex shrink-0 flex-col items-stretch gap-1 lg:w-60">
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
            {accionesUltimo && <div className="flex justify-center">{accionesUltimo}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
