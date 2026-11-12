// Casillas «Incluir Formato 1A / 2A» junto a la exportación de anexos (Formato 4).
// No cambian el Formato 4: solo agregan las carpetas Formato_1A/ y Formato_2A/ al mismo ZIP.
import { AlertTriangle, FlaskConical, Loader2, RefreshCw } from 'lucide-react';
import type { IncluirFormatosControl } from './useIncluirFormatos';

interface Props {
  control: IncluirFormatosControl;
  /** Suministros de la exportación sin formulario de la app. */
  faltantes: string[];
  /** Total de suministros de la exportación. */
  total: number;
}

const MAX_CODIGOS = 30;

export default function IncluirFormatos({ control: c, faltantes, total }: Props) {
  const fmt = (n: number) => n.toLocaleString('es-PE');
  const cargando = c.estado === 'cargando';
  const sinDatos = !cargando && c.n1A + c.n2A === 0;
  const algunoMarcado = c.incluir.f1A || c.incluir.f2A;

  const casilla = (clave: 'f1A' | 'f2A', titulo: string, detalle: string, n: number, disponible: boolean) => (
    <label
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 transition ${
        disponible
          ? 'cursor-pointer border-gray-200 hover:border-electric'
          : 'cursor-not-allowed border-gray-200 opacity-50'
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 accent-blue-600"
        checked={c.incluir[clave]}
        disabled={!disponible}
        onChange={(e) => c.setElegido((prev) => ({ ...prev, [clave]: e.target.checked }))}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{titulo}</span>
        <span className="block text-xs text-gray-500">
          {detalle}
          {!cargando && !c.simulado && (
            <>
              {' '}
              · <span className="font-mono">{fmt(n)}</span> formulario{n === 1 ? '' : 's'} en la jornada
            </>
          )}
        </span>
      </span>
    </label>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">Agregar al mismo ZIP</h4>
        {cargando && (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 size={12} className="animate-spin" /> Leyendo formularios de la app…
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500">
        El Formato 4 se exporta igual que siempre; esto solo suma carpetas aparte.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {casilla(
          'f1A',
          'Incluir Formato 1A (posteriores)',
          'Carpeta Formato_1A · 10 muestras por reporte SP',
          c.n1A,
          c.disponible1A,
        )}
        {casilla(
          'f2A',
          'Incluir Formato 2A (coincidentes)',
          'Carpeta Formato_2A · un reporte SC por suministro',
          c.n2A,
          c.disponible2A,
        )}
      </div>

      {algunoMarcado && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={c.incluir.fotos}
            onChange={(e) => c.setElegido((prev) => ({ ...prev, fotos: e.target.checked }))}
            className="h-4 w-4 accent-electric"
          />
          <span>
            Incluir fotos en el 1A/2A <span className="text-gray-500">(evidencias de los NO y registro adicional)</span>
          </span>
        </label>
      )}

      {algunoMarcado && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={c.incluir.anexarF4}
            onChange={(e) => c.setElegido((prev) => ({ ...prev, anexarF4: e.target.checked }))}
            className="h-4 w-4 accent-electric"
          />
          <span>
            Anexar el Formato 4 de cada suministro{' '}
            <span className="text-gray-500">(dentro de cada PDF 1A/2A, con sus fotos: tarda más)</span>
          </span>
        </label>
      )}

      {/* Por qué están deshabilitadas */}
      {sinDatos && !c.simulado && (
        <p className="flex items-start gap-1.5 text-xs text-gray-500">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
          <span>
            Aún no hay formularios 1A/2A de la app para esta jornada
            {c.estado === 'sinServidor' && ' (el servidor todavía no tiene la acción «getFormatos» desplegada)'}
            {c.estado === 'error' && ` (${c.mensaje || 'no se pudo leer'})`}.
            {(c.estado === 'error' || c.estado === 'listo' || c.estado === 'sinServidor') && (
              <button
                type="button"
                onClick={c.reintentar}
                className="ml-1.5 inline-flex items-center gap-1 font-medium text-electric hover:underline"
              >
                <RefreshCw size={11} /> Volver a consultar
              </button>
            )}
          </span>
        </p>
      )}

      {/* Solo en desarrollo: probar con respuestas inventadas (el PDF lo marca en el pie) */}
      {c.puedeSimular && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-amber-700">
          <input
            type="checkbox"
            className="accent-amber-500"
            checked={c.simulado}
            onChange={(e) => c.setSimulado(e.target.checked)}
          />
          <FlaskConical size={13} />
          usar respuestas simuladas (prueba, solo en desarrollo)
        </label>
      )}

      {/* Números todavía no fijados por el servidor */}
      {algunoMarcado && c.provisionales > 0 && (
        <p className="flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            <b>Números provisionales:</b> asigna los números antes de entregar (pestaña Formatos 1A · 2A, «Asignar
            números»). <span className="font-mono">{fmt(c.provisionales)}</span> formulario
            {c.provisionales === 1 ? '' : 's'} sin número fijo.
          </span>
        </p>
      )}

      {/* Suministros exportados sin formulario: no se inventan filas */}
      {algunoMarcado && faltantes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">
            <span className="font-mono">{fmt(faltantes.length)}</span> de{' '}
            <span className="font-mono">{fmt(total)}</span> suministros no tienen formulario 1A/2A y no irán en esas
            carpetas:
          </p>
          <p className="mt-1 break-words font-mono">
            {faltantes.slice(0, MAX_CODIGOS).join(', ')}
            {faltantes.length > MAX_CODIGOS && ` … y ${fmt(faltantes.length - MAX_CODIGOS)} más`}
          </p>
        </div>
      )}
    </div>
  );
}
