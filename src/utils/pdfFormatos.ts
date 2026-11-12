// Formatos 1A (supervisión posterior) y 2A (supervisión coincidente) del contrato N° 111-2026 (ELSE).
// Tipos, preguntas, numeración SP / SC y los PDF. Lo usan Reportes (con las respuestas reales que
// manda la app, ver services/formatosService.ts) y el prototipo de formatos (con respuestas simuladas).
// El Formato 4 de producción NO está aquí: sigue en utils/pdfGenerator.ts, sin cambios.
import { jsPDF } from 'jspdf';
import type JSZip from 'jszip';
import type { GpsPointExtended } from '../types/point';
import { REPORT_CONFIG } from '../config/report';
import { loadImageWithCache } from './imageCache';

export type Resp = 'SI' | 'NO' | 'N.A.';

export const PREGUNTAS_1A: { id: string; texto: string }[] = [
  { id: 'sticker_ubicado', texto: 'Medidor cuenta con sticker de contraste correctamente ubicado' },
  { id: 'sticker_llenado', texto: 'Sticker de contraste está correctamente llenado, de manera legible y sin borrones' },
  { id: 'sticker_plumon', texto: 'Sticker de contraste está llenado con plumón indeleble' },
  { id: 'sticker_color', texto: 'Color del Sticker de contraste corresponde al aprobado para el periodo' },
  { id: 'precinto_bornera', texto: 'Precinto de bornera correctamente instalado (cuando sea visible)' },
  { id: 'precinto_caja', texto: 'Precinto de caja portamedidor correctamente instalado (en caso corresponda)' },
  { id: 'caja_cerrada', texto: 'Caja portamedidor cerrada y debidamente asegurada' },
  { id: 'fecha_concordante', texto: 'Fecha de contraste registrada en sticker es concordante con fecha programada' },
];

export const PREGUNTAS_2A: { bloque: string; items: string[] }[] = [
  {
    bloque: 'EN CUANTO A LA ADECUADA GESTIÓN DE LAS ACTIVIDADES DE CONTRASTE',
    items: [
      'Cuenta con Orden de trabajo para el suministro intervenido y supervisado',
      'La intervención corresponde a la fecha programada',
      'El Grupo de Trabajo se encuentra completo (01 Técnico Inspector y 01 Técnico de apoyo)',
      'Se señalizó y/o demarcó la zona de trabajo',
      'Personal operativo registrado y autorizado ante ELSE',
      "Personal operativo cuenta con EPP's y uniforme completos y en buen estado",
      'Personal operativo cuenta con FOTOCHEK de identificación en buen estado',
      'Personal operativo cuenta con sus herramientas completas y en buen estado',
      'Personal operativo cuenta con equipo móvil operativo y en buen estado',
      'Equipos de contraste (patrón y carga) en buen estado y con calibración vigente',
      'Cuenta con su "Procedimiento técnico de contrastación en campo"',
      'Unidad vehicular en buen estado y cumple con las especificaciones',
      'Existen otras observaciones y/o incumplimientos',
    ],
  },
  {
    bloque: 'PROCEDIMIENTO DE TRABAJO',
    items: [
      'Se verificó si las Pruebas de vacío y de contraste se realizaron correctamente',
      'Resultados de los ensayos de contrastación (APRUEBA: SI/NO)',
      'Se verificó el correcto uso de Equipos y Herramientas',
      'Se verificó el correcto pegado y llenado del sticker de contraste',
      'Se verificó el uso de plumón indeleble',
      'Se verificó el correcto traslado del equipo patrón y carga',
      'Se verificó el correcto llenado del Informe de Inspección de contrastación',
    ],
  },
  {
    bloque: 'CERTIFICADOS',
    items: [
      'Se verificó certificado de calibración vigente del equipo Patrón',
      'Se verificó certificado de calibración vigente de la carga inductiva',
    ],
  },
  {
    bloque: 'CONFORMIDAD',
    items: [
      'Se verificó orden y limpieza en el lugar de trabajo al término de la actividad',
      'Se verificó el correcto cumplimiento del procedimiento de trabajo',
      'Trabajo ejecutado CONFORME',
    ],
  },
];

/** Items del 2A en orden, con id estable. «Existen otras…» es la única que va en SI cuando hay problema. */
export const ITEMS_2A = PREGUNTAS_2A.flatMap((b, bi) =>
  b.items.map((texto, k) => ({ id: `${bi}_${k}`, texto, bloque: b.bloque })),
);
export const ID_OTRAS = ITEMS_2A.find((i) => i.texto.startsWith('Existen otras'))!.id;
export const ID_CONFORME_2A = ITEMS_2A.find((i) => i.texto.includes('CONFORME'))!.id;

/** Foto elegida para el Formato 4 del prototipo: de Drive (url) o subida desde la PC (data). */
export interface FotoSel {
  url?: string;
  data?: string;
  nombre?: string;
  /** Qué muestra la foto. Con la app nueva llega solo; las antiguas las clasifica el supervisor. */
  rol?: string;
}

export interface Supervisada {
  punto: GpsPointExtended;
  muestra: number;
  tipo: '1A' | '2A';
  fecha: Date | null;
  fechaTxt: string;
  horaTxt: string;
  tecnico: string;
  /** Nombre completo del supervisor de campo (opcional). Si falta, el PDF imprime `tecnico` (p. ej. «Yub»). */
  tecnicoNombre?: string;
  resp: Record<string, Resp>;
  /** Respuestas del 2A (solo coincidentes), con los ids de ITEMS_2A. */
  resp2A: Record<string, Resp>;
  /** Vacío: la app no mandó la respuesta. */
  usuario: Resp | '';
  /** Ya se notificó la observación a la contratista. */
  avisado: boolean;
  fechaSticker: string;
  lectura: string;
  conforme: boolean;
  observacion: string;
  /** Respuestas inventadas (no vienen de la app). El PDF lo dice en el pie. */
  simulado: boolean;
  reporte: string;
  /** El número de reporte aún no lo asignó el servidor: el PDF muestra «Número provisional». */
  provisional?: boolean;
  /** Certificados del 2A tal como los escribió el técnico (N° · fecha). */
  patron?: string;
  carga?: string;
  /** Fotos elegidas y su orden en el Formato 4 del prototipo (si no, las 4 primeras). */
  fotosSel?: FotoSel[];
  /** Fotos de lo que NO se cumplió (rol «Evidencia · <idPregunta>»), por ítem. Van desde la página 2. */
  evidencias?: Evidencia[];
  fotosFaltan: number;
  sinFormulario: boolean;
}

/** Una foto de evidencia. `url` vacía: no se encontró en la hoja (se dibuja un recuadro de aviso). */
export interface FotoEvidencia {
  url?: string;
  /** Timestamp que mandó la app (el mismo de savePhoto). */
  timestamp: string;
  /** Rótulo de la foto (qué muestra). Opcional: sin él, el pie dice «Evidencia». */
  etiqueta?: string;
}

/** Fotos de evidencia de un ítem incumplido (o de la observación en general). */
export interface Evidencia {
  /** Id de la pregunta en el PDF (1A: el de la app; 2A: el de ITEMS_2A). Vacío: evidencia general. */
  pregunta: string;
  /** Texto del ítem tal como sale en el formato. */
  texto: string;
  fotos: FotoEvidencia[];
  /** Foto adicional (registro fotográfico de un ítem que no está en NO): va con rótulo azul, no «NO CUMPLE». */
  adicional?: boolean;
}

/** Texto de la fila «usuario confirma» del 1A (no está en PREGUNTAS_1A: va aparte en la tabla). */
export const TEXTO_USUARIO_1A =
  'Usuario confirma recepción de notificación previa y de la copia de Certificado de Contraste';

const MESES: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

