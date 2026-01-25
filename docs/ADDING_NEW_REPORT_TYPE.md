# Guia para Agregar Nuevos Tipos de Reportes

Este documento sirve como plantilla e instrucciones para Claude Code al momento de agregar un nuevo tipo de reporte al TelcomDashboard.

## Estructura de Archivos para un Nuevo Reporte

Cada tipo de reporte requiere los siguientes archivos:

```
src/
├── services/
│   └── [nuevoReporte]Service.ts    # Servicio para llamadas API
├── utils/
│   └── pdf[NuevoReporte].ts        # Generador de PDF
├── pages/
│   └── Reportes[NuevoReporte]Page.tsx  # Pagina/componente principal
```

---

## Paso 1: Crear el Servicio (API)

Archivo: `src/services/[nuevoReporte]Service.ts`

```typescript
import axios from 'axios';
import { API_POINTS } from '../config/api';

// Tipos para el nuevo reporte
export interface NuevoReportePoint {
  numero: number;
  // ... campos especificos del reporte
  photoLinks: { url: string; nombre: string }[];
}

export interface NuevoReporteDataResponse {
  success: boolean;
  message: string;
  points: NuevoReportePoint[];
  // ... campos adicionales
}

/**
 * Obtiene los datos del nuevo reporte
 */
export async function getNuevoReporteData(sheetName: string): Promise<NuevoReporteDataResponse | null> {
  try {
    const response = await axios.get(
      `${API_POINTS}?action=getNuevoReporteData&sheetName=${encodeURIComponent(sheetName)}`
    );
    return response.data;
  } catch (error) {
    console.error('Error obteniendo datos:', error);
    return null;
  }
}

/**
 * Verifica si una hoja es del tipo correcto
 */
export function isNuevoReporteSheet(sheetName: string): boolean {
  if (!sheetName) return false;
  const name = sheetName.toLowerCase();
  return name.startsWith('nuevoreporte') || name.includes('patron_del_nombre');
}

/**
 * Obtiene imagen como base64 (para evitar CORS)
 */
export async function getImageBase64(fileIdOrUrl: string): Promise<{ success: boolean; base64?: string; mimeType?: string } | null> {
  try {
    let fileId = fileIdOrUrl;
    if (fileIdOrUrl.includes('drive.google.com')) {
      const match = fileIdOrUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match) fileId = match[1];
    }
    const response = await axios.get(
      `${API_POINTS}?action=getImageBase64&fileId=${encodeURIComponent(fileId)}`
    );
    return response.data;
  } catch (error) {
    return null;
  }
}
```

---

## Paso 2: Crear el Generador de PDF

Archivo: `src/utils/pdf[NuevoReporte].ts`

```typescript
import { jsPDF } from 'jspdf';
import { getImageBase64 } from '../services/[nuevoReporte]Service';

// Tipo para los datos del PDF
export interface NuevoReportePDFData {
  numero: number;
  suministro: string;
  // ... campos especificos
  photoLinks: { url: string; nombre: string }[];
}

// Colores del tema (personalizar segun el tipo de reporte)
const COLORS = {
  primary: { r: 30, g: 58, b: 138 },      // Azul oscuro
  accent: { r: 234, g: 88, b: 12 },       // Color distintivo del reporte
  dark: { r: 31, g: 41, b: 55 },
  light: { r: 243, g: 244, b: 246 },
  white: { r: 255, g: 255, b: 255 },
  border: { r: 209, g: 213, b: 219 },
};

// Cargar imagen como base64 desde backend
async function loadImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await getImageBase64(url);
    if (response?.success && response.base64) {
      return `data:${response.mimeType || 'image/jpeg'};base64,${response.base64}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Genera PDF y lo descarga
 */
