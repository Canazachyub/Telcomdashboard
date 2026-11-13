// Arma el ZIP único de la entrega semanal:
//   Formato_4/<Anexos_… igual que Reportes>/Anexo_<suministro>.pdf
//   Formato_1A/SP-…_<proc>.pdf   ·   Formato_2A/SC-…_<suministro>.pdf
// Los PDF salen de los mismos generadores que Reportes y Formatos (no se cambian aquí).
import JSZip from 'jszip';
import { agregarAnexosAlZip, carpetaAnexos, pdfAnexo, type ReporteItem } from '../../utils/exportarAnexos';
import {
  bloques1A,
  pdf1A,
  pdf2A,
  prepararLogo,
  procedimiento,
  sinFotos,
  type Supervisada,
} from '../../utils/pdfFormatos';
import { agregarFormatosConAnexoAlZip, pdf1AConAnexo, pdf2AConAnexo } from '../../utils/formatosConAnexo';
import { brandAsset } from '../../config/brand';
import type { SupervisadaApp } from '../../services/formatosService';

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

// ------------------------------------------------------------------ estructura del ZIP (armador)
// Lo que el ZIP llevará, archivo por archivo, con los mismos nombres que ponen los generadores:
//   Formato 4: Anexo_<suministro>.pdf (pdfGenerator.ts)   ·   1A / 2A: igual que agregarFormatosAlZip.

export type GrupoPaquete = 'f4' | '1A' | '2A';

export interface ArchivoPaquete {
  /** Única dentro del paquete: f4:<N.º anexo> · 1A:<SP-…> · 2A:<id del formulario> */
  clave: string;
  grupo: GrupoPaquete;
  nombre: string;
  /** Otro archivo de la carpeta se llama igual: en el ZIP queda uno solo. */
  repetido?: boolean;
  suministro?: string;
  /** N.º del anexo (Formato 4). */
  numero?: number;
  tecnico?: string;
  /** Muestras del reporte SP (1A). */
  muestras?: number;
  noConformes: number;
  provisional: boolean;
  anexo?: ReporteItem;
  bloque?: SupervisadaApp[];
  s?: SupervisadaApp;
}

export interface CarpetaPaquete {
  grupo: GrupoPaquete;
  /** Ruta dentro del ZIP, con «/» al final. */
  ruta: string;
  titulo: string;
  /** Por qué está vacía. */
  vacia: string;
  archivos: ArchivoPaquete[];
}