/** «02 de Noviembre de 2026», «10/11/2026 15:59:56» o ISO → Date. */
export function parseFecha(s: string | null | undefined): Date | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  if (m) {
    const mes = MESES[m[2].toLowerCase()];
    if (mes !== undefined) return new Date(Number(m[3]), mes, Number(m[1]));
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dd = (n: number) => String(n).padStart(2, '0');
export const fmtFecha = (d: Date | null) => (d ? `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}` : '—');
export const fmtHora = (d: Date | null) => (d ? `${dd(d.getHours())}:${dd(d.getMinutes())}` : '—');

export function procedimiento(hoja: string): { proc: 'P-227' | 'NTCSE-U' | 'NTCSE-R'; sector: string } {
  const h = hoja.toUpperCase();
  const proc = /NTCSE-?R/.test(h) ? 'NTCSE-R' : /NTCSE/.test(h) ? 'NTCSE-U' : 'P-227';
  const sectores: [string, string][] = [
    ['CUS', 'CUSCO'],
    ['ABA', 'ABANCAY'],
    ['AND', 'ANDAHUAYLAS'],
    ['VILC', 'VILCANOTA'],
    ['ANT', 'ANTA'],
    ['URU', 'URUBAMBA'],
    ['URC', 'URCOS'],
    ['QUILL', 'QUILLABAMBA'],
    ['PM', 'PUERTO MALDONADO'],
  ];
  const s = sectores.filter(([k]) => new RegExp(`(^|[^A-Z])${k}([^A-Z]|$)`).test(h)).map(([, v]) => v);
  return { proc, sector: s.join(' / ') || '—' };
}

/** Conforme = todo en SI (en 2A no cuentan «Existen otras…» ni la conformidad final). */
export function esConforme(s: Pick<Supervisada, 'tipo' | 'resp' | 'resp2A'>): boolean {
  if (s.tipo === '1A') return Object.values(s.resp).every((r) => r === 'SI');
  return ITEMS_2A.every((q) => q.id === ID_OTRAS || q.id === ID_CONFORME_2A || s.resp2A[q.id] === 'SI');
}

/** Numeración: 1A en bloques de 10 por fecha; 2A uno por suministro. Modifica y devuelve la lista. */
export function numerar(lista: Supervisada[], anio = 2026): Supervisada[] {
  const ord = (a: Supervisada, b: Supervisada) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0);
  lista
    .filter((s) => s.tipo === '1A')
    .sort(ord)
    .forEach((s, k) => (s.reporte = `SP-${anio}-${String(Math.floor(k / 10) + 1).padStart(3, '0')}`));
  lista
    .filter((s) => s.tipo === '2A')
    .sort(ord)
    .forEach((s, k) => (s.reporte = `SC-${anio}-${String(k + 1).padStart(3, '0')}`));
  return lista;
}

/** Los 1A agrupados por reporte (SP-…), en orden de número y cada bloque por fecha. */
export function bloques1A(lista: Supervisada[]): [string, Supervisada[]][] {
  const m = new Map<string, Supervisada[]>();
  const ord = [...lista].sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0));
  for (const s of ord.filter((x) => x.tipo === '1A')) m.set(s.reporte, [...(m.get(s.reporte) ?? []), s]);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// ------------------------------------------------------------------ PDF

const LOGO_TXT = 'TELCOM ENERGY';
const MARCA_SIMULADO = 'PROTOTIPO: respuestas simuladas';

/** Logo ovalado (public/brand/logo-horizontal.webp) ya convertido a JPEG liviano para jsPDF. */
let LOGO: { data: string; w: number; h: number } | null = null;

/**
 * Prepara el logo una sola vez. Se reduce a 480 px de ancho y va en JPEG sobre fondo blanco: el PNG
 * a tamaño completo pesaba ~950 KB por PDF (jsPDF lo guardaba sin comprimir).
 */
export async function prepararLogo(url: string): Promise<void> {
  if (LOGO) return;
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 480 / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    LOGO = { data: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height };
  } catch {
    LOGO = null; // sin logo: la cabecera usa el texto
  }
}

// ---------- Texto que siempre cabe en su caja

/** Alto de una línea (mm) para un tamaño de letra en puntos. */
const altoLinea = (fs: number, factor = 1.18) => fs * 0.3528 * factor;

/**
 * Busca el tamaño de letra más grande (de `fs` a `min`) con el que el texto entra en `ancho` × `alto`,
 * partiéndolo en líneas si hace falta. Si ni con la letra mínima entra, recorta la última línea con «…».
 * Deja puesta la fuente con el tamaño elegido.
 */
function ajustar(
  doc: jsPDF,
  txt: string,
  ancho: number,
  alto: number,
  fs: number,
  min = 4.5,
  estilo: 'normal' | 'bold' | 'italic' = 'normal',
): { fs: number; lineas: string[]; lh: number } {
  doc.setFont('helvetica', estilo);
  const t = txt.replace(/\s+/g, ' ').trim();
  for (let f = fs; f >= min - 0.001; f -= 0.25) {
    doc.setFontSize(f);
    const lh = altoLinea(f);
    if (doc.getTextWidth(t) <= ancho) return { fs: f, lineas: [t], lh };
    const lineas = doc.splitTextToSize(t, ancho) as string[];
    if (lineas.length * lh <= alto && lineas.every((l) => doc.getTextWidth(l) <= ancho + 0.01))
      return { fs: f, lineas, lh };
  }
  // Último recurso (solo campos de cabecera con textos absurdamente largos): recortar con «…»
  doc.setFontSize(min);
  const lh = altoLinea(min);
  const caben = Math.max(1, Math.floor(alto / lh));
  const lineas = (doc.splitTextToSize(t, ancho) as string[]).slice(0, caben);
  let ult = lineas[lineas.length - 1] + '…';
  while (ult.length > 1 && doc.getTextWidth(ult) > ancho) ult = ult.slice(0, -2) + '…';
  lineas[lineas.length - 1] = ult;
  return { fs: min, lineas, lh };
}

/** Escribe un texto dentro de un recuadro (x, y, w, h), centrado en vertical, achicando o partiendo. */
function textoCaja(
  doc: jsPDF,
  txt: string,
  x: number,
  y: number,
  w: number,
  h: number,
  o: { fs?: number; min?: number; estilo?: 'normal' | 'bold' | 'italic'; centro?: boolean; pad?: number } = {},
) {
  const pad = o.pad ?? 1.2;
  const { lineas, lh } = ajustar(doc, txt, w - 2 * pad, h - 0.6, o.fs ?? 7.5, o.min ?? 4.5, o.estilo);
  const y0 = y + h / 2 - ((lineas.length - 1) * lh) / 2;
  lineas.forEach((l, k) =>
    doc.text(l, o.centro ? x + w / 2 : x + pad, y0 + k * lh, {
      baseline: 'middle',
      ...(o.centro ? { align: 'center' as const } : {}),
    }),
  );
}

/** Rótulo en negrita seguido de su recuadro con el valor (que se ajusta al recuadro). */
function campo(doc: jsPDF, rotulo: string, valor: string, x: number, y: number, xCaja: number, wCaja: number, h = 5.6) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0);
  doc.text(rotulo, x, y + h / 2, { baseline: 'middle' });
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(xCaja, y, wCaja, h);
  textoCaja(doc, valor || '—', xCaja, y, wCaja, h, { fs: 7.5, min: 4.5 });
}

/** «LABEL [x]  LABEL [ ]…» en una fila, sin que las casillas pisen el texto. Devuelve la x final. */
function opcionesCasilla(doc: jsPDF, x: number, yBase: number, ops: [string, boolean][], sep = 7): number {
  doc.setFontSize(7.5);
  for (const [t, v] of ops) {
    doc.setFont('helvetica', 'bold');
    doc.text(t, x, yBase);
    x += doc.getTextWidth(t) + 1.8;
    casilla(doc, x, yBase + 0.3, v);
    x += 4.2 + sep;
  }
  return x;
}

