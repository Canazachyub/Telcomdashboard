// Formato 1A / 2A con el Formato 4 de cada suministro anexado dentro del mismo PDF.
//
// Orden de las páginas:
//   1) la hoja del formato (pdf1A / pdf2A, sin cambios),
//   2) el Formato 4 de cada suministro supervisado, en el orden de las columnas del 1A (el del
//      bloque) o el del suministro del 2A, generado igual que en Reportes (pdfGenerator.ts, N.º =
//      muestra, observación de la hoja),
//   3) al final, las páginas propias del 1A/2A (evidencias y registro fotográfico).
//
// Cómo se separan las páginas del 1A/2A: se arma el PDF de siempre y se corta.
//   - Si el formulario lleva fotos de evidencia (tieneFotosEvidencia), la hoja del formato es solo
//     la página 1 (lo que no entra en ella sigue arriba de la primera página de evidencias); de la 2
//     en adelante es el anexo de evidencias, que pasa al final.
//   - Si no lleva fotos, todas sus páginas son del formato (la 2+ son «hojas adicionales» de
//     observaciones que continúan la página 1) y el Formato 4 va después de todas.
// La unión la hace pdf-lib (import dinámico: solo se descarga al anexar). Los PDF del Formato 4 y
// del 1A/2A no se tocan, solo se copian sus páginas.
import type JSZip from 'jszip';
import type { jsPDF } from 'jspdf';
import type { GpsPointExtended } from '../types/point';
import { itemDePunto, pdfAnexo } from './exportarAnexos';
import {
  agregarFormatosAlZip,
  bloques1A,
  pdf1A,
  pdf2A,
  procedimiento,
  sinFotos,
  tieneFotosEvidencia,
  type Supervisada,
} from './pdfFormatos';

export interface OpcionesAnexo {
  /** Observación del Formato 4 de un punto (por defecto, la de la hoja: notas). */
  observacion?: (p: GpsPointExtended) => string;
  /** Formato 4 con sus fotos (por defecto sí: es el reporte fotográfico). */
  f4Fotos?: boolean;
  /** Texto de avance (el Formato 4 con fotos tarda). */
  onProgreso?: (texto: string) => void;
  /** Caché de Formato 4 por suministro dentro de una misma exportación. */
  cache?: Map<string, Promise<Blob>>;
}

export interface PdfUnido {
  blob: Blob;
  paginas: number;
  /** La primera página es horizontal (1A). */
  horizontal: boolean;
}

// ------------------------------------------------------------------ preferencia del usuario

const CLAVE = 'telcom-anexar-f4';

/** «Anexar el Formato 4 de cada suministro» (por defecto activado). */
export function leerAnexarF4(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== 'no';
  } catch {
    return true;
  }
}

export function guardarAnexarF4(v: boolean) {
  try {
    localStorage.setItem(CLAVE, v ? 'si' : 'no');
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
}

// ------------------------------------------------------------------ armado

const observacionHoja = (p: GpsPointExtended) => p.notas?.trim() || '';

function formato4(s: Supervisada, hoja: string, o: OpcionesAnexo): Promise<Blob> {
  const clave = `${String(s.punto.suministro).trim()}#${s.muestra}`;
  const previo = o.cache?.get(clave);
  if (previo) return previo;
  const p = pdfAnexo(itemDePunto(s.punto, s.muestra), {
    withImages: o.f4Fotos !== false,
    sheetName: hoja || 'Sin Jornada',
    observacion: (o.observacion ?? observacionHoja)(s.punto),
    numero: s.muestra,
  }).then((r) => r.blob);
  o.cache?.set(clave, p);
  // Si falla, que la próxima vez se reintente
  p.catch(() => o.cache?.delete(clave));
  return p;
}

/** Une: páginas [0, corte) del formato + cada Formato 4 + páginas [corte, fin) del formato. */
async function unir(doc: jsPDF, corte: number, anexos: Blob[], titulo: string): Promise<PdfUnido> {
  const { PDFDocument } = await import('pdf-lib');
  const base = await PDFDocument.load(doc.output('arraybuffer'));
  const out = await PDFDocument.create();
  const total = base.getPageCount();
  const corteReal = Math.max(1, Math.min(corte, total));
  const idx = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k);
  for (const pg of await out.copyPages(base, idx(0, corteReal))) out.addPage(pg);
  for (const b of anexos) {
    const f4 = await PDFDocument.load(await b.arrayBuffer());
    for (const pg of await out.copyPages(f4, f4.getPageIndices())) out.addPage(pg);
  }
  for (const pg of await out.copyPages(base, idx(corteReal, total))) out.addPage(pg);
  out.setTitle(titulo);
  out.setProducer('TELCOM ENERGY');
  const bytes = await out.save();
  const { width, height } = out.getPage(0).getSize();
  return {
    blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    paginas: out.getPageCount(),
    horizontal: width > height,
  };
}

