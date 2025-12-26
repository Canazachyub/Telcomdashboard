import { jsPDF } from 'jspdf';
import type { PhotoLink } from '../types/point';
import { extractDriveFileId } from './driveUtils';

// Observacion por defecto
export const DEFAULT_OBSERVACION = 'CONTRATISTA MALCOM NO EJECUTA EL CONTRASTE EN LA FECHA PROGRAMADA';

// Tipo para los datos del reporte
export interface ReportePDFData {
  numero: number;
  serie: string;
  suministro: string;
  ruta: string;
  lectura: string | number;
  fechaContraste: string;
  fechaSupervision: string;
  observacion: string;
  photoLinks: PhotoLink[];
  sheetName: string;
}

// Colores del tema
const COLORS = {
  primary: { r: 30, g: 58, b: 138 },      // Azul oscuro
  secondary: { r: 59, g: 130, b: 246 },   // Azul claro
  accent: { r: 16, g: 185, b: 129 },      // Verde
  dark: { r: 31, g: 41, b: 55 },          // Gris oscuro
  light: { r: 243, g: 244, b: 246 },      // Gris claro
  white: { r: 255, g: 255, b: 255 },
  border: { r: 209, g: 213, b: 219 },     // Gris borde
};

// Obtener todas las URLs posibles para una imagen de Google Drive
function getDriveUrls(url: string): string[] {
  const fileId = extractDriveFileId(url);
  if (fileId) {
    return [
      `https://lh3.googleusercontent.com/d/${fileId}=w800`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      `https://drive.google.com/uc?id=${fileId}`,
    ];
  }
  // Si no es URL de Drive, devolver la URL original
  return [url];
}

// Cargar una imagen desde una URL con timeout
function loadImageFromUrl(imageUrl: string, timeout: number = 15000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      img.src = '';
      resolve(null);
    }, timeout);

    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };

    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };

    img.src = imageUrl;
  });
}

// Convertir imagen a base64
function imageToBase64(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    const maxSize = 800;
    let width = img.width;
    let height = img.height;

    if (width > maxSize || height > maxSize) {
      const ratio = Math.min(maxSize / width, maxSize / height);
      width = width * ratio;
      height = height * ratio;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', 0.85);
    }
    return null;
  } catch {
    return null;
  }
}

// Convertir imagen de URL a base64 con reintentos
async function loadImageAsBase64(url: string): Promise<string | null> {
  if (!url || url.trim() === '') {
    return null;
  }

  const urls = getDriveUrls(url);

  // Intentar cada URL en orden
  for (const imageUrl of urls) {
    const img = await loadImageFromUrl(imageUrl, 15000);
    if (img && img.width > 0 && img.height > 0) {
      const base64 = imageToBase64(img);
      if (base64) {
        return base64;
      }
    }
    // Pequeña pausa entre intentos para no saturar
    await new Promise(r => setTimeout(r, 200));
  }

  // Si todas fallan, intentar una vez más con la primera URL y más tiempo
  const lastTry = await loadImageFromUrl(urls[0], 20000);
  if (lastTry && lastTry.width > 0 && lastTry.height > 0) {
    return imageToBase64(lastTry);
  }

  return null;
}

