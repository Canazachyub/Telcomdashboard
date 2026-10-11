import { useState, useMemo, useCallback, useEffect } from 'react';
import { usePointsStore, useSheetStructure, useTecnicos, useDistritos, useFilters } from '../stores/pointsStore';
import type { GpsPointExtended, PhotoLink } from '../types/point';
import {
  Search, Download, FileText, Users, Building2, RotateCcw,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Eye, FileDown, Loader2,
  Package, X
} from 'lucide-react';
import { PageHeader, StatCard, SectionCard, EmptyState, ui } from '../components/ui';
import PhotoGalleryModal from '../components/PhotoGalleryModal';
import JSZip from 'jszip';
import { OBSERVACION_EJECUTADO, OBSERVACION_NO_EJECUTADO } from '../config/report';
import { downloadCsv } from '../utils/csv';
import { generateReportePDF, generateReportePDFSimple, generateReportePDFBlob, generateReportePDFSimpleBlob, DEFAULT_OBSERVACION, type ReportePDFData } from '../utils/pdfGenerator';

// Configuracion de paginacion
const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

type SortField = 'numero' | 'serie' | 'suministro' | 'ruta' | 'lectura' | 'fechaContraste' | 'fechaSupervision';
type SortDirection = 'asc' | 'desc';

// ========== CATEGORÍAS DE OBSERVACIÓN ==========
// Textos exactos que se registran desde la app móvil (configurables en src/config/report.ts)

// Tipos de categoría para exportación
type ObservacionCategory = 'todos' | 'ejecutados' | 'no_ejecutados' | 'observaciones' | 'sin_observacion';

// Función para clasificar un item según su observación
// Sin observación registrada => categoria propia SIN OBSERVACION
// (ya no se asume NO EJECUTADO, eso afirmaba algo que nadie registró)
function getObservacionCategory(observacion: string | undefined): ObservacionCategory {
  if (!observacion || observacion.trim() === '') {
    return 'sin_observacion';
  }

  const obs = observacion.trim().toUpperCase();

  if (obs === OBSERVACION_EJECUTADO.toUpperCase()) {
    return 'ejecutados';
  }

  if (obs === OBSERVACION_NO_EJECUTADO.toUpperCase()) {
    return 'no_ejecutados';
  }

  // Cualquier otro texto es una observación escrita personalizada
  return 'observaciones';
}

// Tipo para el reporte (solo puntos con lectura)
interface ReporteItem {
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

// Formatear fecha para mostrar
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

export default function ReportesPage() {
  const { filteredPoints, selectedSheet, isLoading, setFilter: setStoreFilter, resetFilters } = usePointsStore();
  const sheetStructure = useSheetStructure();
  const tecnicos = useTecnicos();
  const distritos = useDistritos();
  const filters = useFilters();

  // Estado de paginacion
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Estado de ordenamiento
  const [sortField, setSortField] = useState<SortField>('numero');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Estado del modal de fotos
  const [selectedPhotos, setSelectedPhotos] = useState<{photos: PhotoLink[], suministro: string, initialIndex: number} | null>(null);

  // Estado para observaciones editables (por suministro)
  // Se inicializa con los datos del servidor (notas) si existen
  const [observaciones, setObservaciones] = useState<Record<string, string>>({});

  // Al cambiar de jornada: volver a la pagina 1 y descartar observaciones editadas
  // de la jornada anterior (las claves son por suministro y se mezclaban entre jornadas)
  useEffect(() => {
    setCurrentPage(1);
    setObservaciones({});
  }, [selectedSheet]);

  // Inicializar observaciones con los datos del servidor (campo notas) cuando cambian los puntos
  useEffect(() => {
    const initialObservaciones: Record<string, string> = {};
    filteredPoints.forEach((point) => {
      const extPoint = point as GpsPointExtended;
      // Si el punto tiene notas del servidor, usarlas como valor inicial
      if (extPoint.notas && extPoint.notas.trim() !== '') {
        initialObservaciones[extPoint.suministro] = extPoint.notas;
      }
    });
    // Solo actualizar si hay observaciones nuevas del servidor
    if (Object.keys(initialObservaciones).length > 0) {
      setObservaciones(prev => ({
        ...initialObservaciones,
        ...prev  // Preservar ediciones manuales del usuario
      }));
    }
  }, [filteredPoints]);

  // Estado para PDF en proceso
  const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);