/** Texto en una línea con tramos en negrita marcados con **…** (como la plantilla). */
function textoMixto(doc: jsPDF, txt: string, x: number, y: number) {
  txt.split(/\*\*(.+?)\*\*/).forEach((tramo, k) => {
    if (!tramo) return;
    doc.setFont('helvetica', k % 2 ? 'bold' : 'normal');
    doc.text(tramo, x, y, { baseline: 'middle' });
    // Los visores dibujan Helvetica un poco más ancha que la métrica de jsPDF: el espacio entre un tramo
    // normal y uno en negrita se agranda un poco para que no se vean pegados («ejecutado CONFORME»)
    const espacio = doc.getTextWidth('a a') - doc.getTextWidth('aa');
    const bordes = tramo.length - tramo.trim().length;
    x += doc.getTextWidth(tramo.trim()) + bordes * espacio * 1.8;
  });
  doc.setFont('helvetica', 'normal');
}
const sinMarcas = (t: string) => t.replace(/\*\*/g, '');

// ---------- Cabecera y casillas (las usa también el Formato 4 del prototipo)

export function cabecera(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  titulo: string[],
  numero: string,
  logoW = 46,
  numW = 46,
  provisional = false,
) {
  const hgt = 20;
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(x, y, w, hgt);
  doc.line(x + logoW, y, x + logoW, y + hgt);
  doc.line(x + w - numW, y, x + w - numW, y + hgt);
  if (LOGO) {
    // Logo ovalado de la empresa, centrado y sin deformar (alias: una sola copia aunque haya varias páginas)
    const maxW = logoW - 4,
      maxH = hgt - 3;
    const k = Math.min(maxW / LOGO.w, maxH / LOGO.h);
    const lw = LOGO.w * k,
      lh = LOGO.h * k;
    doc.addImage(LOGO.data, 'JPEG', x + (logoW - lw) / 2, y + (hgt - lh) / 2, lw, lh, 'logo-telcom');
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    doc.setFontSize(11);
    doc.text(LOGO_TXT, x + logoW / 2, y + 9, { align: 'center' });
    doc.setTextColor(60);
    doc.setFontSize(6.5);
    doc.text('Ingeniería Telcom E.I.R.L.', x + logoW / 2, y + 13.5, { align: 'center' });
  }
  doc.setTextColor(0);
  // Título: cada renglón se achica si no entra entre el logo y el número
  const anchoT = w - logoW - numW - 4;
  titulo.forEach((t, k) => {
    const { fs } = ajustar(doc, t, anchoT, 10, 9.5, 6, 'bold');
    doc.setFontSize(fs);
    doc.text(t, x + logoW + (w - logoW - numW) / 2, y + 6.5 + k * 4.4, { align: 'center' });
  });
  const cx = x + w - numW / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('REPORTE N°', cx, provisional ? y + 6.5 : y + 8, { align: 'center' });
  doc.setTextColor(29, 78, 216);
  const { fs } = ajustar(doc, numero || '—', numW - 4, 6, 10.5, 6, 'bold');
  doc.setFontSize(fs);
  doc.text(numero || '—', cx, provisional ? y + 12.5 : y + 14.5, { align: 'center' });
  if (provisional) {
    // El servidor todavía no confirmó el número: se avisa en chico, sin tapar el número
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6);
    doc.setTextColor(180, 83, 9);
    doc.text('Número provisional', cx, y + 17.2, { align: 'center' });
  }
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
}

export function casilla(doc: jsPDF, x: number, y: number, marcada: boolean) {
  doc.roundedRect(x, y - 3, 4.2, 3.6, 0.6, 0.6);
  if (marcada) {
    // La X va en negrita, pero se devuelve la fuente que había (antes quedaba todo en negrita)
    const f = doc.getFont();
    doc.setFont('helvetica', 'bold');
    doc.text('X', x + 1.1, y - 0.1);
    doc.setFont(f.fontName, f.fontStyle);
  }
}

// ---------- Pie de página (en todas las páginas, al final)

/** Nombre del supervisor para el PDF: el completo si llegó; si no, el del perfil de la app. */
const nombreSupervisor = (s: Pick<Supervisada, 'tecnico' | 'tecnicoNombre'>) =>
  (s.tecnicoNombre || '').trim() || (s.tecnico || '').trim() || '—';

/**
 * Pie de todas las páginas: supervisor a la izquierda y jornada al centro.
 * Con respuestas simuladas, la marca del prototipo va en rojo encima de la jornada.
 */
function pies(doc: jsPDF, supervisor: string, hoja: string, simulado: boolean) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const W = doc.internal.pageSize.getWidth(),
      H = doc.internal.pageSize.getHeight();
    const M = W > H ? 8 : 12,
      w = W - 2 * M,
      y = H - 9;
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(M, y - 1, W - M, y - 1);
    doc.setTextColor(100);
    textoCaja(doc, supervisor, M, y, w * 0.4, 5, { fs: 6.5, min: 4.5, pad: 0 });
    doc.setTextColor(100);
    textoCaja(doc, `Jornada: ${hoja}`, M + w * 0.4, y, w * 0.4, 5, { fs: 6.5, min: 4.5, centro: true });
    if (simulado) {
      doc.setTextColor(185, 28, 28);
      textoCaja(doc, MARCA_SIMULADO, M + w * 0.4, y - 4.6, w * 0.4, 3.6, {
        fs: 6.5,
        min: 5,
        estilo: 'bold',
        centro: true,
      });
    }
    // Sin «Página x de y»: el 1A/2A se entrega con el Formato 4 de cada suministro intercalado
    // (formatosConAnexo.ts), así que una numeración propia no coincidiría con la del PDF final.
  }
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
}

// ---------- Observaciones que no se cortan

/** Una observación: rótulo en negrita (p. ej. «Muestra 3 · 999…:») y el texto, con sangría colgante. */
interface Entrada {
  rotulo: string;
  texto: string;
}

/**
 * Escribe las observaciones desde `y` hasta `yMax` (renglones de `lh` mm, con línea opcional debajo).
 * Lo que no cabe se devuelve, partido por renglón, para seguir en otra página: nunca se pierde texto.
 */
function escribirEntradas(
  doc: jsPDF,
  entradas: Entrada[],
  x: number,
  y: number,
  w: number,
  yMax: number,
  o: { fs?: number; lh?: number; renglones?: boolean } = {},
): { y: number; resto: Entrada[] } {
  const fs = o.fs ?? 7.5,
    lh = o.lh ?? altoLinea(fs, 1.25);
  doc.setFontSize(fs);
  doc.setFont('helvetica', 'bold');
  const anchoRot = Math.min(
    w * 0.4,
    Math.max(0, ...entradas.map((e) => (e.rotulo ? doc.getTextWidth(e.rotulo) + 1.5 : 0))),
  );
  const resto: Entrada[] = [];
  for (const [k, e] of entradas.entries()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fs);
    const lineas = doc.splitTextToSize(e.texto || '—', w - anchoRot) as string[];
    let j = 0;
    for (; j < lineas.length; j++) {
      if (y + lh > yMax) break;
      if (o.renglones) {
        doc.setDrawColor(150);
        doc.setLineWidth(0.15);
        doc.line(x - 1, y + lh - 0.6, x + w + 1, y + lh - 0.6);
      }
      if (j === 0 && e.rotulo) {
        doc.setFont('helvetica', 'bold');
        doc.text(e.rotulo, x, y + lh / 2 + 0.4, { baseline: 'middle' });
        doc.setFont('helvetica', 'normal');
      }
      doc.text(lineas[j], x + anchoRot, y + lh / 2 + 0.4, { baseline: 'middle' });
      y += lh;
    }
    if (j < lineas.length) {
      resto.push({
        rotulo: e.rotulo ? `${e.rotulo.replace(/:$/, '')} (cont.):` : '',
        texto: lineas.slice(j).join(' '),
      });
      resto.push(...entradas.slice(k + 1));
      break;
    }
  }
  return { y, resto };
}

