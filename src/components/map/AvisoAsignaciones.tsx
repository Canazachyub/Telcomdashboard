// Avisos de asignación del día: lo pendiente de cada técnico en las jornadas del mapa,
// listo para mandarlo por WhatsApp (abre wa.me con el mensaje; lo envía quien supervisa).
import { useEffect, useMemo, useState } from 'react';
import { X, MessageCircle, Copy, Check, Send } from 'lucide-react';
import { getTecnicos } from '../../services/tecnicoService';
import { cargaPorTecnico, etiquetaHoja, mensajeAsignacion, telefonoWhatsApp } from './mapaHojas';
import type { AnyPoint } from './techUtils';
import { initialOf } from './techUtils';
import { safeHexColor } from '../../utils/html';

interface Props {
  items: { point: AnyPoint; hoja: string }[];
  /** Técnico que se abre de entrada (p. ej. el recién asignado) */
  foco?: string | null;
  colorDe: (nombre: string) => string | undefined;
  onClose: () => void;
}

export default function AvisoAsignaciones({ items, foco, colorDe, onClose }: Props) {
  const cargas = useMemo(() => cargaPorTecnico(items), [items]);
  const [telefonos, setTelefonos] = useState<Map<string, string>>(new Map());
  const [abierto, setAbierto] = useState<string | null>(foco ?? null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  const [enviados, setEnviados] = useState<Set<string>>(new Set());

  useEffect(() => {
    getTecnicos().then((r) => {
      if (!r.success || !r.tecnicos) return;
      setTelefonos(new Map(r.tecnicos.map((t) => [t.nombre.trim(), t.telefono || ''])));
    });
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const textoDe = (nombre: string) => {
    if (textos[nombre] !== undefined) return textos[nombre];
    const c = cargas.find((x) => x.nombre === nombre);
    return c ? mensajeAsignacion(c) : '';
  };

  const copiar = async (nombre: string) => {
    try {
      await navigator.clipboard.writeText(textoDe(nombre));
      setCopiado(nombre);
      setTimeout(() => setCopiado((v) => (v === nombre ? null : v)), 2000);
    } catch {
      setCopiado(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <MessageCircle size={18} className="text-green-600" /> Avisar asignaciones
            </h2>
            <p className="text-sm text-gray-500">
              Lo pendiente de cada técnico en las jornadas del mapa. «WhatsApp» abre el chat con el mensaje listo; tú lo
              envías.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {cargas.length === 0 && (
            <p className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">
              Nadie tiene pendientes asignados en las jornadas cargadas.
            </p>
          )}
          {cargas.map((c) => {
            const tel = telefonoWhatsApp(telefonos.get(c.nombre));
            const open = abierto === c.nombre;
            const texto = textoDe(c.nombre);
            return (
              <div key={c.nombre} className={`rounded-xl border ${open ? 'border-electric/60' : 'border-gray-200'}`}>
                <div className="flex flex-wrap items-center gap-3 p-3">
                  <button
                    onClick={() => setAbierto(open ? null : c.nombre)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                      style={{ backgroundColor: safeHexColor(colorDe(c.nombre), '#2a4268') }}
                    >
                      {initialOf(c.nombre)}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-900">
                        {c.nombre}
                        {enviados.has(c.nombre) && <span className="ml-2 text-xs text-green-700">✓ abierto</span>}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {c.pendientes} pendientes ·{' '}
                        {[...c.porHoja].map(([h, n]) => `${etiquetaHoja(h)} ${n}`).join(' · ')}
                        {!tel && ' · sin celular en Usuarios'}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => copiar(c.nombre)}
                      className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:border-electric hover:text-electric"
                    >
                      {copiado === c.nombre ? <Check size={13} /> : <Copy size={13} />} Copiar
                    </button>
                    {tel ? (
                      <a
                        href={`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setEnviados((s) => new Set(s).add(c.nombre))}
                        className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                      >
                        <Send size={13} /> WhatsApp
                      </a>
                    ) : (
                      <span
                        className="flex cursor-not-allowed items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400"
                        title="Agrega su celular en Usuarios para abrir WhatsApp directo"
                      >
                        <Send size={13} /> WhatsApp
                      </span>
                    )}
                  </div>
                </div>
                {open && (
                  <div className="border-t border-gray-200 p-3">
                    <textarea
                      value={texto}
                      onChange={(e) => setTextos((t) => ({ ...t, [c.nombre]: e.target.value }))}
                      rows={Math.min(14, texto.split('\n').length + 1)}
                      className="w-full rounded-lg border border-gray-300 p-2 font-mono text-xs text-gray-800"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">Puedes editar el mensaje antes de enviarlo.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