// Cargar multiples imagenes secuencialmente (evita saturar el servidor)
async function loadImagesSequentially(photos: PhotoLink[]): Promise<(string | null)[]> {
  const results: (string | null)[] = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const base64 = await loadImageAsBase64(photo.url);
    results.push(base64);

    // Pausa entre cada imagen para evitar rate limiting
    if (i < photos.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}

// Dibujar rectangulo con bordes redondeados
function drawRoundedRect(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  style: 'S' | 'F' | 'FD' = 'S'
): void {
  const r = radius;
  doc.roundedRect(x, y, width, height, r, r, style);
}

// Dibujar celda de datos con etiqueta y valor
function drawDataCell(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string | number | null | undefined
): void {
  // Fondo de la celda
  doc.setFillColor(COLORS.light.r, COLORS.light.g, COLORS.light.b);
  doc.setDrawColor(COLORS.border.r, COLORS.border.g, COLORS.border.b);
  doc.setLineWidth(0.3);
  drawRoundedRect(doc, x, y, width, height, 2, 'FD');

  // Etiqueta
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.text(label, x + 3, y + 4);

  // Valor - convertir a string
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);

  // Convertir valor a string de forma segura
  const stringValue = value !== null && value !== undefined ? String(value) : '-';

  // Truncar valor si es muy largo
  const maxWidth = width - 6;
  let displayValue = stringValue;
  while (doc.getTextWidth(displayValue) > maxWidth && displayValue.length > 3) {
    displayValue = displayValue.slice(0, -1);
  }
  if (displayValue !== stringValue) {
    displayValue = displayValue.slice(0, -2) + '...';
  }

  doc.text(displayValue, x + 3, y + height - 3);
}