/** Alto (mm) que ocuparían las observaciones con esa letra, sin dibujarlas. */
function altoEntradas(doc: jsPDF, entradas: Entrada[], w: number, fs: number, lh = altoLinea(fs, 1.25)): number {
  doc.setFontSize(fs);
  doc.setFont('helvetica', 'bold');
  const anchoRot = Math.min(
    w * 0.4,
    Math.max(0, ...entradas.map((e) => (e.rotulo ? doc.getTextWidth(e.rotulo) + 1.5 : 0))),
  );
  doc.setFont('helvetica', 'normal');
  return entradas.reduce((t, e) => t + (doc.splitTextToSize(e.texto || '—', w - anchoRot) as string[]).length * lh, 0);
}

/** Páginas A4 verticales con la continuación de las observaciones (las «hojas adicionales»). */
function paginasObservaciones(
  doc: jsPDF,
  titulo: string[],
  numero: string,
  provisional: boolean,
  entradas: Entrada[],
  renglones: boolean,
) {
  const W = 210,
    H = 297,
    M = 12,
    w = W - 2 * M;
  let resto = entradas;
  while (resto.length) {
    doc.addPage('a4', 'portrait');
    cabecera(doc, M, M, w, titulo, numero, 44, 42, provisional);
    const y = M + 26;
    barraGris(doc, 'OBSERVACIONES (CONTINUACIÓN)', M, y, w);
    const r = escribirEntradas(doc, resto, M + 2, y + 7, w - 4, H - 16, { lh: renglones ? 6 : undefined, renglones });
    resto = r.resto;
  }
}

function barraGris(doc: jsPDF, txt: string, x: number, y: number, w: number, h = 5) {
  doc.setFillColor(217, 217, 217);
  doc.setDrawColor(90);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h, 'FD');
  doc.setTextColor(0);
  textoCaja(doc, txt, x, y, w, h, { fs: 7.5, min: 5, estilo: 'bold' });
}

// ---------- Textos de la plantilla oficial (Anexo N° 01)

/**
 * Redacción de la plantilla para las filas del PDF. Los textos cortos de PREGUNTAS_1A / ITEMS_2A no se
 * tocan porque el servicio y la app los usan para emparejar; aquí solo cambia lo que se imprime.
 * Ortografía corregida (la plantilla tiene tildes faltantes). **…** = negrita, como en la plantilla.
 */
const TEXTO_PDF_1A: Record<string, string> = {
  fecha_concordante:
    'Fecha de contraste registrada en sticker es concordante con fecha programada de contraste y/o con la fecha en que se efectúa la supervisión',
};
const TEXTO_USUARIO_PDF =
  'Usuario confirma recepción de notificación previa y de la copia de Certificado de Contraste de las pruebas realizadas (N.A.: usuario ausente o no declara)';
const TEXTO_CONFORME_1A = 'Supervisión posterior concluye que cumplimiento del contraste estaría CONFORME';

const TEXTO_PDF_2A: Record<string, string> = {
  '0_0': 'Cuenta con Orden de trabajo para el suministro intervenido y supervisado',
  '0_1': 'La intervención al suministro corresponde a la fecha en que fue programada su ejecución',
  '0_2': 'El Grupo de Trabajo se encuentra completo (01 Técnico Inspector y 01 Técnico de apoyo)',
  '0_3': 'Se señalizó y/o demarcó la zona de trabajo.',
  '0_4': 'Personal operativo se encuentra registrado y autorizado ante ELSE',
  '0_5': "Personal operativo cuenta con EPP's y uniforme de trabajo completos y en buen estado",
  '0_6': 'Personal operativo cuenta con FOTOCHEK de identificación en buen estado.',
  '0_7': 'Personal operativo cuenta con sus herramientas completas y en buen estado.',
  '0_8': 'Personal operativo cuenta con equipo móvil operativo y en buen estado',
  '0_9':
    'Personal operativo utiliza equipos de contraste (patrón y carga) en buen estado y con fecha de calibración vigente',
  '0_10': 'Personal operativo cuenta con su "Procedimiento técnico de contrastación en campo"',
  '0_11': 'Unidad vehicular en buen estado y cumple con las especificaciones requeridas',
  '0_12': 'Existe otras observaciones y/o incumplimientos (detallar en la sección de "Observaciones adicionales")',
  '1_0': 'Se verificó si las Pruebas de vacío y de contraste se realizaron correctamente.',
  '1_1': 'Resultados de los ensayos de contrastación **(APRUEBA: SI/NO)**',
  '1_2': 'Se verificó el correcto uso de Equipos y Herramientas.',
  '1_3': 'Se verificó el correcto pegado y llenado del sticker de contraste.',
  '1_4': 'Se verificó el uso de plumón indeleble.',
  '1_5': 'Se verificó el correcto traslado del equipo patrón y carga.',
  '1_6': 'Se verificó el correcto llenado del Informe de Inspección de contrastación.',
  '2_0': 'Se verificó certificado de calibración vigente del equipo Patrón.',
  '2_1': 'Se verificó certificado de calibración vigente de la carga inductiva.',
  '3_0': 'Se verificó orden y limpieza en el lugar de trabajo al término de la actividad.',
  '3_1': 'Se verificó el correcto cumplimiento del procedimiento de trabajo.',
  '3_2': 'Trabajo ejecutado **CONFORME**',
};

/** «N° · fecha» (o «N° fecha») que escribió el técnico → número de certificado y fecha de calibración. */
function partirCertificado(t: string | undefined): { numero: string; fecha: string } {
  const s = (t || '').trim();
  if (!s || s === '—') return { numero: '—', fecha: '—' };
  if (s.includes('·')) {
    const [a, ...b] = s.split('·');
    return { numero: a.trim() || '—', fecha: b.join('·').trim() || '—' };
  }
  const m = s.match(/^(.*?)[\s,;-]+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$/);
  return m ? { numero: m[1].trim() || '—', fecha: m[2] } : { numero: s, fecha: '—' };
}

// ---------- Formato 1A

/**
 * Celda «SI | NO» (o «SI | NO | N.A.») como en la plantilla: las opciones separadas por una raya y la
 * elegida en negrita y encerrada (en rojo si es un NO que incumple). Sin respuesta: opciones en gris.
 */
function celdaOpciones(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  ops: string[],
  val: string | undefined,
  rojoNo: boolean,
) {
  const sw = w / ops.length;
  doc.setFontSize(6.2);
  ops.forEach((op, k) => {
    const cx = x + sw * k + sw / 2;
    if (k > 0) {
      doc.setDrawColor(120);
      doc.setLineWidth(0.2);
      doc.line(x + sw * k, y + h * 0.25, x + sw * k, y + h * 0.75);
    }
    const elegida = val === op;
    doc.setFont('helvetica', elegida ? 'bold' : 'normal');
    if (elegida) {
      const rojo = rojoNo && op === 'NO';
      if (rojo) doc.setTextColor(200, 30, 30);
      else doc.setTextColor(0);
      const tw = doc.getTextWidth(op) + 1.6;
      doc.setDrawColor(rojo ? 200 : 0, rojo ? 30 : 0, rojo ? 30 : 0);
      doc.setLineWidth(0.3);
      doc.roundedRect(cx - tw / 2, y + h / 2 - 1.7, tw, 3.4, 0.8, 0.8);
    } else doc.setTextColor(val ? 175 : 140);
    doc.text(op, cx, y + h / 2 + 0.1, { align: 'center', baseline: 'middle' });
  });
  doc.setTextColor(0);
  doc.setDrawColor(110);
  doc.setLineWidth(0.2);
}

