import { useState, useMemo, useCallback } from 'react';
import { usePointsStore, useSheetStructure, useTecnicos, useDistritos, useFilters } from '../stores/pointsStore';
import type { GpsPointExtended, PhotoLink } from '../types/point';
import {
  Search, Download, FileText, Users, Building2, RotateCcw,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Eye, FileDown, Loader2,
  Package, X
} from 'lucide-react';
import PhotoGalleryModal from '../components/PhotoGalleryModal';
import JSZip from 'jszip';
import { generateReportePDF, generateReportePDFSimple, generateReportePDFBlob, generateReportePDFSimpleBlob, DEFAULT_OBSERVACION, type ReportePDFData } from '../utils/pdfGenerator';

// Configuracion de paginacion
const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

type SortField = 'numero' | 'serie' | 'suministro' | 'ruta' | 'lectura' | 'fechaContraste' | 'fechaSupervision';
type SortDirection = 'asc' | 'desc';

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
  const [observaciones, setObservaciones] = useState<Record<string, string>>({});

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

  // Renderizar icono de ordenamiento
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="text-gray-400" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-blue-600" />
      : <ArrowDown size={14} className="text-blue-600" />;
  };

  // Abrir foto en modal
  const handleOpenPhoto = (photos: PhotoLink[], suministro: string, initialIndex: number = 0) => {
    if (photos.length > 0) {
      setSelectedPhotos({ photos, suministro, initialIndex });
    }
  };

  // Exportar a CSV
  const exportToCSV = () => {
    // Headers dinamicos con columnas de fotos y observacion
    const headers = ['N', 'Serie', 'Suministro', 'Ruta', 'Lectura', 'F.Contraste', 'F.Supervision', 'Tecnico', 'Distrito', 'Observacion'];
    for (let i = 1; i <= maxPhotos; i++) {
      headers.push(`Foto ${i}`);
    }

    const rows = sortedItems.map((item) => {
      const row = [
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

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte_supervision_${selectedSheet}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="text-blue-600" />
            Reportes de Supervision
          </h1>
          <p className="text-gray-500">
            {selectedSheet
              ? `SUPERVISION DE PROGRAMACION - P227 - ${selectedSheet}`
              : 'Selecciona una jornada'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Boton exportar todos como ZIP */}
          <button
            onClick={() => setShowBatchModal(true)}
            disabled={sortedItems.length === 0 || isBatchExporting}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Package size={18} />
            Exportar {sortedItems.length} PDFs
          </button>
          <button
            onClick={exportToCSV}
            disabled={sortedItems.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-600 font-medium">Supervisados con Lectura</p>
            <p className="text-3xl font-bold text-blue-900">{reporteItems.length}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">de {filteredPoints.length} filtrados</p>
            <p className="text-sm text-gray-500">{Math.round((reporteItems.length / filteredPoints.length) * 100) || 0}% completado</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Busqueda */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="Buscar suministro, serie..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Filtros extended */}
          {sheetStructure === 'extended' && tecnicos.length > 0 && (
            <div className="flex items-center gap-2">
              <Users size={18} className="text-gray-500" />
              <select
                value={filters.tecnico}
                onChange={(e) => handleFilterChange('tecnico', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="Todos">Todos los tecnicos</option>
                {tecnicos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {sheetStructure === 'extended' && distritos.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-gray-500" />
              <select
                value={filters.distrito}
                onChange={(e) => handleFilterChange('distrito', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="Todos">Todos los distritos</option>
                {distritos.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {/* Reset filtros */}
          <button
            onClick={handleResetFilters}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
          >
            <RotateCcw size={18} />
            Limpiar
          </button>
        </div>

        <div className="mt-3 text-sm text-gray-500">
          Mostrando {reporteItems.length} suministros con lectura registrada
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="text-left py-3 px-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort('numero')}
                >
                  <span className="flex items-center gap-1">
                    N
                    <SortIcon field="numero" />
                  </span>
                </th>
                <th
                  className="text-left py-3 px-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort('serie')}
                >
                  <span className="flex items-center gap-1">
                    Serie
                    <SortIcon field="serie" />
                  </span>
                </th>
                <th
                  className="text-left py-3 px-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort('suministro')}
                >
                  <span className="flex items-center gap-1">
                    Suministro
                    <SortIcon field="suministro" />
                  </span>
                </th>
                <th
                  className="text-left py-3 px-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort('ruta')}
                >
                  <span className="flex items-center gap-1">
                    Ruta
                    <SortIcon field="ruta" />
                  </span>
                </th>
                <th
                  className="text-left py-3 px-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort('lectura')}
                >
                  <span className="flex items-center gap-1">
                    Lectura
                    <SortIcon field="lectura" />
                  </span>
                </th>
                <th
                  className="text-left py-3 px-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort('fechaContraste')}
                >
                  <span className="flex items-center gap-1">
                    F.Cont.
                    <SortIcon field="fechaContraste" />
                  </span>
                </th>
                <th
                  className="text-left py-3 px-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort('fechaSupervision')}
                >
                  <span className="flex items-center gap-1">
                    F.Sup.
                    <SortIcon field="fechaSupervision" />
                  </span>
                </th>
                <th className="text-left py-3 px-3 text-sm font-medium text-gray-500 whitespace-nowrap min-w-[200px]">
                  Observacion
                </th>
                {/* Columnas dinamicas de fotos */}
                {Array.from({ length: Math.min(maxPhotos, 4) }, (_, i) => (
                  <th key={i} className="text-center py-3 px-2 text-sm font-medium text-gray-500 whitespace-nowrap">
                    F{i + 1}
                  </th>
                ))}
                {maxPhotos > 4 && (
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-500 whitespace-nowrap">
                    +
                  </th>
                )}
                <th className="text-center py-3 px-3 text-sm font-medium text-gray-500 whitespace-nowrap">
                  PDF
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item, index) => (
                <tr
                  key={`${item.suministro}-${index}`}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-2 px-3 text-sm text-gray-600">{item.numero}</td>
                  <td className="py-2 px-3 text-sm font-mono text-gray-900">{item.serie}</td>
                  <td className="py-2 px-3 text-sm font-medium text-gray-900">{item.suministro}</td>
                  <td className="py-2 px-3 text-sm font-mono text-gray-600">{item.ruta}</td>
                  <td className="py-2 px-3">
                    <span className="px-2 py-0.5 bg-green-100 text-green-800 text-sm font-medium rounded">
                      {item.lectura}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-sm text-gray-600">{item.fechaContraste}</td>
                  <td className="py-2 px-3 text-sm text-gray-600">{item.fechaSupervision}</td>
                  {/* Campo de observacion editable */}
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={observaciones[item.suministro] ?? ''}
                      onChange={(e) => handleObservacionChange(item.suministro, e.target.value)}
                      placeholder={DEFAULT_OBSERVACION}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </td>
                  {/* Botones de fotos */}
                  {Array.from({ length: Math.min(maxPhotos, 4) }, (_, i) => (
                    <td key={i} className="py-2 px-1 text-center">
                      {item.photoLinks[i] ? (
                        <button
                          onClick={() => handleOpenPhoto(item.photoLinks, item.suministro, i)}
                          className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                          title={`Ver foto ${i + 1}`}
                        >
                          <Eye size={16} />
                        </button>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  ))}
                  {maxPhotos > 4 && (
                    <td className="py-2 px-1 text-center">
                      {item.photoLinks.length > 4 && (
                        <button
                          onClick={() => handleOpenPhoto(item.photoLinks, item.suministro, 4)}
                          className="px-1.5 py-0.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                        >
                          +{item.photoLinks.length - 4}
                        </button>
                      )}
                    </td>
                  )}
                  {/* Boton generar PDF */}
                  <td className="py-2 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleGeneratePDF(item, true)}
                        disabled={generatingPDF === item.suministro}
                        className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="Generar PDF con imagenes"
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
          <div className="text-center py-12 text-gray-500">
            <FileText size={48} className="mx-auto mb-4 opacity-50" />
            <p>No hay suministros con lectura registrada</p>
            <p className="text-sm mt-1">Selecciona una jornada con datos supervisados</p>
          </div>
        )}

        {/* Paginacion */}
        {sortedItems.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Mostrando {startIndex + 1}-{Math.min(endIndex, sortedItems.length)} de {sortedItems.length}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Filas:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Primera
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="px-3 py-1 text-sm">
                Pagina {currentPage} de {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Ultima
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Package size={20} />
                Exportar PDFs como ZIP
              </h3>
              <button
                onClick={() => setShowBatchModal(false)}
                className="text-white/80 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Se generaran <span className="font-bold text-red-600">{sortedItems.length}</span> anexos fotograficos
                y se empaquetaran en un archivo ZIP.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => handleBatchExport(false)}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <FileDown size={18} />
                  Sin imagenes (rapido)
                </button>
                <p className="text-xs text-gray-500 text-center -mt-1">
                  PDFs con links a las fotos. Recomendado para +50 registros.
                </p>

                <button
                  onClick={() => handleBatchExport(true)}
                  className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
                >
                  <FileDown size={18} />
                  Con imagenes (lento)
                </button>
                <p className="text-xs text-gray-500 text-center -mt-1">
                  PDFs con fotos embebidas. Puede tardar varios minutos.
                </p>
              </div>

              <button
                onClick={() => setShowBatchModal(false)}
                className="w-full mt-4 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Indicador de progreso batch export */}
      {isBatchExporting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="text-center">
              <Loader2 size={48} className="animate-spin text-red-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Generando PDFs...
              </h3>
              <p className="text-gray-600 mb-4">
                {batchProgress.currentFile}
              </p>

              {/* Barra de progreso */}
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div
                  className="bg-red-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-gray-500">
                {batchProgress.current} de {batchProgress.total} ({Math.round((batchProgress.current / batchProgress.total) * 100)}%)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
