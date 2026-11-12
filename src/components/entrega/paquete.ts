// Arma el ZIP único de la entrega semanal:
//   Formato_4/<Anexos_… igual que Reportes>/Anexo_<suministro>.pdf
//   Formato_1A/SP-…_<proc>.pdf   ·   Formato_2A/SC-…_<suministro>.pdf
// Los PDF salen de los mismos generadores que Reportes y Formatos (no se cambian aquí).
import JSZip from 'jszip';
import { agregarAnexosAlZip, carpetaAnexos, type ReporteItem } from '../../utils/exportarAnexos';
import { bloques1A, prepararLogo, type Supervisada } from '../../utils/pdfFormatos';
import { agregarFormatosConAnexoAlZip } from '../../utils/formatosConAnexo';
import { brandAsset } from '../../config/brand';

export interface OpcionesPaquete {
  f4: boolean;
  /** Formato 4 con las fotos del suministro (lento) o sin ellas (rápido). */
  f4Fotos: boolean;
  f1A: boolean;
  f2A: boolean;
  /** Evidencias de los NO y registro fotográfico adicional en los 1A / 2A. */
  fotos: boolean;
  /** Formato 4 de cada suministro dentro del PDF de su 1A/2A (con fotos). */
  anexarF4: boolean;
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
  // Reparto de la barra: carpeta Formato 4, luego 1A/2A, hasta 85 %; comprimir hasta 100 %.
  // Con el Formato 4 anexado, los 1A/2A son lo más lento (cada suministro lleva su Formato 4 con fotos).
  const finF4 = !con1A2A ? 85 : !(o.f4 && anexos.length) ? 0 : o.anexarF4 ? 35 : 70;

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
      // Suministros cuyo Formato 4 se anexa (para la barra de avance)
      const total =
        (o.f1A ? bloques1A(supervisadas).reduce((t, [, b]) => t + b.length, 0) : 0) +
        (o.f2A ? supervisadas.filter((s) => s.tipo === '2A').length : 0);
      let hechos = 0;
      const n = await agregarFormatosConAnexoAlZip(
        zip,
        supervisadas,
        hoja,
        { f1A: o.f1A, f2A: o.f2A, fotos: o.fotos, anexarF4: o.anexarF4 },
        {
          // Misma observación que la carpeta Formato 4 (la de la hoja)
          observacion: (p) => p.notas?.trim() || '',
          onProgreso: (texto) => {
            if (texto.includes('Formato 4 de')) hechos++;
            onProgreso({
              pct: finF4 + Math.round((Math.min(hechos, total) / Math.max(1, total)) * (85 - finF4)),
              texto,
            });
          },
        },
      );
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