/** Páginas de la hoja del formato (ver la explicación arriba). */
const paginasFormato = (doc: jsPDF, conEvidencias: boolean) => (conEvidencias ? 1 : doc.getNumberOfPages());

/** 1A (un reporte SP) + el Formato 4 de cada muestra en el orden de las columnas + evidencias. */
export async function pdf1AConAnexo(bloque: Supervisada[], hoja: string, o: OpcionesAnexo = {}): Promise<PdfUnido> {
  const numero = bloque[0]?.reporte ?? '';
  o.onProgreso?.(`${numero} · Formato 1A…`);
  const doc = await pdf1A(bloque, hoja);
  const anexos: Blob[] = [];
  for (let k = 0; k < bloque.length; k++) {
    o.onProgreso?.(`${numero} · Formato 4 de ${bloque[k].punto.suministro} (${k + 1}/${bloque.length})`);
    anexos.push(await formato4(bloque[k], hoja, o));
  }
  o.onProgreso?.(`${numero} · uniendo páginas…`);
  return unir(doc, paginasFormato(doc, bloque.some(tieneFotosEvidencia)), anexos, `${numero} · Formato 1A`);
}

/** 2A (un reporte SC) + el Formato 4 de su suministro + evidencias. */
export async function pdf2AConAnexo(s: Supervisada, hoja: string, o: OpcionesAnexo = {}): Promise<PdfUnido> {
  o.onProgreso?.(`${s.reporte} · Formato 2A…`);
  const doc = await pdf2A(s, hoja);
  o.onProgreso?.(`${s.reporte} · Formato 4 de ${s.punto.suministro}`);
  const anexo = await formato4(s, hoja, o);
  o.onProgreso?.(`${s.reporte} · uniendo páginas…`);
  return unir(doc, paginasFormato(doc, tieneFotosEvidencia(s)), [anexo], `${s.reporte} · Formato 2A`);
}

/** Nombre de archivo seguro dentro del ZIP (el mismo criterio que agregarFormatosAlZip). */
const seguro = (t: string) => t.replace(/[\\/:*?"<>|]+/g, '_').trim();

/**
 * Igual que agregarFormatosAlZip (mismas carpetas y nombres: Formato_1A/, Formato_2A/), pero con el
 * Formato 4 anexado dentro de cada PDF cuando `anexarF4` está activo. Sin `anexarF4` llama a
 * agregarFormatosAlZip tal cual (resultado idéntico al de antes).
 */
export async function agregarFormatosConAnexoAlZip(
  zip: JSZip,
  lista: Supervisada[],
  hoja: string,
  incluir: { f1A: boolean; f2A: boolean; fotos?: boolean; anexarF4?: boolean },
  o: OpcionesAnexo = {},
): Promise<{ n1A: number; n2A: number }> {
  if (!incluir.anexarF4) return agregarFormatosAlZip(zip, lista, hoja, incluir);
  const { proc } = procedimiento(hoja);
  if (incluir.fotos === false) lista = sinFotos(lista);
  const op: OpcionesAnexo = { ...o, cache: o.cache ?? new Map() };
  let n1A = 0,
    n2A = 0;
  if (incluir.f1A) {
    for (const [num, b] of bloques1A(lista)) {
      zip.file(`Formato_1A/${seguro(`${num}_${proc}`)}.pdf`, (await pdf1AConAnexo(b, hoja, op)).blob);
      n1A++;
    }
  }
  if (incluir.f2A) {
    const coincidentes = lista.filter((s) => s.tipo === '2A').sort((a, b) => a.reporte.localeCompare(b.reporte));
    for (const s of coincidentes) {
      zip.file(
        `Formato_2A/${seguro(`${s.reporte}_${s.punto.suministro}`)}.pdf`,
        (await pdf2AConAnexo(s, hoja, op)).blob,
      );
      n2A++;
    }
  }
  return { n1A, n2A };
}
