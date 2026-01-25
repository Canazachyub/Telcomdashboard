import { jsPDF } from 'jspdf';
import { getImageBase64 } from '../services/observadosService';

// Tipo para los datos del reporte OBSERVADOS
export interface ObservadoPDFData {
  numero: number;
  serie: string;
  suministro: string;
  codigoRuta: string;
  tecnico: string;
  fechaContraste: string;
  syncedAt: string;
  observacion: string;  // Campo Notas de la hoja
  semana: string;
  photoLinks: { url: string; nombre: string }[];
}

// Colores del tema (igual que pdfGenerator.ts)
const COLORS = {
  primary: { r: 30, g: 58, b: 138 },      // Azul oscuro
  secondary: { r: 59, g: 130, b: 246 },   // Azul claro
  accent: { r: 16, g: 185, b: 129 },      // Verde
  dark: { r: 31, g: 41, b: 55 },          // Gris oscuro
  light: { r: 243, g: 244, b: 246 },      // Gris claro
  white: { r: 255, g: 255, b: 255 },
  border: { r: 209, g: 213, b: 219 },     // Gris borde
  orange: { r: 234, g: 88, b: 12 },       // Naranja para OBSERVADOS
};

// Cargar imagen como base64 usando el endpoint del backend (evita CORS)
async function loadImageAsBase64(url: string): Promise<string | null> {
  if (!url || url.trim() === '') {
    return null;
  }

  try {
    const response = await getImageBase64(url);
    if (response && response.success && response.base64) {
      // Construir data URL
      const mimeType = response.mimeType || 'image/jpeg';
      return `data:${mimeType};base64,${response.base64}`;
    }
    return null;
  } catch (error) {
    console.error('Error cargando imagen:', error);
    return null;
  }
}