// Generar PDF para un reporte individual
export async function generateReportePDF(data: ReportePDFData): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - (margin * 2);

  let yPos = margin;

  // ========== HEADER CON FONDO ==========
  const headerHeight = 28;

  // Fondo del header con gradiente simulado
  doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  // Linea decorativa inferior
  doc.setFillColor(COLORS.secondary.r, COLORS.secondary.g, COLORS.secondary.b);
  doc.rect(0, headerHeight - 2, pageWidth, 2, 'F');

  // Titulo principal
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TELCOM ENERGY', pageWidth / 2, 10, { align: 'center' });

  // Subtitulo
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('ANEXO FOTOGRAFICO', pageWidth / 2, 17, { align: 'center' });

  // Linea de supervision
  doc.setFontSize(9);
  const supervisionText = `SUPERVISION DE PROGRAMACION - P227 - ${data.sheetName}`;
  doc.text(supervisionText, pageWidth / 2, 24, { align: 'center' });

  yPos = headerHeight + 6;

  // ========== DATOS EN GRID DE CAJAS ==========
  const cellHeight = 12;
  const cellGap = 3;
  const cellsPerRow = 4;
  const cellWidth = (contentWidth - (cellGap * (cellsPerRow - 1))) / cellsPerRow;

  // Primera fila de datos
  const row1Data = [
    { label: 'N°', value: data.numero },
    { label: 'SERIE', value: data.serie },
    { label: 'SUMINISTRO', value: data.suministro },
    { label: 'RUTA', value: data.ruta },
  ];

  row1Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth + cellGap));
    drawDataCell(doc, x, yPos, cellWidth, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + cellGap;

  // Segunda fila de datos
  const row2Data = [
    { label: 'LECTURA', value: data.lectura },
    { label: 'F. CONTRASTE', value: data.fechaContraste },
    { label: 'F. SUPERVISION', value: data.fechaSupervision },
  ];

  const cellWidth2 = (contentWidth - (cellGap * 2)) / 3;
  row2Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth2 + cellGap));
    drawDataCell(doc, x, yPos, cellWidth2, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + 5;

  // ========== OBSERVACION ==========
  const obsText = data.observacion && data.observacion.trim() !== ''
    ? data.observacion
    : DEFAULT_OBSERVACION;

  // Caja de observacion
  doc.setFillColor(255, 251, 235); // Amarillo muy suave
  doc.setDrawColor(251, 191, 36); // Borde amarillo
  doc.setLineWidth(0.5);

  const obsLines = doc.splitTextToSize(obsText, contentWidth - 16);
  const obsBoxHeight = Math.max(12, (obsLines.length * 4) + 8);

  drawRoundedRect(doc, margin, yPos, contentWidth, obsBoxHeight, 2, 'FD');

  // Icono/etiqueta de observacion
  doc.setFillColor(251, 191, 36);
  doc.setDrawColor(251, 191, 36);
  drawRoundedRect(doc, margin + 2, yPos + 2, 22, 5, 1, 'F');

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.text('OBSERVACION', margin + 4, yPos + 5.5);

  // Texto de observacion
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.text(obsLines, margin + 4, yPos + 11);

  yPos += obsBoxHeight + 5;

  // ========== TITULO SECCION FOTOS ==========
  doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  drawRoundedRect(doc, margin, yPos, contentWidth, 7, 2, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('EVIDENCIA FOTOGRAFICA', pageWidth / 2, yPos + 5, { align: 'center' });

  yPos += 10;

  // ========== AREA DE FOTOS (2x2 GRID OPTIMIZADO) ==========
  const footerHeight = 12;
  const availableHeight = pageHeight - yPos - footerHeight - margin;

  const photosToShow = data.photoLinks.slice(0, 4);
  const numPhotos = photosToShow.length;

  if (numPhotos > 0) {
    // Grid siempre 2x2 para mejor uso del espacio
    const photoGap = 4;
    const cols = 2;
    const rows = 2;

    // Calcular tamaño óptimo de cada celda
    const cellWidth = (contentWidth - photoGap) / cols;
    const cellHeight = (availableHeight - photoGap) / rows;

    // Cargar imagenes
    // Cargar imagenes secuencialmente para evitar rate limiting
    const images = await loadImagesSequentially(photosToShow);

    // Dibujar cada foto
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);

      const x = margin + (col * (cellWidth + photoGap));
      const y = yPos + (row * (cellHeight + photoGap));

      // Marco exterior con sombra simulada
      doc.setFillColor(220, 220, 220);
      doc.rect(x + 1, y + 1, cellWidth, cellHeight, 'F');

      // Fondo blanco de la celda
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(COLORS.border.r, COLORS.border.g, COLORS.border.b);
      doc.setLineWidth(0.4);
      doc.rect(x, y, cellWidth, cellHeight, 'FD');

      if (i < numPhotos) {
        const imageData = images[i];
        const photo = photosToShow[i];

        // Etiqueta superior
        const labelHeight = 8;
        doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
        doc.rect(x, y, cellWidth, labelHeight, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        const photoLabel = `FOTO ${i + 1}${photo.lectura ? ` - LECTURA: ${photo.lectura}` : ''}`;
        doc.text(photoLabel, x + cellWidth / 2, y + 5.5, { align: 'center' });

        if (imageData) {
          try {
            // Calcular dimensiones de imagen para llenar el espacio
            const imgPadding = 2;
            const imgAreaWidth = cellWidth - (imgPadding * 2);
            const imgAreaHeight = cellHeight - labelHeight - (imgPadding * 2);

            doc.addImage(
              imageData,
              'JPEG',
              x + imgPadding,
              y + labelHeight + imgPadding,
              imgAreaWidth,
              imgAreaHeight,
              undefined,
              'MEDIUM'
            );
          } catch {
            drawPlaceholder(doc, x, y + labelHeight, cellWidth, cellHeight - labelHeight, 'Error al cargar');
          }
        } else {
          drawPlaceholder(doc, x, y + labelHeight, cellWidth, cellHeight - labelHeight, 'Imagen no disponible');
        }
      } else {
        // Celda vacia
        doc.setFillColor(COLORS.light.r, COLORS.light.g, COLORS.light.b);
        doc.rect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1, 'F');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180, 180, 180);
        doc.text('Sin foto', x + cellWidth / 2, y + cellHeight / 2, { align: 'center' });
      }
    }
  } else {
    // Sin fotos
    doc.setFillColor(COLORS.light.r, COLORS.light.g, COLORS.light.b);
    drawRoundedRect(doc, margin, yPos, contentWidth, 40, 3, 'F');

    doc.setFontSize(11);
    doc.setTextColor(150, 150, 150);
    doc.text('No hay fotos disponibles para este registro', pageWidth / 2, yPos + 22, { align: 'center' });
  }

  // ========== FOOTER ==========
  doc.setFillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, 'F');

  doc.setFontSize(7);
  doc.setTextColor(200, 200, 200);
  doc.text(
    'TELCOM ENERGY - Sistema de Supervision',
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' }
  );

  // Guardar PDF
  const fileName = `Anexo_${data.suministro}_${data.numero}.pdf`;
  doc.save(fileName);
}