/** Formato 1A: 10 muestras por hoja (A4 horizontal). */
export async function pdf1A(bloque: Supervisada[], hoja: string): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297,
    H = 210,
    M = 8,
    w = W - 2 * M;
  const { proc, sector } = procedimiento(hoja);
  const numero = bloque[0]?.reporte ?? '';
  const provisional = bloque.some((s) => s.provisional);
  cabecera(
    doc,
    M,
    M,
    w,
    ['FORMATO 1A', 'REPORTE DE SUPERVISION POSTERIOR', 'ACTIVIDADES DE CONTRASTACIÓN DE MEDIDORES'],
    numero,
    52,
    50,
    provisional,
  );

  // Datos generales, en el orden de la plantilla
  let y = M + 25;
  campo(doc, 'EMPRESA CONTRATISTA SUPERVISADA', REPORT_CONFIG.contratista, M, y, M + 58, 110);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.text('(Nombre de la Entidad Contrastadora / Verificadora supervisada)', M, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('PROCEDIMIENTO:', M + 176, y + 3.9);
  opcionesCasilla(
    doc,
    M + 200,
    y + 3.9,
    [
      ['P-227', proc === 'P-227'],
      ['NTCSE-U', proc === 'NTCSE-U'],
      ['NTCSE-R', proc === 'NTCSE-R'],
    ],
    5,
  );
  y += 11;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('ACTIVIDAD SUPERVISADA:', M, y + 3.9);
  opcionesCasilla(doc, M + 58, y + 3.9, [['CONTRASTE DE MEDIDORES', true]]);
  // Sector: puede ser «CUSCO / ABANCAY / …»; se achica o parte en dos renglones dentro de su casilla
  campo(doc, 'SECTOR ELÉCTRICO:', sector, M + 176, y - 0.6, M + 205, w - 205, 7);

  // Tabla
  y += 10;
  const labW = 92,
    colW = (w - labW) / 10;
  doc.setDrawColor(110);
  doc.setLineWidth(0.2);
  type Fila = {
    lab: string;
    gris?: boolean;
    alto?: number;
    negrita?: boolean;
    /** Valor de texto por columna. */
    vals?: (string | undefined)[];
    /** Opciones de la plantilla y el valor elegido por columna. */
    ops?: string[];
    elegidos?: (string | undefined)[];
    rojoNo?: boolean;
  };
  const fila = (f: Fila) => {
    const hgt = f.alto ?? 5.2;
    if (f.gris) {
      doc.setFillColor(217, 217, 217);
      doc.rect(M, y, w, hgt, 'F');
    }
    doc.setDrawColor(110);
    doc.setLineWidth(0.2);
    doc.rect(M, y, labW, hgt);
    doc.setTextColor(0);
    textoCaja(doc, f.lab, M, y, labW, hgt, { fs: 6.6, min: 5, estilo: f.negrita || f.gris ? 'bold' : 'normal' });
    for (let c = 0; c < 10; c++) {
      const cx = M + labW + c * colW;
      doc.setDrawColor(110);
      doc.setLineWidth(0.2);
      doc.rect(cx, y, colW, hgt);
      if (c >= bloque.length) continue; // columnas sin muestra: vacías
      if (f.ops) celdaOpciones(doc, cx, y, colW, hgt, f.ops, f.elegidos?.[c], !!f.rojoNo);
      else if (f.vals) {
        const v = f.vals[c];
        if (!v) continue;
        doc.setTextColor(0);
        textoCaja(doc, v, cx, y, colW, hgt, { fs: 6.6, min: 4.5, centro: true, pad: 0.8 });
      }
    }
    y += hgt;
  };
  const col = (fn: (s: Supervisada) => string | undefined) => bloque.map(fn);
  const SINO = ['SI', 'NO'];
  fila({ lab: 'N° MUESTRA:', gris: true, vals: col((s) => String(s.muestra)) });
  fila({ lab: 'N° SUMINISTRO:', negrita: true, vals: col((s) => String(s.punto.suministro)) });
  fila({ lab: 'FECHA DE SUPERVISIÓN:', negrita: true, vals: col((s) => s.fechaTxt) });
  fila({ lab: 'HORA DE SUPERVISIÓN:', negrita: true, vals: col((s) => s.horaTxt) });
  fila({ lab: 'VERIFICACIÓN POSTERIOR DEL CONTRASTE REALIZADO', gris: true });
  for (const q of PREGUNTAS_1A) {
    const lab = TEXTO_PDF_1A[q.id] ?? q.texto;
    fila({ lab, ops: SINO, elegidos: col((s) => s.resp[q.id]), rojoNo: true, alto: lab.length > 95 ? 6.6 : 5.2 });
  }
  fila({ lab: 'Fecha de contraste registrada en sticker:', vals: col((s) => s.fechaSticker) });
  fila({ lab: 'Lectura de medidor verificada durante la supervisión:', vals: col((s) => s.lectura) });
  fila({ lab: TEXTO_USUARIO_PDF, ops: ['SI', 'NO', 'N.A.'], elegidos: col((s) => s.usuario || undefined), alto: 6.6 });
  fila({ lab: 'CONFORMIDAD', gris: true });
  fila({ lab: TEXTO_CONFORME_1A, ops: SINO, elegidos: col((s) => (s.conforme ? 'SI' : 'NO')), rojoNo: true });

  // Observaciones del bloque: una por muestra, con sangría; lo que no entra sigue en la página 2
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('OBSERVACIONES:', M, y + 2);
  const entradas: Entrada[] = bloque
    .filter((s) => s.observacion?.trim())
    .map((s) => ({ rotulo: `Muestra ${s.muestra} · ${s.punto.suministro}:`, texto: s.observacion.trim() }));
  const yMax = H - 15;
  let resto: Entrada[] = [];
  if (!entradas.length) {
    doc.setFont('helvetica', 'normal');
    doc.text('Sin observaciones.', M + 27, y + 2);
  } else {
    // Primero se prueba con letra algo menor para que todo quepa en la hoja; si ni así, continúa
    const alto = yMax - 4 - (y - 0.4);
    const fs = [7, 6.6, 6.2].find((f) => altoEntradas(doc, entradas, w - 27, f) <= alto) ?? 7;
    const r = escribirEntradas(doc, entradas, M + 27, y - 0.4, w - 27, yMax - 4, { fs });
    resto = r.resto;
  }
  const conEvidencias = bloque.filter(tieneFotosEvidencia);
  if (resto.length) {
    // Lo que no entró sigue arriba de la primera página de evidencias o, si no hay fotos, en una hoja aparte
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(180, 83, 9);
    doc.text('Las observaciones continúan en la hoja adicional.', W - M, yMax - 0.8, { align: 'right' });
    doc.setTextColor(0);
    if (!conEvidencias.length)
      paginasObservaciones(
        doc,
        ['FORMATO 1A', 'REPORTE DE SUPERVISION POSTERIOR', 'OBSERVACIONES (CONTINUACIÓN)'],
        numero,
        provisional,
        resto,
        false,
      );
  }

  // Desde aquí: anexo fotográfico continuo (4 fotos por página), agrupado por muestra (solo si hay fotos).
  // Las observaciones de cada muestra ya están en la página 1: arriba solo va lo que no entró y lo que no tiene foto.
  if (conEvidencias.length) {
    const sinEvidencia = bloque.flatMap((sv) => itemsSinFoto(sv).map((t) => `Muestra ${sv.muestra}: ${t}`));
    await anexoFotografico(doc, {
      titulo: [
        'FORMATO 1A',
        'EVIDENCIAS Y REGISTRO FOTOGRÁFICO',
        `MUESTRA${conEvidencias.length > 1 ? 'S' : ''} ${conEvidencias.map((sv) => sv.muestra).join(', ')}`,
      ],
      numero,
      provisional,
      secciones: conEvidencias.map((sv) => ({
        banda: `Muestra ${sv.muestra} · Suministro ${sv.punto.suministro}`,
        fotos: fotosAnexo(sv),
      })),
      sinEvidencia,
      previo: resto,
    });
  }

  const supervisores = [...new Set(bloque.map(nombreSupervisor))].join(' · ');
  pies(
    doc,
    `Supervisor${bloque.length > 1 && supervisores.includes(' · ') ? 'es' : ''} de campo: ${supervisores}`,
    hoja,
    bloque.some((s) => s.simulado),
  );
  return doc;
}

// ---------- Formato 2A