// Cargar múltiples imágenes secuencialmente
async function loadImagesSequentially(photos: { url: string; nombre: string }[]): Promise<(string | null)[]> {
  const results: (string | null)[] = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const base64 = await loadImageAsBase64(photo.url);
    results.push(base64);

    // Pequeña pausa entre requests para no sobrecargar
    if (i < photos.length - 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return results;
}

// Dibujar rectángulo con bordes redondeados
function drawRoundedRect(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  style: 'S' | 'F' | 'FD' = 'S'
): void {
  doc.roundedRect(x, y, width, height, radius, radius, style);
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
  doc.setFillColor(COLORS.light.r, COLORS.light.g, COLORS.light.b);
  doc.setDrawColor(COLORS.border.r, COLORS.border.g, COLORS.border.b);
  doc.setLineWidth(0.3);
  drawRoundedRect(doc, x, y, width, height, 2, 'FD');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.text(label, x + 3, y + 4);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);

  const stringValue = value !== null && value !== undefined ? String(value) : '-';
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

/**
 * Genera PDF para un reporte OBSERVADO individual (con imágenes)
 */
export async function generateObservadoPDF(data: ObservadoPDFData): Promise<void> {
  const result = await generateObservadoPDFBlob(data);

  // Descargar
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Genera PDF como Blob para un reporte OBSERVADO (para batch export)
 */
export async function generateObservadoPDFBlob(data: ObservadoPDFData): Promise<{ blob: Blob; fileName: string }> {
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

  // ========== HEADER CON FONDO NARANJA (diferente al normal) ==========
  const headerHeight = 28;
  doc.setFillColor(COLORS.orange.r, COLORS.orange.g, COLORS.orange.b);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.rect(0, headerHeight - 2, pageWidth, 2, 'F');

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TELCOM ENERGY', pageWidth / 2, 10, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('ANEXO FOTOGRAFICO - OBSERVADOS', pageWidth / 2, 17, { align: 'center' });

  doc.setFontSize(9);
  const supervisionText = `SUPERVISION DE SUMINISTROS OBSERVADOS - P227 - SEMANA ${data.semana || '?'}`;
  doc.text(supervisionText, pageWidth / 2, 24, { align: 'center' });

  yPos = headerHeight + 6;

  // ========== DATOS EN GRID DE CAJAS ==========
  const cellHeight = 12;
  const cellGap = 3;

  // Primera fila: N°, SERIE, SUMINISTRO, RUTA
  const cellsPerRow = 4;
  const cellWidth = (contentWidth - (cellGap * (cellsPerRow - 1))) / cellsPerRow;

  const row1Data = [
    { label: 'N°', value: data.numero },
    { label: 'SERIE', value: data.serie },
    { label: 'SUMINISTRO', value: data.suministro },
    { label: 'RUTA', value: data.codigoRuta },
  ];

  row1Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth + cellGap));
    drawDataCell(doc, x, yPos, cellWidth, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + cellGap;

  // Segunda fila: TECNICO, F.CONTRASTE, F.SYNC
  const row2Data = [
    { label: 'TECNICO', value: data.tecnico },
    { label: 'F. CONTRASTE', value: data.fechaContraste },
    { label: 'F. SYNC', value: data.syncedAt },
  ];

  const cellWidth2 = (contentWidth - (cellGap * 2)) / 3;
  row2Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth2 + cellGap));
    drawDataCell(doc, x, yPos, cellWidth2, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + 5;

  // ========== OBSERVACIÓN / MOTIVO ==========
  const obsText = data.observacion || 'Sin observación registrada';

  // Caja naranja para observación (diferente al amarillo del normal)
  doc.setFillColor(255, 237, 213); // Naranja muy suave
  doc.setDrawColor(COLORS.orange.r, COLORS.orange.g, COLORS.orange.b);
  doc.setLineWidth(0.5);

  const obsLines = doc.splitTextToSize(obsText, contentWidth - 16);
  const obsBoxHeight = Math.max(12, (obsLines.length * 4) + 8);

  drawRoundedRect(doc, margin, yPos, contentWidth, obsBoxHeight, 2, 'FD');

  // Etiqueta de observación
  doc.setFillColor(COLORS.orange.r, COLORS.orange.g, COLORS.orange.b);
  doc.setDrawColor(COLORS.orange.r, COLORS.orange.g, COLORS.orange.b);
  drawRoundedRect(doc, margin + 2, yPos + 2, 35, 5, 1, 'F');

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('MOTIVO / OBSERVACION', margin + 4, yPos + 5.5);

  // Texto de observación
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.text(obsLines, margin + 4, yPos + 11);

  yPos += obsBoxHeight + 5;

  // ========== TITULO SECCION FOTOS ==========
  doc.setFillColor(COLORS.orange.r, COLORS.orange.g, COLORS.orange.b);
  drawRoundedRect(doc, margin, yPos, contentWidth, 7, 2, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('EVIDENCIA FOTOGRAFICA', pageWidth / 2, yPos + 5, { align: 'center' });

  yPos += 10;

  // ========== AREA DE FOTOS (2x2 GRID) ==========
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

    // Cargar imágenes
    const images = await loadImagesSequentially(photosToShow);

    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);

      const x = margin + (col * (cellWidthPhoto + photoGap));
      const y = yPos + (row * (cellHeightPhoto + photoGap));

      // Sombra
      doc.setFillColor(220, 220, 220);
      doc.rect(x + 1, y + 1, cellWidthPhoto, cellHeightPhoto, 'F');

      // Fondo blanco
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(COLORS.border.r, COLORS.border.g, COLORS.border.b);
      doc.setLineWidth(0.4);
      doc.rect(x, y, cellWidthPhoto, cellHeightPhoto, 'FD');

      if (i < numPhotos) {
        const imageData = images[i];
        const photo = photosToShow[i];

        // Etiqueta superior
        const labelHeight = 8;
        doc.setFillColor(COLORS.orange.r, COLORS.orange.g, COLORS.orange.b);
        doc.rect(x, y, cellWidthPhoto, labelHeight, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        const photoLabel = `FOTO ${i + 1}${photo.nombre ? ` - ${photo.nombre.substring(0, 20)}` : ''}`;
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
        // Celda vacía
        doc.setFillColor(COLORS.light.r, COLORS.light.g, COLORS.light.b);
        doc.rect(x + 0.5, y + 0.5, cellWidthPhoto - 1, cellHeightPhoto - 1, 'F');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180, 180, 180);
        doc.text('Sin foto', x + cellWidthPhoto / 2, y + cellHeightPhoto / 2, { align: 'center' });
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
    'TELCOM ENERGY - Sistema de Supervision - OBSERVADOS',
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' }
  );

  // Retornar como Blob
  const fileName = `Observado_${data.suministro}.pdf`;
  const blob = doc.output('blob');
  return { blob, fileName };
}

