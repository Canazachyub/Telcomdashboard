// Piezas visuales de la revisión de «Entrega semanal»: chip de estado (barra superior) y fila del panel.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, HelpCircle, XCircle } from 'lucide-react';
import type { EstadoItem } from './revision';

const ICONO = (size: number): Record<EstadoItem, ReactNode> => ({
  ok: <CheckCircle2 size={size} className="shrink-0 text-green-500" aria-label="Listo" />,
  aviso: <AlertTriangle size={size} className="shrink-0 text-amber-500" aria-label="Revisar" />,
  bloquea: <XCircle size={size} className="shrink-0 text-red-500" aria-label="Impide la entrega" />,
  na: <HelpCircle size={size} className="shrink-0 text-gray-400" aria-label="No disponible" />,
});

const FONDO: Record<EstadoItem, string> = {
  ok: 'border-gray-200 bg-white',
  aviso: 'border-amber-200 bg-amber-50',
  bloquea: 'border-red-200 bg-red-50',
  na: 'border-gray-200 bg-gray-50',
};

const CHIP: Record<EstadoItem, string> = {
  ok: 'border-green-200 bg-green-50 text-green-800 hover:border-green-700',
  aviso: 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-700',
  bloquea: 'border-red-200 bg-red-50 text-red-800 hover:border-red-700',
  na: 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-400',
};

export function ChipEstado({
  estado,
  etiqueta,
  conteo,
  titulo,
  activo,
  onClick,
}: {
  estado: EstadoItem;
  etiqueta: string;
  conteo: string;
  titulo: string;
  activo?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${titulo} — clic para ver la lista`}
      aria-haspopup="dialog"
      aria-expanded={activo}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric ${
        CHIP[estado]
      } ${activo ? 'ring-2 ring-electric' : ''}`}
    >
      {ICONO(14)[estado]}
      <span className="text-gray-900">{etiqueta}</span>
      <span className="font-mono font-medium">{conteo}</span>
    </button>
  );
}

export function ItemRevision({
  id,
  estado,
  titulo,
  resumen,
  accion,
  detalle,
  abiertoInicial = false,
  resaltado = false,
}: {
  id?: string;
  estado: EstadoItem;
  titulo: string;
  resumen: ReactNode;
  accion?: ReactNode;
  /** Lista desplegable (suministros que faltan, etc.) */
  detalle?: ReactNode;
  abiertoInicial?: boolean;
  /** El chip que abrió el panel. */
  resaltado?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <li
      id={id}
      className={`scroll-mt-2 rounded-xl border p-3 ${FONDO[estado]} ${resaltado ? 'ring-2 ring-electric' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {ICONO(22)[estado]}
        <div className="min-w-[12rem] flex-1">
          <p className="font-semibold text-gray-900">{titulo}</p>
          <p className="text-sm text-gray-600">{resumen}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {detalle && (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-electric"
              aria-expanded={abierto}
            >
              {abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              {abierto ? 'Ocultar lista' : 'Ver lista'}
            </button>
          )}
          {accion}
        </div>
      </div>
      {detalle && abierto && <div className="mt-3 border-t border-gray-200 pt-3">{detalle}</div>}
    </li>
  );
}