/** Formato 2A: una hoja por suministro (A4 vertical). */
export async function pdf2A(s: Supervisada, hoja: string): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210,
    H = 297,
    M = 12,
    w = W - 2 * M;
  const { proc, sector } = procedimiento(hoja);
  const provisional = !!s.provisional;
  cabecera(
    doc,
    M,
    M,
    w,
    ['FORMATO 2A', 'REPORTE DE SUPERVISION COINCIDENTE', 'ACTIVIDADES DE CONTRASTE DE MEDIDORES'],
    s.reporte,
    40,
    42,
    provisional,
  );
  let y = M + 25;
  campo(doc, 'SUMINISTRO:', String(s.punto.suministro), M, y, M + 21, 58);
  campo(doc, 'FECHA:', s.fechaTxt, M + 88, y, M + 100, 34);
  campo(doc, 'HORA:', s.horaTxt, M + 143, y, M + 154, w - 154);
  y += 8;
  campo(doc, 'EMPRESA CONTRATISTA SUPERVISADA', REPORT_CONFIG.contratista, M, y, M + 58, w - 58);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.text('(Nombre de la Entidad Contrastadora / Verificadora supervisada)', M, y + 8);
  y += 11;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('PROCEDIMIENTO:', M, y + 3.9);
  opcionesCasilla(
    doc,
    M + 25,
    y + 3.9,
    [
      ['P-227', proc === 'P-227'],
      ['NTCSE-U', proc === 'NTCSE-U'],
      ['NTCSE-R', proc === 'NTCSE-R'],
    ],
    4,
  );
  campo(doc, 'SECTOR ELÉCTRICO:', sector, M + 98, y - 0.6, M + 127, w - 127, 7);
  y += 10;

  // Columnas de respuesta: SI, NO y la raya de «observación», como en la plantilla
  const xSi = M + w - 58,
    xNo = M + w - 49,
    xObs = M + w - 40;
  const anchoItem = xSi - (M + 4) - 3;
  const incumplido = (id: string) => (id === ID_OTRAS ? s.resp2A[id] === 'SI' : s.resp2A[id] === 'NO');
  for (const [bi, b] of PREGUNTAS_2A.entries()) {
    barraGris(doc, b.bloque, M, y, w);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(60);
    doc.text('SI', xSi + 2.1, y + 2.6, { align: 'center' });
    doc.text('NO', xNo + 2.1, y + 2.6, { align: 'center' });
    doc.text('observación', xObs + 1, y + 2.6);
    doc.setTextColor(0);
    y += 3.6;
    for (const k of b.items.keys()) {
      const id = `${bi}_${k}`;
      const txt = TEXTO_PDF_2A[id] ?? b.items[k];
      // Una línea si entra (con sus negritas); si no, se achica un poco y luego se parte en dos
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      let alto = 4.7;
      if (doc.getTextWidth(sinMarcas(txt)) <= anchoItem) textoMixto(doc, txt, M + 4, y + alto / 2);
      else {
        const a = ajustar(doc, sinMarcas(txt), anchoItem, 7.6, 7.5, 6);
        alto = Math.max(4.7, a.lineas.length * a.lh + 1.2);
        a.lineas.forEach((l, j) =>
          doc.text(l, M + 4, y + alto / 2 - ((a.lineas.length - 1) * a.lh) / 2 + j * a.lh, { baseline: 'middle' }),
        );
      }
      // Sin respuesta (o N.A.): las dos casillas quedan vacías
      const val = s.resp2A[id];
      doc.setDrawColor(0);
      doc.setLineWidth(0.25);
      doc.setFontSize(7.5);
      casilla(doc, xSi, y + alto / 2 + 1.8, val === 'SI');
      casilla(doc, xNo, y + alto / 2 + 1.8, val === 'NO');
      doc.setDrawColor(150);
      doc.setLineWidth(0.15);
      doc.line(xObs, y + alto - 0.6, M + w, y + alto - 0.6);
      if (incumplido(id) && id !== ID_CONFORME_2A) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6);
        doc.setTextColor(185, 28, 28);
        doc.text('Ver observaciones', xObs + 1, y + alto - 1.6);
        doc.setTextColor(0);
      } else if (val === 'N.A.') {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6);
        doc.setTextColor(110);
        doc.text('N.A. (no aplica)', xObs + 1, y + alto - 1.6);
        doc.setTextColor(0);
      }
      doc.setDrawColor(0);
      y += alto;
    }
    if (b.bloque === 'CERTIFICADOS') {
      // Dos columnas como la plantilla: EQUIPO PATRÓN y CARGA INDUCTIVA / RESISTIVA
      const patron = partirCertificado(s.patron || (s.simulado ? 'LE-C-066-2026 · 23/02/2026' : ''));
      const carga = partirCertificado(s.carga || (s.simulado ? 'LE-383-2026 · 21/09/2026' : ''));
      y += 1.5;
      const colX = [M + 4, M + w / 2 + 2];
      const anchoCol = w / 2 - 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('EQUIPO PATRÓN', colX[0] + anchoCol / 2, y + 2.5, { align: 'center' });
      doc.text('CARGA INDUCTIVA / RESISTIVA', colX[1] + anchoCol / 2, y + 2.5, { align: 'center' });
      y += 4;
      for (const [rot, clave] of [
        ['NÚMERO DE CERTIFICADO', 'numero'],
        ['FECHA DE CALIBRACIÓN', 'fecha'],
      ] as const) {
        [patron, carga].forEach((c, j) => campo(doc, rot, c[clave], colX[j], y, colX[j] + 37, anchoCol - 37, 5.2));
        y += 6.2;
      }
    }
    y += 1.2;
  }

  // Observaciones sobre renglones; si no entran, siguen en hojas adicionales (como pide la plantilla)
  barraGris(
    doc,
    'OBSERVACIONES (con respecto a algún incumplimiento u observación detectada durante la supervisión en campo, adjuntar hojas adicionales de ser necesario)',
    M,
    y,
    w,
  );
  y += 5;
  const yMax = H - 15;
  const lh = 5;
  const obs = s.observacion?.trim() || 'Sin observaciones.';
  const r = escribirEntradas(doc, [{ rotulo: '', texto: obs }], M + 2, y, w - 4, yMax - (s.observacion ? 4 : 0), {
    lh,
    renglones: true,
  });
  // Renglones vacíos hasta completar el recuadro (la plantilla trae 6)
  let yr = r.y;
  doc.setDrawColor(150);
  doc.setLineWidth(0.15);
  while (!r.resto.length && yr + lh <= Math.min(yMax, y + 6 * lh) + 0.01) {
    doc.line(M + 1, yr + lh - 0.6, M + w - 1, yr + lh - 0.6);
    yr += lh;
  }
  doc.setDrawColor(90);
  doc.setLineWidth(0.25);
  doc.rect(M, y - 5, w, Math.max(yr, r.y) - y + 5 + 0.6);
  if (r.resto.length) {
    // Con evidencias, la observación completa ya va arriba de la página 2; si no, sigue en una hoja adicional
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(180, 83, 9);
    const aviso = tieneFotosEvidencia(s)
      ? 'La observación completa figura en el anexo fotográfico (al final).'
      : 'Las observaciones continúan en la hoja adicional.';
    doc.text(aviso, W - M, yMax - 0.3, { align: 'right' });
    doc.setTextColor(0);
  }
  if (r.resto.length && !tieneFotosEvidencia(s)) {
    paginasObservaciones(
      doc,
      ['FORMATO 2A', 'REPORTE DE SUPERVISION COINCIDENTE', 'OBSERVACIONES (HOJA ADICIONAL)'],
      s.reporte,
      provisional,
      r.resto,
      true,
    );
  }

  // Luego: evidencias de lo incumplido (solo si hay al menos una foto)
  if (tieneFotosEvidencia(s)) {
    await anexoFotografico(doc, {
      titulo: ['FORMATO 2A', 'EVIDENCIAS Y REGISTRO FOTOGRÁFICO', `${s.reporte} · SUMINISTRO ${s.punto.suministro}`],
      numero: s.reporte,
      provisional,
      secciones: [{ fotos: fotosAnexo(s) }],
      observacion: s.observacion,
      sinEvidencia: itemsSinFoto(s),
    });
  }
  pies(doc, `Supervisor de campo: ${nombreSupervisor(s)}`, hoja, s.simulado);
  return doc;
}

