// Arma el ZIP único de la entrega semanal:
//   Formato_4/<Anexos_… igual que Reportes>/Anexo_<suministro>.pdf
//   Formato_1A/SP-…_<proc>.pdf   ·   Formato_2A/SC-…_<suministro>.pdf
// Los PDF salen de los mismos generadores que Reportes y Formatos (no se cambian aquí).
import JSZip from 'jszip';
import { agregarAnexosAlZip, carpetaAnexos, type ReporteItem } from '../../utils/exportarAnexos';
import { agregarFormatosAlZip, prepararLogo, type Supervisada } from '../../utils/pdfFormatos';
import { brandAsset } from '../../config/brand';

export interface OpcionesPaquete {
  f4: boolean;
  /** Formato 4 con las fotos del suministro (lento) o sin ellas (rápido). */
  f4Fotos: boolean;
  f1A: boolean;
  f2A: boolean;
  /** Evidencias de los NO y registro fotográfico adicional en los 1A / 2A. */
  fotos: boolean;
}

export interface Progreso {
  /** 0 a 100 */
  pct: number;
  texto: string;
}

export interface ResultadoPaquete {
  blob: Blob;
  anexos: number;
  erroresAnexos: number;
  n1A: number;
  n2A: number;
  /** Los 1A / 2A no se pudieron generar (el resto sí está en el ZIP). */
  errorFormatos?: string;
}

export async function armarPaquete(
  hoja: string,
  anexos: ReporteItem[],
  supervisadas: Supervisada[],
  o: OpcionesPaquete,
  onProgreso: (p: Progreso) => void,
): Promise<ResultadoPaquete> {
  const zip = new JSZip();
  const res: ResultadoPaquete = { blob: new Blob(), anexos: 0, erroresAnexos: 0, n1A: 0, n2A: 0 };
  const con1A2A = o.f1A || o.f2A;
  // Reparto de la barra: Formato 4 hasta 70 %, 1A/2A hasta 85 %, comprimir hasta 100 %
  const finF4 = con1A2A ? 70 : 85;

  if (o.f4 && anexos.length) {
    const carpeta = zip.folder('Formato_4')!.folder(carpetaAnexos(hoja))!;
    const r = await agregarAnexosAlZip(carpeta, anexos, {
      withImages: o.f4Fotos,
      sheetName: hoja || 'Sin Jornada',
      // La observación registrada en la hoja (la misma con la que abre Reportes)
      observacion: (item) => item.point.notas?.trim() || '',
      onProgress: (actual, total, item) =>
        onProgreso({
          pct: Math.round(((actual - 1) / total) * finF4),
          texto: `Formato 4 · ${item.suministro} (${actual}/${total})`,
        }),
    });
    res.anexos = r.successCount;
    res.erroresAnexos = r.errorCount;
  }

  if (con1A2A && supervisadas.length) {
    onProgreso({ pct: finF4, texto: 'Formatos 1A / 2A…' });
    try {
      await prepararLogo(brandAsset('logo-horizontal.webp'));
      const n = await agregarFormatosAlZip(zip, supervisadas, hoja, { f1A: o.f1A, f2A: o.f2A, fotos: o.fotos });
      res.n1A = n.n1A;
      res.n2A = n.n2A;
    } catch (e) {
      console.error('Error generando Formatos 1A / 2A:', e);
      res.errorFormatos = (e as Error).message || 'error desconocido';
    }
  }

  onProgreso({ pct: 85, texto: 'Comprimiendo…' });
  res.blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (m) =>
    onProgreso({ pct: 85 + Math.round(m.percent * 0.15), texto: `Comprimiendo: ${Math.round(m.percent)}%` }),
  );
  onProgreso({ pct: 100, texto: 'Listo' });
  return res;
}

/** Descarga un Blob con el nombre dado. */
export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