export async function generateNuevoReportePDF(data: NuevoReportePDFData): Promise<void> {
  const result = await generateNuevoReportePDFBlob(data);

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
 * Genera PDF como Blob (para batch export)
 */
export async function generateNuevoReportePDFBlob(data: NuevoReportePDFData): Promise<{ blob: Blob; fileName: string }> {
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
  doc.setFillColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TELCOM ENERGY', pageWidth / 2, 10, { align: 'center' });

  doc.setFontSize(12);
  doc.text('TITULO DEL REPORTE', pageWidth / 2, 17, { align: 'center' });

  yPos = headerHeight + 6;

  // ========== CONTENIDO ==========
  // Agregar campos, tablas, imagenes segun necesidad
  // ...

  // ========== FOOTER ==========
  doc.setFillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
  doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');

  doc.setFontSize(7);
  doc.setTextColor(200, 200, 200);
  doc.text('TELCOM ENERGY - Sistema de Supervision', pageWidth / 2, pageHeight - 5, { align: 'center' });

  // IMPORTANTE: Nombre de archivo SIN numero al final
  const fileName = `NuevoReporte_${data.suministro}.pdf`;
  const blob = doc.output('blob');
  return { blob, fileName };
}
```

---

## Paso 3: Crear la Pagina/Componente

Archivo: `src/pages/Reportes[NuevoReporte]Page.tsx`

```typescript
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText, Download, Search, Loader2, Package, X, RefreshCw,
  ChevronLeft, ChevronRight, AlertCircle
} from 'lucide-react';
import JSZip from 'jszip';
import {
  getNuevoReporteData,
  isNuevoReporteSheet,
  type NuevoReportePoint
} from '../services/[nuevoReporte]Service';
import { getSheets } from '../services/pointsService';
import {
  generateNuevoReportePDF,
  generateNuevoReportePDFBlob,
  type NuevoReportePDFData
} from '../utils/pdf[NuevoReporte]';

