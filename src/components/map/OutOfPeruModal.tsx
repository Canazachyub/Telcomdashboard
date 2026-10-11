import { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { X, Download, AlertTriangle } from 'lucide-react';
import type { GpsPointExtended } from '../../types/point';
import type { AnyPoint } from './techUtils';
import { sourceRow, autoCols } from '../../utils/sourceColumns';

import { isInPeru } from '../../utils/geo';

interface Sugerencia {
  lat: number | null;
  lng: number | null;
  motivo: string;
}

/** Propone una corrección para coordenadas fuera de Perú (errores típicos de digitación). */
function sugerir(p: AnyPoint): Sugerencia {
  const lat = p.latReal ?? p.latRef ?? null;
  const lng = p.longReal ?? p.longRef ?? null;
  // La coordenada real está mal pero la referencial es válida
  if (p.latReal != null && !isInPeru(p.latReal, p.longReal) && isInPeru(p.latRef, p.longRef)) {
    return { lat: p.latRef!, lng: p.longRef!, motivo: 'Usar coordenada referencial (la real es inválida)' };
  }
  if (lat == null || lng == null) return { lat: null, lng: null, motivo: 'Sin coordenadas' };
  const candidatos: [number, number, string][] = [
    [lat, -Math.abs(lng), 'Longitud con signo invertido'],
    [-Math.abs(lat), lng, 'Latitud con signo invertido'],
    [-Math.abs(lat), -Math.abs(lng), 'Latitud y longitud con signo invertido'],
    [lng, lat, 'Latitud y longitud intercambiadas'],
    [-Math.abs(lng), -Math.abs(lat), 'Intercambiadas y con signo invertido'],
  ];
  for (const [la, lo, motivo] of candidatos) {
    if (isInPeru(la, lo)) return { lat: la, lng: lo, motivo };
  }
  return { lat: null, lng: null, motivo: 'Revisar manualmente' };
}

interface Props {
  points: AnyPoint[];
  sheetName: string;
  onClose: () => void;
}

/** Lista los puntos con coordenadas fuera de Perú y los exporta a Excel con su origen y la corrección sugerida. */
export default function OutOfPeruModal({ points, sheetName, onClose }: Props) {
  const rows = useMemo(
    () =>
      points
        .filter((p) => !isInPeru(p.latReal || p.latRef, p.longReal || p.longRef))
        .map((p) => {
          const ext = p as GpsPointExtended;
          const s = sugerir(p);
          return {
            point: ext,
            suministro: p.suministro,
            tecnico: ext.tecnico || '',
            fotografo: ext.odtNombre || '',
            latRef: p.latRef ?? null,
            longRef: p.longRef ?? null,
            latReal: p.latReal ?? null,
            longReal: p.longReal ?? null,
            latSug: s.lat,
            lngSug: s.lng,
            motivo: s.motivo,
          };
        }),
    [points],
  );

  const exportar = () => {
    const fecha = new Date().toISOString().slice(0, 10);
    // Mismas columnas y orden que la hoja fuente (A–AJ) y, al final, el diagnóstico.
    const data = rows.map(({ point: p, latSug, lngSug, motivo }) => ({
      ...sourceRow(p),
      // --- Diagnóstico ---
      'Jornada de origen': sheetName,
      'Fila en la hoja': p.rowIndex ?? null,
      'LATITUD sugerida': latSug,
      'LONGITUD sugerida': lngSug,
      'Motivo / corrección': motivo,
      'Detectado el': fecha,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = autoCols(Object.keys(data[0] ?? {}));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Coordenadas fuera de Peru');

    // Hoja de notas para quien corrija los datos
    const notas = XLSX.utils.aoa_to_sheet([
      ['Coordenadas fuera de Perú — notas'],
      [],
      ['Jornada de origen', sheetName],
      ['Puntos detectados', rows.length],
      ['Generado', new Date().toLocaleString('es-PE')],
      [],
      ['Las primeras 36 columnas son idénticas a la hoja fuente (A–AJ).'],
      ['Ojo: en la hoja fuente la columna T es LONGITUD y la U es LATITUD (la longitud va primero).'],
      ['Pegar la latitud en T es la causa más común de coordenadas intercambiadas.'],
      ['La coordenada sugerida es automática: verifícala antes de corregir la hoja.'],
    ]);
    notas['!cols'] = [{ wch: 90 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, notas, 'Notas');

    XLSX.writeFile(wb, `Coordenadas_fuera_de_Peru_${sheetName.replace(/[^\w-]+/g, '_')}_${fecha}.xlsx`);
  };

  const fmt = (n: number | null) => (n == null ? '—' : n.toFixed(6));

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
          <div>
            <p className="brand-kicker">Control de calidad</p>
            <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <AlertTriangle size={18} className="text-yellow-700" />
              {rows.length} puntos con coordenadas fuera de Perú
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Jornada <span className="font-medium text-gray-700">{sheetName}</span>. La corrección es una sugerencia:
              revísala antes de cambiar la hoja.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Suministro</th>
                <th className="px-4 py-2 font-medium">Tomó la foto</th>
                <th className="px-4 py-2 font-medium">Coordenada actual</th>
                <th className="px-4 py-2 font-medium">Sugerida</th>
                <th className="px-4 py-2 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((r) => (
                <tr key={r.suministro}>
                  <td className="px-4 py-2 font-mono text-gray-900">{r.suministro}</td>
                  <td className="px-4 py-2 text-gray-700">{r.fotografo || r.tecnico || '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs text-red-700">
                    {fmt(r.latReal ?? r.latRef)}, {fmt(r.longReal ?? r.longRef)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-green-700">
                    {r.latSug == null ? '—' : `${fmt(r.latSug)}, ${fmt(r.lngSug)}`}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">{r.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-4">
          <p className="text-xs text-gray-500">
            El Excel incluye las 36 columnas de la hoja fuente (A–AJ), la jornada de origen y la corrección sugerida.
          </p>
          <button
            onClick={exportar}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            <Download size={16} /> Descargar Excel
          </button>
        </div>
      </div>
    </div>
  );
}