/** Nombre de archivo seguro dentro del ZIP (el mismo criterio que agregarFormatosAlZip). */
const seguro = (t: string) => t.replace(/[\\/:*?"<>|]+/g, '_').trim();
const clave2A = (s: SupervisadaApp) => `2A:${s.id || s.punto.suministro}`;

export function estructuraPaquete(hoja: string, anexos: ReporteItem[], sup: SupervisadaApp[]): CarpetaPaquete[] {
  const { proc } = procedimiento(hoja);
  const vistos = new Set<string>();
  const f4: ArchivoPaquete[] = anexos.map((it) => {
    const nombre = `Anexo_${it.suministro}.pdf`;
    const repetido = vistos.has(nombre);
    vistos.add(nombre);
    return {
      clave: `f4:${it.numero}`,
      grupo: 'f4',
      nombre,
      repetido,
      suministro: String(it.suministro),
      numero: it.numero,
      tecnico: it.tecnico,
      noConformes: 0,
      provisional: false,
      anexo: it,
    };
  });
  const sp: ArchivoPaquete[] = (bloques1A(sup) as [string, SupervisadaApp[]][]).map(([num, b]) => ({
    clave: `1A:${num}`,
    grupo: '1A',
    nombre: `${seguro(`${num}_${proc}`)}.pdf`,
    muestras: b.length,
    noConformes: b.filter((s) => !s.conforme).length,
    provisional: b.some((s) => s.provisional),
    bloque: b,
  }));
  const sc: ArchivoPaquete[] = sup
    .filter((s) => s.tipo === '2A')
    .sort((a, b) => a.reporte.localeCompare(b.reporte))
    .map((s) => ({
      clave: clave2A(s),
      grupo: '2A',
      nombre: `${seguro(`${s.reporte}_${s.punto.suministro}`)}.pdf`,
      suministro: String(s.punto.suministro),
      tecnico: s.tecnico,
      noConformes: s.conforme ? 0 : 1,
      provisional: !!s.provisional,
      s,
    }));
  return [
    {
      grupo: '1A',
      ruta: 'Formato_1A/',
      titulo: 'Formato 1A · reportes SP',
      vacia: 'Sin formularios 1A en esta semana.',
      archivos: sp,
    },
    {
      grupo: '2A',
      ruta: 'Formato_2A/',
      titulo: 'Formato 2A · reportes SC',
      vacia: 'Sin formularios 2A (coincidentes) en esta semana.',
      archivos: sc,
    },
    {
      grupo: 'f4',
      ruta: `Formato_4/${carpetaAnexos(hoja)}/`,
      titulo: 'Formato 4 · anexos sueltos',
      vacia: 'No hay suministros con lectura en esta semana.',
      archivos: f4,
    },
  ];
}

/** Formularios que van al ZIP: los 1A de los reportes SP marcados y los 2A marcados. */
export function supervisadasElegidas(sup: SupervisadaApp[], elegidas: Set<string>): SupervisadaApp[] {
  return sup.filter((s) => (s.tipo === '1A' ? elegidas.has(`1A:${s.reporte}`) : elegidas.has(clave2A(s))));
}

export interface PdfArmado {
  url: string;
  paginas?: number;
  horizontal: boolean;
}

/**
 * Arma un solo PDF del paquete, exactamente como irá en el ZIP (mismos generadores y opciones),
 * para la vista previa. Devuelve una URL blob: quien la usa la libera con URL.revokeObjectURL.
 */
export async function armarArchivo(
  a: ArchivoPaquete,
  hoja: string,
  o: Pick<OpcionesPaquete, 'f4Fotos' | 'fotos' | 'anexarF4'>,
  onTexto: (t: string) => void,
): Promise<PdfArmado> {
  if (a.grupo === 'f4' && a.anexo) {
    onTexto(`Formato 4 · ${a.anexo.suministro}${o.f4Fotos ? ' (con fotos)' : ''}…`);
    const { blob } = await pdfAnexo(a.anexo, {
      withImages: o.f4Fotos,
      sheetName: hoja || 'Sin Jornada',
      observacion: a.anexo.point.notas?.trim() || '',
    });
    let paginas: number | undefined;
    let horizontal = false;
    try {
      const { PDFDocument } = await import('pdf-lib');
      const d = await PDFDocument.load(await blob.arrayBuffer());
      paginas = d.getPageCount();
      const { width, height } = d.getPage(0).getSize();
      horizontal = width > height;
    } catch {
      /* solo es información para la vista */
    }
    return { url: URL.createObjectURL(blob), paginas, horizontal };
  }

  await prepararLogo(brandAsset('logo-horizontal.webp'));
  const f = <T extends Supervisada>(l: T[]): T[] => (o.fotos ? l : sinFotos(l));
  const opAnexo = { observacion: (p: Supervisada['punto']) => p.notas?.trim() || '', onProgreso: onTexto };
  if (a.grupo === '1A' && a.bloque) {
    if (o.anexarF4) {
      const r = await pdf1AConAnexo(f(a.bloque), hoja, opAnexo);
      return { url: URL.createObjectURL(r.blob), paginas: r.paginas, horizontal: r.horizontal };
    }
    onTexto(`${a.bloque[0]?.reporte ?? ''} · Formato 1A…`);
    return deJsPdf(await pdf1A(f(a.bloque), hoja));
  }
  if (a.grupo === '2A' && a.s) {
    const s = f([a.s])[0];
    if (o.anexarF4) {
      const r = await pdf2AConAnexo(s, hoja, opAnexo);
      return { url: URL.createObjectURL(r.blob), paginas: r.paginas, horizontal: r.horizontal };
    }
    onTexto(`${s.reporte} · Formato 2A…`);
    return deJsPdf(await pdf2A(s, hoja));
  }
  throw new Error('Archivo desconocido');
}

function deJsPdf(doc: Awaited<ReturnType<typeof pdf1A>>): PdfArmado {
  const t = doc.internal.pageSize;
  return {
    url: URL.createObjectURL(doc.output('blob')),
    paginas: doc.getNumberOfPages(),
    horizontal: t.getWidth() > t.getHeight(),
  };
}