export default function ReportesNuevoReportePage() {
  // Estados
  const [sheets, setSheets] = useState<{ name: string; id: number }[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [points, setPoints] = useState<NuevoReportePoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // ... mas estados segun necesidad

  // Cargar hojas al inicio
  useEffect(() => {
    async function loadSheets() {
      const allSheets = await getSheets();
      const filteredSheets = allSheets.filter(s => isNuevoReporteSheet(s.name));
      setSheets(filteredSheets);
      if (filteredSheets.length > 0) {
        setSelectedSheet(filteredSheets[0].name);
      }
    }
    loadSheets();
  }, []);

  // Cargar datos cuando cambia la hoja
  useEffect(() => {
    if (selectedSheet) {
      loadData();
    }
  }, [selectedSheet]);

  async function loadData() {
    setIsLoading(true);
    try {
      const response = await getNuevoReporteData(selectedSheet);
      if (response?.success) {
        setPoints(response.points);
      }
    } finally {
      setIsLoading(false);
    }
  }

  // Generar PDF individual
  const handleGeneratePDF = useCallback(async (point: NuevoReportePoint) => {
    const pdfData: NuevoReportePDFData = {
      numero: point.numero,
      suministro: point.suministro,
      // ... mapear campos
      photoLinks: point.photoLinks || []
    };
    await generateNuevoReportePDF(pdfData);
  }, []);

  // Exportar todos como ZIP
  const handleBatchExport = useCallback(async () => {
    const zip = new JSZip();
    const folder = zip.folder('Reportes');

    for (const point of points) {
      const pdfData: NuevoReportePDFData = { /* ... */ };
      const result = await generateNuevoReportePDFBlob(pdfData);
      folder?.file(result.fileName, result.blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    // Descargar ZIP...
  }, [points]);

  return (
    <div className="space-y-6">
      {/* Header, filtros, tabla, modales... */}
    </div>
  );
}
```

---

## Paso 4: Agregar Ruta en App.tsx

Archivo: `src/App.tsx`

```typescript
// Agregar import
import ReportesNuevoReportePage from './pages/ReportesNuevoReportePage';

// Agregar ruta dentro del Layout (rutas protegidas)
<Route
  path="nuevoreporte"
  element={
    <SupervisorRoute>
      <ReportesNuevoReportePage />
    </SupervisorRoute>
  }
/>
```

---

## Paso 5: Agregar Menu en Sidebar

Archivo: `src/components/layout/Sidebar.tsx`

```typescript
// Agregar import del icono
import { FileText, AlertCircle, /* NuevoIcono */ } from 'lucide-react';

// Agregar item al array menuItems
const menuItems: MenuItem[] = [
  // ... items existentes
  {
    name: 'Nuevo Reporte',
    path: '/nuevoreporte',
    icon: <NuevoIcono size={20} />,
    roles: ['admin', 'supervisor'],
  },
];
```

---

## Paso 6: Backend (Code.gs)

Agregar en el archivo `Code.gs` de Google Apps Script:

### 6.1 Agregar handler en doGet

```javascript
// En la funcion doGet, agregar case:
case 'getNuevoReporteData':
  return nuevoReporte_getData(e.parameter.sheetName);
```

### 6.2 Crear funcion para obtener datos

```javascript
/**
 * Obtiene datos del nuevo reporte formateados para Dashboard
 */
function nuevoReporte_getData(sheetName) {
  try {
    if (!sheetName) {
      return createResponse(false, 'Nombre de hoja requerido');
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return createResponse(false, 'Hoja no encontrada: ' + sheetName);
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return createResponse(true, 'Sin datos', { points: [] });
    }

    // Leer datos y formulas para extraer URLs de HYPERLINK
    const dataRange = sheet.getRange(2, 1, lastRow - 1, /* num columnas */);
    const data = dataRange.getValues();
    const formulas = dataRange.getFormulas();

    // Procesar y agrupar segun logica del reporte
    const points = [];
    // ...

    return createResponse(true, 'OK', {
      points: points,
      totalCount: points.length
    });

  } catch (error) {
    Logger.log('Error: ' + error);
    return createResponse(false, 'Error: ' + error.toString());
  }
}
```

---

## Checklist Final

- [ ] Servicio creado en `src/services/`
- [ ] Generador PDF creado en `src/utils/`
- [ ] Pagina creada en `src/pages/`
- [ ] Ruta agregada en `App.tsx`
- [ ] Menu agregado en `Sidebar.tsx`
- [ ] Endpoint agregado en `Code.gs` (doGet)
- [ ] Funcion de datos agregada en `Code.gs`
- [ ] Deploy actualizado en Google Apps Script
- [ ] Build exitoso (`npm run build`)

---

## Convenciones de Nombres

| Tipo | Patron | Ejemplo |
|------|--------|---------|
| Servicio | `[tipo]Service.ts` | `observadosService.ts` |
| PDF | `pdf[Tipo].ts` | `pdfObservados.ts` |
| Pagina | `Reportes[Tipo]Page.tsx` | `ReportesObservadosPage.tsx` |
| Ruta | `/[tipo]` | `/observados` |
| Archivo PDF | `[Tipo]_[suministro].pdf` | `Observado_10030006033.pdf` |

---

## Colores Sugeridos por Tipo de Reporte

| Tipo | Color Header | RGB |
|------|--------------|-----|
| Reportes normales | Azul | `30, 58, 138` |
| Observados | Naranja | `234, 88, 12` |
| Rechazados | Rojo | `220, 38, 38` |
| Aprobados | Verde | `16, 185, 129` |
| Pendientes | Amarillo | `245, 158, 11` |

---

## Notas Importantes

1. **CORS**: Siempre usar el endpoint `getImageBase64` del backend para cargar imagenes de Google Drive
2. **Nombres de archivo**: NO incluir numeros secuenciales en nombres de PDF (solo suministro)
3. **Semana**: Usar `point.semana || semanaGlobal` para respetar semana individual de cada registro
4. **URLs de HYPERLINK**: Usar `getFormulas()` ademas de `getValues()` para extraer URLs reales
5. **Timeout**: En backend, manejar limite de 5 minutos con PropertiesService para guardar progreso
