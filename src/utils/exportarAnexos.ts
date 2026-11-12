// Formato 4 (anexos de supervisión) empaquetado en un ZIP. Lo usan Reportes y «Entrega semanal»,
// así los dos generan exactamente los mismos archivos. Los PDF los arma pdfGenerator.ts (no cambia).
import type JSZip from 'jszip';
import type { GpsPointExtended, PhotoLink } from '../types/point';
import { generateReportePDFBlob, generateReportePDFSimpleBlob, type ReportePDFData } from './pdfGenerator';

/** Un anexo del Formato 4 (solo puntos con lectura). */
export interface ReporteItem {
  numero: number;
  serie: string;
  suministro: string;
  ruta: string;
  lectura: string | number;
  fechaContraste: string;
  fechaSupervision: string;
  tecnico: string;
  distrito: string;
  photoLinks: PhotoLink[];
  point: GpsPointExtended;
}

/** Fecha corta para el anexo (dd/mm/aa). */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/** Anexo de un punto con el N.º dado (sin lectura, la lectura queda en «-»). */
export function itemDePunto(extPoint: GpsPointExtended, numero: number): ReporteItem {
  return {
    numero,
    serie: extPoint.serie?.toString() || '-',
    suministro: extPoint.suministro,
    ruta: extPoint.codigoRuta?.toString() || '-',
    lectura: extPoint.lectura ?? '-',
    fechaContraste: formatDate(extPoint.fecha),
    fechaSupervision: formatDate(extPoint.fechaSupervision),
    tecnico: extPoint.tecnico || '-',
    distrito: extPoint.distrito || '-',
    photoLinks: extPoint.photoLinks || [],
    point: extPoint,
  };
}

/** Anexos de la jornada: un item por punto con lectura, numerados en el orden de la hoja. */
export function itemsReporte(points: GpsPointExtended[]): ReporteItem[] {
  const items: ReporteItem[] = [];
  let numero = 1;
  points.forEach((extPoint) => {
    // Solo incluir puntos que tienen lectura
    if (extPoint.lectura !== null && extPoint.lectura !== undefined && extPoint.lectura !== '') {
      items.push(itemDePunto(extPoint, numero++));
    }
  });
  return items;
}

/** PDF del Formato 4 de un anexo, exactamente como lo arma Reportes (pdfGenerator.ts). */
export async function pdfAnexo(
  item: ReporteItem,
  o: { withImages: boolean; sheetName: string; observacion: string; numero?: number },
): Promise<{ blob: Blob; fileName: string }> {
  const pdfData: ReportePDFData = {
    numero: o.numero ?? item.numero,
    serie: item.serie,
    suministro: item.suministro,
    ruta: item.ruta,
    lectura: item.lectura,
    fechaContraste: item.fechaContraste,
    fechaSupervision: item.fechaSupervision,
    observacion: o.observacion,
    photoLinks: item.photoLinks,
    sheetName: o.sheetName,
  };
  return o.withImages ? generateReportePDFBlob(pdfData) : generateReportePDFSimpleBlob(pdfData);
}

/** Nombre de la carpeta (y del ZIP) de los anexos: Anexos_[CATEGORIA_]<jornada>_<aaaa-mm-dd>. */
export const carpetaAnexos = (hoja: string | null, categoria?: string) =>
  `Anexos_${categoria ? `${categoria}_` : ''}${hoja || 'Jornada'}_${new Date().toISOString().split('T')[0]}`;

export interface OpcionesAnexos {
  /** Con las fotos del suministro (lento) o sin ellas (rápido). */
  withImages: boolean;
  /** Jornada tal como va en el PDF. */
  sheetName: string;
  /** Observación del anexo (vacía = la de por defecto del PDF). */
  observacion: (item: ReporteItem) => string;
  /** N.º del anexo; por defecto el del item. */
  numero?: (item: ReporteItem, i: number) => number;
  /** Se llama antes de cada PDF (actual empieza en 1). */
  onProgress?: (actual: number, total: number, item: ReporteItem) => void;
}

/** Genera un PDF del Formato 4 por item dentro de `folder`. Un error en un PDF no corta los demás. */
export async function agregarAnexosAlZip(
  folder: JSZip,
  items: ReporteItem[],
  o: OpcionesAnexos,
): Promise<{ successCount: number; errorCount: number }> {
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    o.onProgress?.(i + 1, items.length, item);

    try {
      const result = await pdfAnexo(item, {
        withImages: o.withImages,
        sheetName: o.sheetName,
        observacion: o.observacion(item),
        numero: o.numero ? o.numero(item, i) : item.numero,
      });
      folder.file(result.fileName, result.blob);
      successCount++;
    } catch (error) {
      console.error(`Error generando PDF para ${item.suministro}:`, error);
      errorCount++;
    }

    // Pequeña pausa para no bloquear la UI
    if (i % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return { successCount, errorCount };
}
