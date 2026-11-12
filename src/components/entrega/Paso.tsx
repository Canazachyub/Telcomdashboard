// Piezas visuales de «Entrega semanal»: tarjeta de paso numerado y fila de la lista de revisión.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, HelpCircle, XCircle } from 'lucide-react';

export type EstadoPaso = 'hecho' | 'actual' | 'pendiente' | 'bloqueado';

export function Paso({
  n,
  titulo,
  ayuda,
  estado,
  id,
  children,
}: {
  n: number;
  titulo: string;
  ayuda?: ReactNode;
  estado: EstadoPaso;
  id?: string;
  children: ReactNode;
}) {
  const circulo =
    estado === 'hecho'
      ? 'border-green-500 bg-green-600 text-white'
      : estado === 'actual'
        ? 'border-electric bg-blue-600 text-white'
        : 'border-gray-300 bg-gray-100 text-gray-500';
  return (
    <section
      id={id}
      className={`scroll-mt-4 rounded-2xl border bg-white p-5 ${estado === 'actual' ? 'border-electric' : 'border-gray-200'}`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-lg font-bold ${circulo}`}
          aria-hidden
        >
          {estado === 'hecho' ? <CheckCircle2 size={22} /> : n}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900">
            <span className="sr-only">Paso {n}: </span>
            {titulo}
          </h2>
          {ayuda && <p className="mt-0.5 text-sm text-gray-500">{ayuda}</p>}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

export type EstadoItem = 'ok' | 'aviso' | 'bloquea' | 'na';

const ICONO: Record<EstadoItem, ReactNode> = {
  ok: <CheckCircle2 size={22} className="text-green-500" aria-label="Listo" />,
  aviso: <AlertTriangle size={22} className="text-amber-500" aria-label="Revisar" />,
  bloquea: <XCircle size={22} className="text-red-500" aria-label="Falta" />,
  na: <HelpCircle size={22} className="text-gray-400" aria-label="No disponible" />,
};

const FONDO: Record<EstadoItem, string> = {
  ok: 'border-gray-200 bg-white',
  aviso: 'border-amber-200 bg-amber-50',
  bloquea: 'border-red-200 bg-red-50',
  na: 'border-gray-200 bg-gray-50',
};

export function ItemRevision({
  estado,
  titulo,
  resumen,
  accion,
  detalle,
  abiertoInicial = false,
}: {
  estado: EstadoItem;
  titulo: string;
  resumen: ReactNode;
  accion?: ReactNode;
  /** Lista desplegable (suministros que faltan, etc.) */
  detalle?: ReactNode;
  abiertoInicial?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <li className={`rounded-xl border p-3 ${FONDO[estado]}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="shrink-0">{ICONO[estado]}</span>
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