// ------------------------------------------------------------------ Evidencias (página 2 en adelante)

/** La sección de evidencias solo aparece si hay al menos una foto (las fotos son opcionales en la app). */
export const tieneFotosEvidencia = (s: Supervisada) => !!s.evidencias?.some((e) => e.fotos.length > 0);

/**
 * Ítems incumplidos de la supervisión, en el orden del formato, con sus fotos (si las hay).
 * 1A: preguntas en NO y «usuario confirma» en NO. 2A: ítems en NO y «Existen otras…» en SI
 * (la conformidad final no, porque sale de las demás). Al final, las evidencias generales y las
 * de ítems que no figuran en NO (por si la app manda alguna), para no perder ninguna foto.
 */
export function itemsIncumplidos(s: Supervisada): Evidencia[] {
  const fotosDe = (id: string) => s.evidencias?.find((e) => e.pregunta === id)?.fotos ?? [];
  const items: Evidencia[] = [];
  if (s.tipo === '1A') {
    for (const q of PREGUNTAS_1A)
      if (s.resp[q.id] === 'NO') items.push({ pregunta: q.id, texto: q.texto, fotos: fotosDe(q.id) });
    if (s.usuario === 'NO')
      items.push({ pregunta: 'usuario_confirma', texto: TEXTO_USUARIO_1A, fotos: fotosDe('usuario_confirma') });
  } else {
    for (const q of ITEMS_2A) {
      if (q.id === ID_CONFORME_2A) continue;
      const mal = q.id === ID_OTRAS ? s.resp2A[q.id] === 'SI' : s.resp2A[q.id] === 'NO';
      if (mal) items.push({ pregunta: q.id, texto: q.texto, fotos: fotosDe(q.id) });
    }
  }
  for (const e of s.evidencias ?? [])
    if (e.fotos.length && !items.some((i) => i.pregunta === e.pregunta)) items.push(e);
  return items;
}