/**
 * Genera PDF simple sin imágenes (más rápido)
 */
export function generateObservadoPDFSimpleBlob(data: ObservadoPDFData): { blob: Blob; fileName: string } {
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
  doc.setFillColor(COLORS.orange.r, COLORS.orange.g, COLORS.orange.b);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
  doc.rect(0, headerHeight - 2, pageWidth, 2, 'F');

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TELCOM ENERGY', pageWidth / 2, 10, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('ANEXO FOTOGRAFICO - OBSERVADOS', pageWidth / 2, 17, { align: 'center' });

  doc.setFontSize(9);
  doc.text(`SUPERVISION DE SUMINISTROS OBSERVADOS - P227 - SEMANA ${data.semana || '?'}`, pageWidth / 2, 24, { align: 'center' });

  yPos = headerHeight + 6;

  // Datos
  const cellHeight = 12;
  const cellGap = 3;
  const cellWidth = (contentWidth - (cellGap * 3)) / 4;

  const row1Data = [
    { label: 'N°', value: data.numero },
    { label: 'SERIE', value: data.serie },
    { label: 'SUMINISTRO', value: data.suministro },
    { label: 'RUTA', value: data.codigoRuta },
  ];

  row1Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth + cellGap));
    drawDataCell(doc, x, yPos, cellWidth, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + cellGap;

  const row2Data = [
    { label: 'TECNICO', value: data.tecnico },
    { label: 'F. CONTRASTE', value: data.fechaContraste },
    { label: 'F. SYNC', value: data.syncedAt },
  ];

  const cellWidth2 = (contentWidth - (cellGap * 2)) / 3;
  row2Data.forEach((item, idx) => {
    const x = margin + (idx * (cellWidth2 + cellGap));
    drawDataCell(doc, x, yPos, cellWidth2, cellHeight, item.label, item.value);
  });

  yPos += cellHeight + 5;

  // Observación
  const obsText = data.observacion || 'Sin observación registrada';

  doc.setFillColor(255, 237, 213);
  doc.setDrawColor(COLORS.orange.r, COLORS.orange.g, COLORS.orange.b);
  doc.setLineWidth(0.5);

  const obsLines = doc.splitTextToSize(obsText, contentWidth - 16);
  const obsBoxHeight = Math.max(12, (obsLines.length * 4) + 8);

  drawRoundedRect(doc, margin, yPos, contentWidth, obsBoxHeight, 2, 'FD');

  doc.setFillColor(COLORS.orange.r, COLORS.orange.g, COLORS.orange.b);
  drawRoundedRect(doc, margin + 2, yPos + 2, 35, 5, 1, 'F');

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('MOTIVO / OBSERVACION', margin + 4, yPos + 5.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.text(obsLines, margin + 4, yPos + 11);

  yPos += obsBoxHeight + 5;

  // Enlaces de fotos
  doc.setFillColor(COLORS.orange.r, COLORS.orange.g, COLORS.orange.b);
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
      const photoLabel = `Foto ${idx + 1}${photo.nombre ? ` (${photo.nombre.substring(0, 30)})` : ''}:`;
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
    'TELCOM ENERGY - Sistema de Supervision - OBSERVADOS',
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' }
  );

  const fileName = `Observado_${data.suministro}.pdf`;
  const blob = doc.output('blob');
  return { blob, fileName };
}