// Generar PDF como Blob (para batch export)
export async function generateReportePDFBlob(data: ReportePDFData): Promise<{ blob: Blob; fileName: string }> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - (margin * 2);

  let yPos = margin;

  // ========== HEADER CON FONDO ==========
  const headerHeight = 28;
  doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  doc.setFillColor(COLORS.secondary.r, COLORS.secondary.g, COLORS.secondary.b);
  doc.rect(0, headerHeight - 2, pageWidth, 2, 'F');

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TELCOM ENERGY', pageWidth / 2, 10, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('ANEXO FOTOGRAFICO', pageWidth / 2, 17, { align: 'center' });

  doc.setFontSize(9);
  const supervisionText = `SUPERVISION DE PROGRAMACION - P227 - ${data.sheetName}`;
  doc.text(supervisionText, pageWidth / 2, 24, { align: 'center' });

  yPos = headerHeight + 6;

  // ========== DATOS EN GRID DE CAJAS ==========
  const cellHeight = 12;
  const cellGap = 3;
  const cellsPerRow = 4;
  const cellWidth = (contentWidth - (cellGap * (cellsPerRow - 1))) / cellsPerRow;

  const row1Data = [
    { label: 'N', value: data.numero },
    { label: 'SERIE', value: data.serie },
    { label: 'SUMINISTRO', value: data.suministro },
    { label: 'RUTA', value: data.ruta },
  ];

  row1Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth + cellGap));
    drawDataCell(doc, x, yPos, cellWidth, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + cellGap;

  const row2Data = [
    { label: 'LECTURA', value: data.lectura },
    { label: 'F. CONTRASTE', value: data.fechaContraste },
    { label: 'F. SUPERVISION', value: data.fechaSupervision },
  ];

  const cellWidth2 = (contentWidth - (cellGap * 2)) / 3;
  row2Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth2 + cellGap));
    drawDataCell(doc, x, yPos, cellWidth2, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + 5;

  // ========== OBSERVACION ==========
  const obsText = data.observacion && data.observacion.trim() !== ''
    ? data.observacion
    : DEFAULT_OBSERVACION;

  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(251, 191, 36);
  doc.setLineWidth(0.5);

  const obsLines = doc.splitTextToSize(obsText, contentWidth - 16);
  const obsBoxHeight = Math.max(12, (obsLines.length * 4) + 8);

  drawRoundedRect(doc, margin, yPos, contentWidth, obsBoxHeight, 2, 'FD');

  doc.setFillColor(251, 191, 36);
  doc.setDrawColor(251, 191, 36);
  drawRoundedRect(doc, margin + 2, yPos + 2, 22, 5, 1, 'F');

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.text('OBSERVACION', margin + 4, yPos + 5.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.text(obsLines, margin + 4, yPos + 11);

  yPos += obsBoxHeight + 5;

  // ========== TITULO SECCION FOTOS ==========
  doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  drawRoundedRect(doc, margin, yPos, contentWidth, 7, 2, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('EVIDENCIA FOTOGRAFICA', pageWidth / 2, yPos + 5, { align: 'center' });

  yPos += 10;

  // ========== AREA DE FOTOS (2x2 GRID OPTIMIZADO) ==========
  const footerHeight = 12;
  const availableHeight = pageHeight - yPos - footerHeight - margin;

  const photosToShow = data.photoLinks.slice(0, 4);
  const numPhotos = photosToShow.length;

  if (numPhotos > 0) {
    const photoGap = 4;
    const cols = 2;
    const rows = 2;

    const cellWidthPhoto = (contentWidth - photoGap) / cols;
    const cellHeightPhoto = (availableHeight - photoGap) / rows;

    // Cargar imagenes secuencialmente para evitar rate limiting
    const images = await loadImagesSequentially(photosToShow);

    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);

      const x = margin + (col * (cellWidthPhoto + photoGap));
      const y = yPos + (row * (cellHeightPhoto + photoGap));

      doc.setFillColor(220, 220, 220);
      doc.rect(x + 1, y + 1, cellWidthPhoto, cellHeightPhoto, 'F');

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(COLORS.border.r, COLORS.border.g, COLORS.border.b);
      doc.setLineWidth(0.4);
      doc.rect(x, y, cellWidthPhoto, cellHeightPhoto, 'FD');

      if (i < numPhotos) {
        const imageData = images[i];
        const photo = photosToShow[i];

        const labelHeight = 8;
        doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
        doc.rect(x, y, cellWidthPhoto, labelHeight, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        const photoLabel = `FOTO ${i + 1}${photo.lectura ? ` - LECTURA: ${photo.lectura}` : ''}`;
        doc.text(photoLabel, x + cellWidthPhoto / 2, y + 5.5, { align: 'center' });

        if (imageData) {
          try {
            const imgPadding = 2;
            const imgAreaWidth = cellWidthPhoto - (imgPadding * 2);
            const imgAreaHeight = cellHeightPhoto - labelHeight - (imgPadding * 2);

            doc.addImage(
              imageData,
              'JPEG',
              x + imgPadding,
              y + labelHeight + imgPadding,
              imgAreaWidth,
              imgAreaHeight,
              undefined,
              'MEDIUM'
            );
          } catch {
            drawPlaceholder(doc, x, y + labelHeight, cellWidthPhoto, cellHeightPhoto - labelHeight, 'Error al cargar');
          }
        } else {
          drawPlaceholder(doc, x, y + labelHeight, cellWidthPhoto, cellHeightPhoto - labelHeight, 'Imagen no disponible');
        }
      } else {
        doc.setFillColor(COLORS.light.r, COLORS.light.g, COLORS.light.b);
        doc.rect(x + 0.5, y + 0.5, cellWidthPhoto - 1, cellHeightPhoto - 1, 'F');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180, 180, 180);
        doc.text('Sin foto', x + cellWidthPhoto / 2, y + cellHeightPhoto / 2, { align: 'center' });
      }
    }
  } else {
    doc.setFillColor(COLORS.light.r, COLORS.light.g, COLORS.light.b);
    drawRoundedRect(doc, margin, yPos, contentWidth, 40, 3, 'F');

    doc.setFontSize(11);
    doc.setTextColor(150, 150, 150);
    doc.text('No hay fotos disponibles para este registro', pageWidth / 2, yPos + 22, { align: 'center' });
  }

  // ========== FOOTER ==========
  doc.setFillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, 'F');

  doc.setFontSize(7);
  doc.setTextColor(200, 200, 200);
  doc.text(
    'TELCOM ENERGY - Sistema de Supervision',
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' }
  );

  // Retornar como Blob
  const fileName = `Anexo_${data.suministro}_${data.numero}.pdf`;
  const blob = doc.output('blob');
  return { blob, fileName };
}