/** «dd/MM/yyyy HH:mm:ss» tal cual; un Date.toString() de Sheets («Tue Nov 10 2026 10:55:04 GMT-0500…») se acorta igual. */
function horaFoto(t: string): string {
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(t.trim())) return t.trim();
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return `${fmtFecha(d)} ${fmtHora(d)}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/** Imagen lista para el PDF: datos, tamaño en píxeles y formato. */
interface ImgPdf {
  data: string;
  w: number;
  h: number;
  fmt: 'JPEG' | 'PNG';
}

/** Lado mayor y calidad JPEG de las fotos dentro del PDF (A4 a ~90 mm de ancho: sobra resolución). */
const FOTO_MAX_LADO = 1600,
  FOTO_CALIDAD = 0.8;
/** Fotos ya preparadas por URL: la misma foto en varios PDF del mismo ZIP se comprime una vez. */
const preparadas = new Map<string, Promise<ImgPdf | null>>();

/**
 * Reduce la foto a ≤1600 px y la pasa a JPEG al 80 % (fondo blanco si traía transparencia).
 * Si la original ya es un JPEG chico y pesa menos que el resultado, se deja la original.
 * Sin navegador (pruebas en Node) se usa tal cual.
 */
async function comprimirFoto(doc: jsPDF, data: string): Promise<ImgPdf | null> {
  const esPng = data.startsWith('data:image/png');
  const original = (): ImgPdf | null => {
    try {
      const p = doc.getImageProperties(data);
      return { data, w: p.width, h: p.height, fmt: esPng ? 'PNG' : 'JPEG' };
    } catch {
      return null;
    }
  };
  if (typeof document === 'undefined') return original();
  try {
    const img = new Image();
    img.src = data;
    await img.decode();
    const k = Math.min(1, FOTO_MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const jpg = c.toDataURL('image/jpeg', FOTO_CALIDAD);
    if (k === 1 && /^data:image\/jpe?g/.test(data) && data.length <= jpg.length)
      return { data, w: img.naturalWidth, h: img.naturalHeight, fmt: 'JPEG' };
    return { data: jpg, w: c.width, h: c.height, fmt: 'JPEG' };
  } catch {
    return original();
  }
}

/** Foto de evidencia descargada (caché del navegador) y comprimida; null si no se pudo. */
function fotoEvidencia(doc: jsPDF, url: string | undefined): Promise<ImgPdf | null> {
  if (!url) return Promise.resolve(null);
  const ya = preparadas.get(url);
  if (ya) return ya;
  const p = (async () => {
    try {
      const d = await loadImageWithCache(url);
      return d ? await comprimirFoto(doc, d) : null;
    } catch {
      return null;
    }
  })();
  // Tope para no acumular memoria en exportaciones muy grandes
  if (preparadas.size > 400) preparadas.clear();
  preparadas.set(url, p);
  return p;
}

/** Una foto del anexo con lo que documenta. */
interface FotoAnexo {
  foto: FotoEvidencia;
  /** «no»: evidencia de un ítem en NO (rojo); «adicional»: registro adicional (azul); «general»: evidencia suelta. */
  clase: 'no' | 'adicional' | 'general';
  /** Ítem o rótulo que va en el pie de la foto. */
  item: string;
}

/** Fotos de una supervisión en el orden del anexo (ítems en NO según el formulario y luego registro adicional). */
function fotosAnexo(s: Supervisada): FotoAnexo[] {
  const fotos: FotoAnexo[] = [];
  for (const g of itemsIncumplidos(s))
    for (const f of g.fotos)
      fotos.push({
        foto: f,
        clase: g.adicional ? 'adicional' : g.pregunta ? 'no' : 'general',
        item: g.adicional ? f.etiqueta?.trim() || g.texto : g.texto,
      });
  // Orden estable: primero lo que no se cumplió, después lo adicional
  return [...fotos.filter((f) => f.clase !== 'adicional'), ...fotos.filter((f) => f.clase === 'adicional')];
}

/** Ítems en NO que no tienen ninguna foto (van en una sola línea arriba del anexo). */
const itemsSinFoto = (s: Supervisada) =>
  itemsIncumplidos(s)
    .filter((g) => !g.adicional && g.pregunta && g.fotos.length === 0)
    .map((g) => g.texto);

/**
 * Anexo fotográfico de las observaciones (A4 vertical, desde la página 2): grilla continua de 2 × 2, hasta 4
 * fotos por página. Cada foto respeta su proporción dentro de la celda y lleva debajo un pie compacto con el
 * ítem que documenta (rojo «NO CUMPLE · …» o azul «REGISTRO ADICIONAL · …») y la hora en que se tomó.
 * Solo en la primera página: observaciones que no entraron en la página 1, la OBSERVACIÓN (si hay) y una línea
 * «Sin evidencia fotográfica: …». En el 1A cada muestra lleva una banda fina «Muestra N · suministro».
 * El pie y «Página x de y» los pone `pies` al final.
 */
async function anexoFotografico(
  doc: jsPDF,
  o: {
    titulo: string[];
    numero: string;
    provisional: boolean;
    secciones: { banda?: string; fotos: FotoAnexo[] }[];
    observacion?: string;
    sinEvidencia: string[];
    previo?: Entrada[];
  },
): Promise<void> {
  const W = 210,
    H = 297,
    M = 12,
    w = W - 2 * M,
    pie = H - 15,
    gap = 3,
    cw = (w - gap) / 2,
    altoPie = 9.6,
    altoBanda = 5.5,
    conBandas = o.secciones.some((sec) => sec.banda);
  // Todas las fotos de una vez (en paralelo; la caché evita repetir descargas)
  const datos = new Map<FotoEvidencia, ImgPdf | null>();
  await Promise.all(
    o.secciones.flatMap((sec) => sec.fotos.map(async (f) => datos.set(f.foto, await fotoEvidencia(doc, f.foto.url)))),
  );

  let y = 0;
  /** Alto de fila de la página actual (se calcula al poner la primera fila de cada página). */
  let altoFila = 0;
  const nuevaPagina = () => {
    doc.addPage('a4', 'portrait');
    cabecera(doc, M, M, w, o.titulo, o.numero, 44, 42, o.provisional);
    y = M + 24;
    altoFila = 0;
  };
  nuevaPagina();

  // --- Arriba de la primera página: observaciones que no entraron, la observación y lo que no tiene foto
  let previo = o.previo ?? [];
  while (previo.length) {
    barraGris(doc, 'OBSERVACIONES DEL REPORTE (CONTINUACIÓN DE LA PÁGINA 1)', M, y, w);
    const r = escribirEntradas(doc, previo, M + 2, y + 6, w - 4, pie - 4, { fs: 7 });
    y = r.y + 3;
    previo = r.resto;
    if (previo.length) nuevaPagina();
  }
  if (o.observacion?.trim()) {
    let resto: Entrada[] = [{ rotulo: 'OBSERVACIÓN:', texto: o.observacion.trim() }];
    while (resto.length) {
      const y0 = y;
      const r = escribirEntradas(doc, resto, M + 2.5, y + 1, w - 5, pie - 4, { fs: 7.5 });
      doc.setDrawColor(120);
      doc.setLineWidth(0.3);
      doc.rect(M, y0, w, r.y - y0 + 1, 'D');
      y = r.y + 3;
      resto = r.resto;
      if (resto.length) nuevaPagina();
    }
  }
  if (o.sinEvidencia.length) {
    const txt = o.sinEvidencia.join('; ');
    doc.setFontSize(7);
    const alto = altoEntradas(doc, [{ rotulo: 'Sin evidencia fotográfica:', texto: txt }], w - 5, 7) + 2;
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(185, 28, 28);
    doc.setLineWidth(0.3);
    doc.rect(M, y, w, alto, 'FD');
    doc.setTextColor(153, 27, 27);
    const r = escribirEntradas(
      doc,
      [{ rotulo: 'Sin evidencia fotográfica:', texto: txt }],
      M + 2.5,
      y + 1,
      w - 5,
      pie,
      {
        fs: 7,
      },
    );
    doc.setTextColor(0);
    y = r.y + 1 + 3;
  }

  // --- Grilla de fotos
  /** Alto de fila para que entren 2 filas en lo que queda de la página (con lugar para las bandas del 1A). */
  const calcularFila = () => {
    const reserva = conBandas ? 2 * (altoBanda + 1) : 0;
    return Math.min(125, Math.max(70, (pie - y - gap - reserva) / 2));
  };
  const banda = (txt: string) => {
    doc.setFillColor(229, 231, 235);
    doc.rect(M, y, w, altoBanda, 'F');
    doc.setTextColor(17, 24, 39);
    textoCaja(doc, txt, M, y, w, altoBanda, { fs: 7.5, min: 5.5, estilo: 'bold', pad: 2 });
    doc.setTextColor(0);
    y += altoBanda + 1;
  };
  const celda = (f: FotoAnexo, x: number, yC: number, alto: number) => {
    // Marco y foto con su proporción real
    doc.setDrawColor(160);
    doc.setLineWidth(0.25);
    doc.rect(x, yC, cw, alto);
    const d = datos.get(f.foto) ?? null;
    const maxW = cw - 2,
      maxH = alto - altoPie - 2;
    if (d) {
      const esc = Math.min(maxW / d.w, maxH / d.h);
      const iw = d.w * esc,
        ih = d.h * esc;
      doc.addImage(d.data, d.fmt, x + (cw - iw) / 2, yC + 1 + (maxH - ih) / 2, iw, ih, undefined, 'MEDIUM');
    } else {
      doc.setFontSize(7.5);
      doc.setTextColor(150);
      doc.setFont('helvetica', 'normal');
      const aviso = f.foto.url ? 'Foto no disponible' : `Foto no encontrada (timestamp ${f.foto.timestamp || '—'})`;
      doc.text(doc.splitTextToSize(aviso, cw - 8), x + cw / 2, yC + maxH / 2, { align: 'center' });
      doc.setTextColor(0);
    }
    // Pie compacto: qué documenta (hasta 2 renglones, se achica si hace falta) y la hora
    const yp = yC + alto - altoPie;
    if (f.clase === 'adicional') doc.setFillColor(30, 58, 138);
    else if (f.clase === 'no') doc.setFillColor(185, 28, 28);
    else doc.setFillColor(75, 85, 99);
    doc.rect(x, yp, cw, altoPie, 'F');
    const pre = f.clase === 'adicional' ? 'REGISTRO ADICIONAL' : f.clase === 'no' ? 'NO CUMPLE' : 'EVIDENCIA';
    doc.setTextColor(255);
    textoCaja(doc, `${pre} · ${f.item}`, x, yp + 0.3, cw, 6.2, { fs: 7, min: 5, estilo: 'bold', pad: 2 });
    doc.setTextColor(255);
    const hora = f.foto.timestamp ? `Tomada: ${horaFoto(f.foto.timestamp)}` : 'Hora no registrada';
    textoCaja(doc, hora, x, yp + 6.2, cw, 3.2, { fs: 5.8, min: 5, pad: 2 });
    doc.setTextColor(0);
  };

  for (const sec of o.secciones) {
    if (!sec.fotos.length) continue;
    // La banda de la muestra va con al menos una fila de fotos; si no entran, página nueva
    if (sec.banda) {
      const fila = altoFila || calcularFila();
      if (y + altoBanda + 1 + fila > pie + 0.01) nuevaPagina();
      banda(sec.banda);
    }
    for (let k = 0; k < sec.fotos.length; k += 2) {
      if (!altoFila) altoFila = calcularFila();
      if (y + altoFila > pie + 0.01) {
        nuevaPagina();
        if (sec.banda) banda(`${sec.banda} (continuación)`);
        altoFila = calcularFila();
      }
      celda(sec.fotos[k], M, y, altoFila);
      if (sec.fotos[k + 1]) celda(sec.fotos[k + 1], M + cw + gap, y, altoFila);
      y += altoFila + gap;
    }
  }
}

/** Copia de la lista sin fotos: el 1A/2A sale solo con su hoja del formato (sin páginas de fotos). */
export const sinFotos = <T extends Supervisada>(lista: T[]): T[] => lista.map((s) => ({ ...s, evidencias: [] }));

/** Nombre de archivo seguro dentro del ZIP. */
const seguro = (t: string) => t.replace(/[\\/:*?"<>|]+/g, '_').trim();

/**
 * Agrega al ZIP las carpetas Formato_1A/ (un PDF por reporte SP) y Formato_2A/ (uno por coincidente).
 * La lista ya debe venir numerada. Devuelve cuántos PDF se agregaron.
 * Con fotos de evidencia, cada PDF suma páginas desde la 2; sin ellas queda de una página.
 */
export async function agregarFormatosAlZip(
  zip: JSZip,
  lista: Supervisada[],
  hoja: string,
  incluir: { f1A: boolean; f2A: boolean; fotos?: boolean },
): Promise<{ n1A: number; n2A: number }> {
  const { proc } = procedimiento(hoja);
  if (incluir.fotos === false) lista = sinFotos(lista);
  let n1A = 0,
    n2A = 0;
  if (incluir.f1A) {
    for (const [num, b] of bloques1A(lista)) {
      zip.file(`Formato_1A/${seguro(`${num}_${proc}`)}.pdf`, (await pdf1A(b, hoja)).output('blob'));
      n1A++;
    }
  }
  if (incluir.f2A) {
    const coincidentes = lista.filter((s) => s.tipo === '2A').sort((a, b) => a.reporte.localeCompare(b.reporte));
    for (const s of coincidentes) {
      zip.file(`Formato_2A/${seguro(`${s.reporte}_${s.punto.suministro}`)}.pdf`, (await pdf2A(s, hoja)).output('blob'));
      n2A++;
    }
  }
  return { n1A, n2A };
}