  // Estado para batch export
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [showBatchModal, setShowBatchModal] = useState(false);

  // Filtrar solo puntos con lectura y construir items de reporte
  const reporteItems = useMemo(() => {
    const items: ReporteItem[] = [];
    let numero = 1;

    filteredPoints.forEach((point) => {
      const extPoint = point as GpsPointExtended;

      // Solo incluir puntos que tienen lectura
      if (extPoint.lectura !== null && extPoint.lectura !== undefined && extPoint.lectura !== '') {
        items.push({
          numero: numero++,
          serie: extPoint.serie?.toString() || '-',
          suministro: extPoint.suministro,
          ruta: extPoint.codigoRuta?.toString() || '-',
          lectura: extPoint.lectura,
          fechaContraste: formatDate(extPoint.fecha),
          fechaSupervision: formatDate(extPoint.fechaSupervision),
          tecnico: extPoint.tecnico || '-',
          distrito: extPoint.distrito || '-',
          photoLinks: extPoint.photoLinks || [],
          point: extPoint,
        });
      }
    });

    return items;
  }, [filteredPoints]);

  // Calcular maximo de fotos para columnas dinamicas
  const maxPhotos = useMemo(() => {
    return Math.max(...reporteItems.map(item => item.photoLinks.length), 0);
  }, [reporteItems]);

