// Vista previa de un PDF generado (Formatos 1A · 2A): ventana propia por encima de todo,
// del ancho de una hoja real (vertical u horizontal), con Descargar, Imprimir y Cerrar.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, X } from 'lucide-react';

export interface Vista {
  url: string;
  nombre: string;
  horizontal?: boolean;
  paginas?: number;
}

export default function VistaPdf({ vista, onCerrar }: { vista: Vista; onCerrar: () => void }) {
  const marco = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [onCerrar]);

  // A4 a 96 ppp: 794 px de ancho (vertical) o 1123 px (horizontal), más el margen del visor
  const ancho = vista.horizontal ? 1180 : 860;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/80 p-3 sm:p-6" onClick={onCerrar}>
      <div
        className="flex w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-navy-900 shadow-2xl"
        style={{ maxWidth: ancho }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{vista.nombre}</p>
            <p className="text-[11px] text-gray-500">
              Vista previa{vista.paginas ? ` · ${vista.paginas} ${vista.paginas === 1 ? 'hoja' : 'hojas'}` : ''} · Esc
              para cerrar
            </p>
          </div>
          <a
            href={vista.url}
            download={vista.nombre}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-electric hover:text-electric"
          >
            <Download size={14} /> Descargar
          </a>
          <button
            onClick={() => marco.current?.contentWindow?.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-electric hover:text-electric"
          >
            <Printer size={14} /> Imprimir
          </button>
          <button
            onClick={onCerrar}
            title="Cerrar"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <X size={18} />
          </button>
        </div>
        <iframe
          ref={marco}
          title={vista.nombre}
          src={`${vista.url}#toolbar=0&navpanes=0`}
          className="w-full flex-1 bg-[#525659]"
        />
      </div>
    </div>,
    document.body,
  );
}