// Generar PDF simple como Blob (sin imagenes, mas rapido)
export function generateReportePDFSimpleBlob(data: ReportePDFData): { blob: Blob; fileName: string } {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - (margin * 2);

  let yPos = 0;

  // Header
  const headerHeight = 28;
  doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  doc.setFillColor(COLORS.secondary.r, COLORS.secondary.g, COLORS.secondary.b);
  doc.rect(0, headerHeight - 2, pageWidth, 2, 'F');

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TELCOM ENERGY', pageWidth / 2, 10, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('ANEXO FOTOGRAFICO', pageWidth / 2, 17, { align: 'center' });

  doc.setFontSize(9);
  doc.text(`SUPERVISION DE PROGRAMACION - P227 - ${data.sheetName}`, pageWidth / 2, 24, { align: 'center' });

  yPos = headerHeight + 6;

  // Datos
  const cellHeight = 12;
  const cellGap = 3;
  const cellWidth = (contentWidth - (cellGap * 3)) / 4;

  const row1Data = [
    { label: 'N', value: data.numero },
    { label: 'SERIE', value: data.serie },
    { label: 'SUMINISTRO', value: data.suministro },
    { label: 'RUTA', value: data.ruta },
  ];

  row1Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth + cellGap));
    drawDataCell(doc, x, yPos, cellWidth, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + cellGap;

  const row2Data = [
    { label: 'LECTURA', value: data.lectura },
    { label: 'F. CONTRASTE', value: data.fechaContraste },
    { label: 'F. SUPERVISION', value: data.fechaSupervision },
  ];

  const cellWidth2 = (contentWidth - (cellGap * 2)) / 3;
  row2Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth2 + cellGap));
    drawDataCell(doc, x, yPos, cellWidth2, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + 5;

  // Observacion
  const obsText = data.observacion && data.observacion.trim() !== ''
    ? data.observacion
    : DEFAULT_OBSERVACION;

  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(251, 191, 36);
  doc.setLineWidth(0.5);

  const obsLines = doc.splitTextToSize(obsText, contentWidth - 16);
  const obsBoxHeight = Math.max(12, (obsLines.length * 4) + 8);

  drawRoundedRect(doc, margin, yPos, contentWidth, obsBoxHeight, 2, 'FD');

  doc.setFillColor(251, 191, 36);
  drawRoundedRect(doc, margin + 2, yPos + 2, 22, 5, 1, 'F');

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.text('OBSERVACION', margin + 4, yPos + 5.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(obsLines, margin + 4, yPos + 11);

  yPos += obsBoxHeight + 5;

  // Enlaces de fotos
  doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  drawRoundedRect(doc, margin, yPos, contentWidth, 7, 2, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('ENLACES A FOTOS', pageWidth / 2, yPos + 5, { align: 'center' });

  yPos += 10;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);

  const photosToShow = data.photoLinks.slice(0, 4);
  if (photosToShow.length > 0) {
    photosToShow.forEach((photo, idx) => {
      const photoLabel = `Foto ${idx + 1}${photo.lectura ? ` (Lect: ${photo.lectura})` : ''}:`;
      doc.setFont('helvetica', 'bold');
      doc.text(photoLabel, margin, yPos);
      yPos += 4;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(COLORS.secondary.r, COLORS.secondary.g, COLORS.secondary.b);
      const urlLines = doc.splitTextToSize(photo.url, contentWidth);
      doc.text(urlLines, margin, yPos);
      doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
      yPos += urlLines.length * 4 + 3;
    });
  } else {
    doc.text('No hay fotos disponibles', margin, yPos);
  }

  // Footer
  doc.setFillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');

  doc.setFontSize(7);
  doc.setTextColor(200, 200, 200);
  doc.text(
    'TELCOM ENERGY - Sistema de Supervision',
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' }
  );

  const fileName = `Anexo_${data.suministro}_${data.numero}.pdf`;
  const blob = doc.output('blob');
  return { blob, fileName };
}

// Dibujar placeholder para imagen no disponible
function drawPlaceholder(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string
): void {
  doc.setFillColor(245, 245, 245);
  doc.rect(x + 2, y + 2, width - 4, height - 4, 'F');

  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(text, x + width / 2, y + height / 2, { align: 'center' });
}

// Generar PDF sin imagenes (mas rapido, para cuando hay problemas de CORS)
export function generateReportePDFSimple(data: ReportePDFData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - (margin * 2);

  let yPos = 0;

  // ========== HEADER ==========
  const headerHeight = 28;
  doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  doc.setFillColor(COLORS.secondary.r, COLORS.secondary.g, COLORS.secondary.b);
  doc.rect(0, headerHeight - 2, pageWidth, 2, 'F');

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TELCOM ENERGY', pageWidth / 2, 10, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('ANEXO FOTOGRAFICO', pageWidth / 2, 17, { align: 'center' });

  doc.setFontSize(9);
  doc.text(`SUPERVISION DE PROGRAMACION - P227 - ${data.sheetName}`, pageWidth / 2, 24, { align: 'center' });

  yPos = headerHeight + 6;

  // ========== DATOS ==========
  const cellHeight = 12;
  const cellGap = 3;
  const cellWidth = (contentWidth - (cellGap * 3)) / 4;

  const row1Data = [
    { label: 'N°', value: data.numero },
    { label: 'SERIE', value: data.serie },
    { label: 'SUMINISTRO', value: data.suministro },
    { label: 'RUTA', value: data.ruta },
  ];

  row1Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth + cellGap));
    drawDataCell(doc, x, yPos, cellWidth, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + cellGap;

  const row2Data = [
    { label: 'LECTURA', value: data.lectura },
    { label: 'F. CONTRASTE', value: data.fechaContraste },
    { label: 'F. SUPERVISION', value: data.fechaSupervision },
  ];

  const cellWidth2 = (contentWidth - (cellGap * 2)) / 3;
  row2Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth2 + cellGap));
    drawDataCell(doc, x, yPos, cellWidth2, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + 5;

  // ========== OBSERVACION ==========
  const obsText = data.observacion && data.observacion.trim() !== ''
    ? data.observacion
    : DEFAULT_OBSERVACION;

  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(251, 191, 36);
  doc.setLineWidth(0.5);

  const obsLines = doc.splitTextToSize(obsText, contentWidth - 16);
  const obsBoxHeight = Math.max(12, (obsLines.length * 4) + 8);

  drawRoundedRect(doc, margin, yPos, contentWidth, obsBoxHeight, 2, 'FD');

  doc.setFillColor(251, 191, 36);
  drawRoundedRect(doc, margin + 2, yPos + 2, 22, 5, 1, 'F');

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.text('OBSERVACION', margin + 4, yPos + 5.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(obsLines, margin + 4, yPos + 11);

  yPos += obsBoxHeight + 5;

  // ========== ENLACES DE FOTOS ==========
  doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  drawRoundedRect(doc, margin, yPos, contentWidth, 7, 2, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('ENLACES A FOTOS', pageWidth / 2, yPos + 5, { align: 'center' });

  yPos += 10;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);

  const photosToShow = data.photoLinks.slice(0, 4);
  if (photosToShow.length > 0) {
    photosToShow.forEach((photo, idx) => {
      const photoLabel = `Foto ${idx + 1}${photo.lectura ? ` (Lect: ${photo.lectura})` : ''}:`;
      doc.setFont('helvetica', 'bold');
      doc.text(photoLabel, margin, yPos);
      yPos += 4;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(COLORS.secondary.r, COLORS.secondary.g, COLORS.secondary.b);
      const urlLines = doc.splitTextToSize(photo.url, contentWidth);
      doc.text(urlLines, margin, yPos);
      doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
      yPos += urlLines.length * 4 + 3;
    });
  } else {
    doc.text('No hay fotos disponibles', margin, yPos);
  }

  // ========== FOOTER ==========
  doc.setFillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');

  doc.setFontSize(7);
  doc.setTextColor(200, 200, 200);
  doc.text(
    'TELCOM ENERGY - Sistema de Supervision',
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' }
  );

  const fileName = `Anexo_${data.suministro}_${data.numero}.pdf`;
  doc.save(fileName);
}