  // Ordenar items
  const sortedItems = useMemo(() => {
    const sorted = [...reporteItems].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'numero':
          aVal = a.numero;
          bVal = b.numero;
          break;
        case 'serie':
          aVal = a.serie;
          bVal = b.serie;
          break;
        case 'suministro':
          aVal = a.suministro;
          bVal = b.suministro;
          break;
        case 'ruta':
          aVal = a.ruta;
          bVal = b.ruta;
          break;
        case 'lectura':
          aVal = typeof a.lectura === 'number' ? a.lectura : parseFloat(a.lectura.toString()) || 0;
          bVal = typeof b.lectura === 'number' ? b.lectura : parseFloat(b.lectura.toString()) || 0;
          break;
        case 'fechaContraste':
          aVal = a.fechaContraste;
          bVal = b.fechaContraste;
          break;
        case 'fechaSupervision':
          aVal = a.fechaSupervision;
          bVal = b.fechaSupervision;
          break;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const comparison = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [reporteItems, sortField, sortDirection]);

  // Calcular paginacion
  const totalPages = Math.ceil(sortedItems.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedItems = sortedItems.slice(startIndex, endIndex);

  // Handlers
  const handleFilterChange = (key: Parameters<typeof setStoreFilter>[0], value: string) => {
    setCurrentPage(1);
    setStoreFilter(key, value);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setCurrentPage(1);
    resetFilters();
  };

  // Manejar cambio de observacion
  const handleObservacionChange = useCallback((suministro: string, value: string) => {
    setObservaciones(prev => ({
      ...prev,
      [suministro]: value
    }));
  }, []);

  // Generar PDF individual
  const handleGeneratePDF = useCallback(async (item: ReporteItem, withImages: boolean = true) => {
    setGeneratingPDF(item.suministro);

    try {
      const pdfData: ReportePDFData = {
        numero: item.numero,
        serie: item.serie,
        suministro: item.suministro,
        ruta: item.ruta,
        lectura: item.lectura,
        fechaContraste: item.fechaContraste,
        fechaSupervision: item.fechaSupervision,
        observacion: observaciones[item.suministro] || '',
        photoLinks: item.photoLinks,
        sheetName: selectedSheet || 'Sin Jornada'
      };

      if (withImages) {
        await generateReportePDF(pdfData);
      } else {
        generateReportePDFSimple(pdfData);
      }
    } catch (error) {
      console.error('Error generando PDF:', error);
      alert('Error al generar el PDF. Intente con la opcion sin imagenes.');
    } finally {
      setGeneratingPDF(null);
    }
  }, [observaciones, selectedSheet]);

  // Generar todos los PDFs y empaquetarlos en ZIP
  const handleBatchExport = useCallback(async (withImages: boolean = false) => {
    if (sortedItems.length === 0) return;

    setShowBatchModal(false);
    setIsBatchExporting(true);
    setBatchProgress({ current: 0, total: sortedItems.length, currentFile: '' });

    const zip = new JSZip();
    const folder = zip.folder(`Anexos_${selectedSheet || 'Jornada'}_${new Date().toISOString().split('T')[0]}`);

    if (!folder) {
      alert('Error creando carpeta ZIP');
      setIsBatchExporting(false);
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      setBatchProgress({
        current: i + 1,
        total: sortedItems.length,
        currentFile: `${item.suministro} (${i + 1}/${sortedItems.length})`
      });

      try {
        const pdfData: ReportePDFData = {
          numero: item.numero,
          serie: item.serie,
          suministro: item.suministro,
          ruta: item.ruta,
          lectura: item.lectura,
          fechaContraste: item.fechaContraste,
          fechaSupervision: item.fechaSupervision,
          observacion: observaciones[item.suministro] || '',
          photoLinks: item.photoLinks,
          sheetName: selectedSheet || 'Sin Jornada'
        };

        let result: { blob: Blob; fileName: string };

        if (withImages) {
          result = await generateReportePDFBlob(pdfData);
        } else {
          result = generateReportePDFSimpleBlob(pdfData);
        }

        folder.file(result.fileName, result.blob);
        successCount++;
      } catch (error) {
        console.error(`Error generando PDF para ${item.suministro}:`, error);
        errorCount++;
      }

      // Pequena pausa para no bloquear la UI
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Generar y descargar ZIP
    try {
      setBatchProgress(prev => ({ ...prev, currentFile: 'Comprimiendo ZIP...' }));
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }, (metadata) => {
        setBatchProgress(prev => ({
          ...prev,
          currentFile: `Comprimiendo: ${Math.round(metadata.percent)}%`
        }));
      });

      // Descargar ZIP
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Anexos_${selectedSheet || 'Jornada'}_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(`ZIP generado exitosamente!\n\nPDFs creados: ${successCount}\nErrores: ${errorCount}`);
    } catch (error) {
      console.error('Error generando ZIP:', error);
      alert('Error al generar el archivo ZIP');
    } finally {
      setIsBatchExporting(false);
      setBatchProgress({ current: 0, total: 0, currentFile: '' });
    }
  }, [sortedItems, observaciones, selectedSheet]);

  // Calcular conteos por categoría de observación
  // NOTA: Los items sin observación tienen su propia categoría (SIN OBSERVACION)
  const categoryCounts = useMemo(() => {
    const counts = {
      todos: sortedItems.length,
      ejecutados: 0,
      no_ejecutados: 0,
      observaciones: 0,
      sin_observacion: 0
    };

    sortedItems.forEach(item => {
      const obs = observaciones[item.suministro];
      const category = getObservacionCategory(obs);

      if (category === 'ejecutados') counts.ejecutados++;
      else if (category === 'no_ejecutados') counts.no_ejecutados++;
      else if (category === 'observaciones') counts.observaciones++;
      else if (category === 'sin_observacion') counts.sin_observacion++;
    });

    return counts;
  }, [sortedItems, observaciones]);

  // Generar PDFs filtrados por categoría y empaquetarlos en ZIP
  const handleBatchExportByCategory = useCallback(async (
    category: ObservacionCategory,
    withImages: boolean = false
  ) => {
    // Filtrar items según categoría
    const filteredItems = category === 'todos'
      ? sortedItems
      : sortedItems.filter(item => {
          const obs = observaciones[item.suministro];
          return getObservacionCategory(obs) === category;
        });

    if (filteredItems.length === 0) {
      alert(`No hay items en la categoría seleccionada.`);
      return;
    }

    setShowBatchModal(false);
    setIsBatchExporting(true);
    setBatchProgress({ current: 0, total: filteredItems.length, currentFile: '' });

    // Nombre del ZIP según categoría
    const categoryNames: Record<ObservacionCategory, string> = {
      todos: 'TODOS',
      ejecutados: 'EJECUTADOS',
      no_ejecutados: 'NO_EJECUTADOS',
      observaciones: 'CON_OBSERVACIONES',
      sin_observacion: 'SIN_OBSERVACION'
    };

    const zip = new JSZip();
    const folderName = `Anexos_${categoryNames[category]}_${selectedSheet || 'Jornada'}_${new Date().toISOString().split('T')[0]}`;
    const folder = zip.folder(folderName);

    if (!folder) {
      alert('Error creando carpeta ZIP');
      setIsBatchExporting(false);
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Renumerar items filtrados
    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      setBatchProgress({
        current: i + 1,
        total: filteredItems.length,
        currentFile: `${item.suministro} (${i + 1}/${filteredItems.length})`
      });

      try {
        const pdfData: ReportePDFData = {
          numero: i + 1, // Renumerar según el filtro
          serie: item.serie,
          suministro: item.suministro,
          ruta: item.ruta,
          lectura: item.lectura,
          fechaContraste: item.fechaContraste,
          fechaSupervision: item.fechaSupervision,
          observacion: observaciones[item.suministro] || '',
          photoLinks: item.photoLinks,
          sheetName: selectedSheet || 'Sin Jornada'
        };

        let result: { blob: Blob; fileName: string };

        if (withImages) {
          result = await generateReportePDFBlob(pdfData);
        } else {
          result = generateReportePDFSimpleBlob(pdfData);
        }

        folder.file(result.fileName, result.blob);
        successCount++;
      } catch (error) {
        console.error(`Error generando PDF para ${item.suministro}:`, error);
        errorCount++;
      }

      // Pequeña pausa para no bloquear la UI
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Generar y descargar ZIP
    try {
      setBatchProgress(prev => ({ ...prev, currentFile: 'Comprimiendo ZIP...' }));
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }, (metadata) => {
        setBatchProgress(prev => ({
          ...prev,
          currentFile: `Comprimiendo: ${Math.round(metadata.percent)}%`
        }));
      });

      // Descargar ZIP
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${folderName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(`ZIP generado exitosamente!\n\nCategoría: ${categoryNames[category]}\nPDFs creados: ${successCount}\nErrores: ${errorCount}`);
    } catch (error) {
      console.error('Error generando ZIP:', error);
      alert('Error al generar el archivo ZIP');
    } finally {
      setIsBatchExporting(false);
      setBatchProgress({ current: 0, total: 0, currentFile: '' });
    }
  }, [sortedItems, observaciones, selectedSheet]);

  // Renderizar icono de ordenamiento
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="text-gray-400" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-electric" />
      : <ArrowDown size={14} className="text-electric" />;
  };

  // Abrir foto en modal
  const handleOpenPhoto = (photos: PhotoLink[], suministro: string, initialIndex: number = 0) => {
    if (photos.length > 0) {
      setSelectedPhotos({ photos, suministro, initialIndex });
    }
  };

  // Exportar a CSV (BOM + celdas neutralizadas via helper compartido)
  const exportToCSV = () => {
    // Headers dinamicos con columnas de fotos y observacion
    const headers = ['N', 'Serie', 'Suministro', 'Ruta', 'Lectura', 'F.Contraste', 'F.Supervision', 'Tecnico', 'Distrito', 'Observacion'];
    for (let i = 1; i <= maxPhotos; i++) {
      headers.push(`Foto ${i}`);
    }

    const rows = sortedItems.map((item) => {
      const row: (string | number)[] = [
        item.numero,
        item.serie,
        item.suministro,
        item.ruta,
        item.lectura,
        item.fechaContraste,
        item.fechaSupervision,
        item.tecnico,
        item.distrito,
        observaciones[item.suministro] || '',
      ];

      // Agregar links de fotos
      for (let i = 0; i < maxPhotos; i++) {
        row.push(item.photoLinks[i]?.url || '');
      }

      return row;
    });

    downloadCsv(`reporte_supervision_${selectedSheet}_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const fmt = (n: number) => n.toLocaleString('es-PE');
  const hasActiveFilters = Boolean(filters.search || filters.tecnico !== 'Todos' || filters.distrito !== 'Todos');
  const progressPct = Math.round((reporteItems.length / filteredPoints.length) * 100) || 0;

  // Cabecera de columna ordenable (solo presentación)
  const sortTh = (field: SortField, label: string, tooltip?: string) => (
    <th
      className={`${ui.th} cursor-pointer select-none whitespace-nowrap px-3 transition-colors hover:text-electric`}
      onClick={() => handleSort(field)}
      title={tooltip}
      aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortIcon field={field} />
      </span>
    </th>
  );

  // Botón de exportación por categoría (solo presentación)
  const categoryBtnTone: Record<'green' | 'red' | 'amber' | 'gray', string> = {
    green: 'border-green-200 bg-green-50 text-green-800 hover:border-green-500',
    red: 'border-red-200 bg-red-50 text-red-800 hover:border-red-500',
    amber: 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-500',
    gray: 'border-gray-200 bg-gray-100 text-gray-700 hover:border-gray-400',
  };
  const categoryDot: Record<'green' | 'red' | 'amber' | 'gray', string> = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    gray: 'bg-gray-400',
  };

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-gray-200 border-t-electric"></div>
        <p className="text-sm text-gray-500">Cargando reportes…</p>
      </div>
    );
  }

  const pagerBtn = 'inline-flex items-center justify-center rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 transition hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-700';

  const categoryButtons: { key: Exclude<ObservacionCategory, 'todos'>; label: string; hint: string; tone: 'green' | 'red' | 'amber' | 'gray'; count: number }[] = [
    { key: 'ejecutados', label: 'Ejecutados', hint: `Observación «${OBSERVACION_EJECUTADO}»`, tone: 'green', count: categoryCounts.ejecutados },
    { key: 'no_ejecutados', label: 'No ejecutados', hint: `Observación «${OBSERVACION_NO_EJECUTADO}»`, tone: 'red', count: categoryCounts.no_ejecutados },
    { key: 'observaciones', label: 'Con observaciones', hint: 'Observación escrita a mano', tone: 'amber', count: categoryCounts.observaciones },
    { key: 'sin_observacion', label: 'Sin observación', hint: 'No se registró ninguna observación', tone: 'gray', count: categoryCounts.sin_observacion },
  ];

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <PageHeader
        kicker="Anexos de supervisión"
        title="Reportes de supervisión"
        icon={<FileText size={22} />}
        subtitle={
          selectedSheet
            ? <>Supervisión de programación · Jornada <span className="font-medium text-gray-900">{selectedSheet}</span></>
            : 'Selecciona una jornada para ver sus reportes'
        }
        actions={
          <>
            {/* Boton exportar todos como ZIP */}
            <button
              onClick={() => setShowBatchModal(true)}
              disabled={sortedItems.length === 0 || isBatchExporting}
              className={ui.btnPrimary}
              title="Generar los PDF de los anexos y descargarlos en un ZIP"
            >
              <Package size={16} />
              Exportar PDFs <span className="font-mono">({fmt(sortedItems.length)})</span>
            </button>
            <button
              onClick={exportToCSV}
              disabled={sortedItems.length === 0}
              className={ui.btnSuccess}
              title="Descargar la tabla en CSV"
            >
              <Download size={16} />
              Exportar CSV
            </button>
          </>
        }
      />

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Supervisados con lectura"
          value={fmt(reporteItems.length)}
          hint={<>de <span className="font-mono">{fmt(filteredPoints.length)}</span> filtrados · <span className="font-mono">{progressPct}%</span> completado</>}
          tone="cyan"
          icon={<FileText size={18} />}
        />
        <StatCard label="Ejecutados" value={fmt(categoryCounts.ejecutados)} tone="green" />
        <StatCard label="No ejecutados" value={fmt(categoryCounts.no_ejecutados)} tone="red" />
        <StatCard label="Con observaciones" value={fmt(categoryCounts.observaciones)} tone="amber" />
        <StatCard label="Sin observación" value={fmt(categoryCounts.sin_observacion)} tone="gray" />
      </div>

      {/* Filtros */}
      <SectionCard
        title="Filtros"
        icon={<Search size={16} />}
        actions={
          <button
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-electric"
          >
            <RotateCcw size={14} />
            Limpiar filtros
          </button>
        }
        bodyClassName="p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* Búsqueda */}
          <div className="sm:col-span-2 lg:col-span-6">
            <label className="mb-1 block text-xs font-medium text-gray-500">Buscar</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="Suministro, serie…"
                className={`${ui.input} pl-9`}
              />
            </div>
          </div>

          {/* Filtros extended */}
          {sheetStructure === 'extended' && tecnicos.length > 0 && (
            <div className="lg:col-span-3">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <Users size={12} /> Técnico
              </label>
              <select
                value={filters.tecnico}
                onChange={(e) => handleFilterChange('tecnico', e.target.value)}
                className={ui.input}
              >
                <option value="Todos">Todos los técnicos</option>
                {tecnicos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {sheetStructure === 'extended' && distritos.length > 0 && (
            <div className="lg:col-span-3">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <Building2 size={12} /> Distrito
              </label>
              <select
                value={filters.distrito}
                onChange={(e) => handleFilterChange('distrito', e.target.value)}
                className={ui.input}
              >
                <option value="Todos">Todos los distritos</option>
                {distritos.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-3 text-xs text-gray-500">
          Mostrando <span className="font-mono text-gray-700">{fmt(reporteItems.length)}</span> suministros con lectura registrada
        </div>
      </SectionCard>

      {/* Tabla */}
      <div className={ui.tableWrap}>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-[1] bg-gray-50">
              <tr className={ui.theadRow}>
                {sortTh('numero', 'N.º', 'Número correlativo')}
                {sortTh('serie', 'Serie', 'Serie del medidor')}
                {sortTh('suministro', 'Suministro')}
                {sortTh('ruta', 'Ruta', 'Código de ruta')}
                {sortTh('lectura', 'Lectura', 'Lectura del medidor')}
                {sortTh('fechaContraste', 'Fecha contraste', 'Fecha de contraste')}
                {sortTh('fechaSupervision', 'Fecha supervisión', 'Fecha de supervisión')}
                <th className={`${ui.th} min-w-[220px] whitespace-nowrap px-3`} title="Se incluye en el PDF del anexo. Puedes editarla aquí.">
                  Observación
                </th>
                {/* Columnas dinamicas de fotos */}
                {Array.from({ length: Math.min(maxPhotos, 4) }, (_, i) => (
                  <th key={i} className={`${ui.th} whitespace-nowrap px-2 text-center`} title={`Foto ${i + 1}`}>
                    Foto {i + 1}
                  </th>
                ))}
                {maxPhotos > 4 && (
                  <th className={`${ui.th} whitespace-nowrap px-2 text-center`} title="Fotos adicionales">
                    Más fotos
                  </th>
                )}
                <th className={`${ui.th} whitespace-nowrap px-3 text-center`} title="Descargar el anexo en PDF">
                  PDF
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item, index) => (
                <tr
                  key={`${item.suministro}-${index}`}
                  className={ui.tbodyRow}
                >
                  <td className={`${ui.td} px-3 py-2 font-mono text-gray-500`}>{item.numero}</td>
                  <td className={`${ui.td} whitespace-nowrap px-3 py-2 font-mono text-gray-900`}>{item.serie}</td>
                  <td className={`${ui.td} whitespace-nowrap px-3 py-2 font-mono font-medium text-gray-900`}>{item.suministro}</td>
                  <td className={`${ui.td} whitespace-nowrap px-3 py-2 font-mono`}>{item.ruta}</td>
                  <td className={`${ui.td} px-3 py-2`}>
                    <span className="inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-sm font-semibold text-energy">
                      {item.lectura}
                    </span>
                  </td>
                  <td className={`${ui.td} whitespace-nowrap px-3 py-2 font-mono text-xs`}>{item.fechaContraste}</td>
                  <td className={`${ui.td} whitespace-nowrap px-3 py-2 font-mono text-xs`}>{item.fechaSupervision}</td>
                  {/* Campo de observacion editable */}
                  <td className={`${ui.td} px-3 py-2`}>
                    <input
                      type="text"
                      value={observaciones[item.suministro] ?? ''}
                      onChange={(e) => handleObservacionChange(item.suministro, e.target.value)}
                      placeholder={DEFAULT_OBSERVACION}
                      className={`${ui.input} rounded-lg px-2 py-1 text-xs`}
                      aria-label={`Observación del suministro ${item.suministro}`}
                    />
                  </td>
                  {/* Botones de fotos */}
                  {Array.from({ length: Math.min(maxPhotos, 4) }, (_, i) => (
                    <td key={i} className="px-1 py-2 text-center">
                      {item.photoLinks[i] ? (
                        <button
                          onClick={() => handleOpenPhoto(item.photoLinks, item.suministro, i)}
                          className="rounded-lg p-1.5 text-electric transition-colors hover:bg-gray-100"
                          title={`Ver foto ${i + 1}`}
                          aria-label={`Ver foto ${i + 1}`}
                        >
                          <Eye size={16} />
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                  {maxPhotos > 4 && (
                    <td className="px-1 py-2 text-center">
                      {item.photoLinks.length > 4 && (
                        <button
                          onClick={() => handleOpenPhoto(item.photoLinks, item.suministro, 4)}
                          className="rounded-md border border-gray-200 px-1.5 py-0.5 font-mono text-xs text-electric transition-colors hover:bg-gray-100"
                          title={`Ver ${item.photoLinks.length - 4} fotos más`}
                        >
                          +{item.photoLinks.length - 4}
                        </button>
                      )}
                    </td>
                  )}
                  {/* Boton generar PDF */}
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleGeneratePDF(item, true)}
                        disabled={generatingPDF === item.suministro}
                        className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-800 transition-colors hover:border-red-500 disabled:opacity-50"
                        title="Descargar PDF del anexo (con fotos)"
                        aria-label="Descargar PDF del anexo (con fotos)"
                      >
                        {generatingPDF === item.suministro ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <FileDown size={16} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {paginatedItems.length === 0 && (
          <EmptyState
            icon="reporte"
            title="No hay suministros con lectura registrada"
            description={selectedSheet
              ? 'Cuando los técnicos registren lecturas en esta jornada, aparecerán aquí.'
              : 'Selecciona una jornada con datos supervisados.'}
            action={hasActiveFilters ? (
              <button onClick={handleResetFilters} className={ui.btnSecondary}>
                <RotateCcw size={16} />
                Limpiar filtros
              </button>
            ) : undefined}
          />
        )}

        {/* Paginacion */}
        {sortedItems.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm text-gray-500">
                Filas <span className="font-mono text-gray-900">{fmt(startIndex + 1)}–{fmt(Math.min(endIndex, sortedItems.length))}</span> de{' '}
                <span className="font-mono text-gray-900">{fmt(sortedItems.length)}</span>
              </span>
              <label className="flex items-center gap-2 text-sm text-gray-500">
                Filas por página
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className={`${ui.input} w-auto py-1`}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className={pagerBtn}
              >
                Primera
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={pagerBtn}
                title="Página anterior"
                aria-label="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 text-sm text-gray-500">
                Página <span className="font-mono text-gray-900">{currentPage}</span> de{' '}
                <span className="font-mono text-gray-900">{totalPages || 1}</span>
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className={pagerBtn}
                title="Página siguiente"
                aria-label="Página siguiente"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className={pagerBtn}
              >
                Última
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de fotos */}
      {selectedPhotos && (
        <PhotoGalleryModal
          photos={selectedPhotos.photos}
          suministro={selectedPhotos.suministro}
          initialIndex={selectedPhotos.initialIndex}
          onClose={() => setSelectedPhotos(null)}
        />
      )}

      {/* Modal de seleccion para batch export */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <p className="brand-kicker">Exportación</p>
                <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <Package size={20} className="text-electric" />
                  Exportar PDFs en un ZIP
                </h3>
                <p className="mt-0.5 text-sm text-gray-500">Elige qué anexos incluir en el archivo comprimido</p>
              </div>
              <button
                onClick={() => setShowBatchModal(false)}
                className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                title="Cerrar"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Exportar por categoría (con imágenes) */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Por tipo de observación</h4>
                <p className="mb-3 text-xs text-gray-500">Cada PDF incluye las fotos del suministro.</p>
                <div className="space-y-2">
                  {categoryButtons.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => handleBatchExportByCategory(c.key, true)}
                      disabled={c.count === 0}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${categoryBtnTone[c.tone]}`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${categoryDot[c.tone]}`} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{c.label}</span>
                          <span className="block truncate text-xs opacity-75">{c.hint}</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-lg font-semibold">{fmt(c.count)}</span>
                        <FileDown size={16} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Exportar todos */}
              <div className="border-t border-gray-200 pt-5">
                <h4 className="text-sm font-semibold text-gray-900">
                  Todos los anexos <span className="font-mono font-normal text-gray-500">({fmt(sortedItems.length)})</span>
                </h4>
                <p className="mb-3 text-xs text-gray-500">
                  Sin fotos es mucho más rápido; con fotos puede tardar varios minutos.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => handleBatchExport(false)}
                    className={ui.btnPrimary}
                  >
                    <FileDown size={16} />
                    Todos sin fotos (rápido)
                  </button>

                  <button
                    onClick={() => handleBatchExport(true)}
                    className={ui.btnSecondary}
                  >
                    <FileDown size={16} />
                    Todos con fotos (lento)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-5 py-4">
              <button
                onClick={() => setShowBatchModal(false)}
                className={ui.btnSecondary}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Indicador de progreso batch export */}
      {isBatchExporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="text-center">
              <Loader2 size={44} className="mx-auto mb-4 animate-spin text-electric" />
              <p className="brand-kicker">Exportación en curso</p>
              <h3 className="mb-2 mt-1 text-lg font-semibold text-gray-900">
                Generando PDFs…
              </h3>
              <p className="mb-4 truncate font-mono text-sm text-gray-600">
                {batchProgress.currentFile}
              </p>

              {/* Barra de progreso */}
              <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-electric shadow-[0_0_12px_rgb(0_212_255/0.6)] transition-all duration-300"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-gray-500">
                <span className="font-mono text-gray-900">{fmt(batchProgress.current)}</span> de{' '}
                <span className="font-mono text-gray-900">{fmt(batchProgress.total)}</span>{' '}
                (<span className="font-mono">{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>)
              </p>
              <p className="mt-3 text-xs text-gray-500">No cierres ni recargues esta pestaña.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
