import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText, Download, Search, RotateCcw, Eye, FileDown, Loader2,
  Package, X, FolderSync, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronLeft, ChevronRight, AlertCircle
} from 'lucide-react';
import JSZip from 'jszip';
import PhotoGalleryModal from '../components/PhotoGalleryModal';
import {
  getObservadosData,
  mapearFotosObservados,
  getMapeoStatus,
  isObservadosSheet,
  type ObservadoPoint,
  type MapeoStatusResponse
} from '../services/observadosService';
import { getSheets } from '../services/pointsService';
import {
  generateObservadoPDF,
  generateObservadoPDFBlob,
  generateObservadoPDFSimpleBlob,
  type ObservadoPDFData
} from '../utils/pdfObservados';

// Configuración de paginación
const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

type SortField = 'numero' | 'serie' | 'suministro' | 'tecnico' | 'fechaContraste';
type SortDirection = 'asc' | 'desc';

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

export default function ReportesObservadosPage() {
  // Estado de hojas
  const [sheets, setSheets] = useState<{ name: string; id: number }[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [loadingSheets, setLoadingSheets] = useState(true);

  // Estado de datos
  const [points, setPoints] = useState<ObservadoPoint[]>([]);
  const [semana, setSemana] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Estado de mapeo
  const [isMapping, setIsMapping] = useState(false);
  const [mapeoStatus, setMapeoStatus] = useState<MapeoStatusResponse | null>(null);

  // Estado de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Estado de ordenamiento
  const [sortField, setSortField] = useState<SortField>('numero');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Estado de búsqueda
  const [searchQuery, setSearchQuery] = useState('');

  // Estado del modal de fotos
  const [selectedPhotos, setSelectedPhotos] = useState<{
    photos: { url: string; nombre: string }[];
    suministro: string;
    initialIndex: number;
  } | null>(null);

  // Estado para PDF en proceso
  const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);

  // Estado para batch export
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [showBatchModal, setShowBatchModal] = useState(false);

  // Cargar hojas al inicio
  useEffect(() => {
    async function loadSheets() {
      setLoadingSheets(true);
      try {
        const allSheets = await getSheets();
        // Filtrar solo hojas OBSERVADOS
        const observadosSheets = allSheets.filter(s => isObservadosSheet(s.name));
        setSheets(observadosSheets);

        // Seleccionar la primera si hay
        if (observadosSheets.length > 0 && !selectedSheet) {
          setSelectedSheet(observadosSheets[0].name);
        }
      } catch (error) {
        console.error('Error cargando hojas:', error);
      } finally {
        setLoadingSheets(false);
      }
    }
    loadSheets();
  }, []);

  // Cargar datos cuando cambia la hoja seleccionada
  useEffect(() => {
    if (selectedSheet) {
      loadData();
    }
  }, [selectedSheet]);

  // Cargar datos de la hoja
  async function loadData() {
    if (!selectedSheet) return;

    setIsLoading(true);
    try {
      const response = await getObservadosData(selectedSheet);
      if (response && response.success) {
        setPoints(response.points);
        setSemana(response.semana);
      } else {
        setPoints([]);
        setSemana('');
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      setPoints([]);
    } finally {
      setIsLoading(false);
    }
  }

  // Verificar estado del mapeo periódicamente
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isMapping) {
      interval = setInterval(async () => {
        const status = await getMapeoStatus();
        setMapeoStatus(status);

        if (status && status.status === 'completed') {
          setIsMapping(false);
          // Recargar datos
          loadData();
        }
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isMapping, selectedSheet]);

  // Iniciar mapeo de fotos
  async function handleMapearFotos() {
    if (!selectedSheet) return;

    setIsMapping(true);
    setMapeoStatus(null);

    try {
      const result = await mapearFotosObservados(selectedSheet);

      if (result) {
        if (result.status === 'completed') {
          setIsMapping(false);
          alert(`Mapeo completado!\n\nSuministros procesados: ${result.processed}\nFotos encontradas: ${result.fotosEncontradas}`);
          loadData();
        } else if (result.status === 'in_progress') {
          // El mapeo continúa en segundo plano
          setMapeoStatus({
            success: true,
            message: result.message,
            status: 'in_progress',
            processed: result.processed,
            total: result.total,
            fotosEncontradas: result.fotosEncontradas
          });
        }
      }
    } catch (error) {
      console.error('Error en mapeo:', error);
      setIsMapping(false);
      alert('Error al iniciar el mapeo de fotos');
    }
  }

  // Filtrar puntos por búsqueda
  const filteredPoints = useMemo(() => {
    if (!searchQuery) return points;

    const query = searchQuery.toLowerCase();
    return points.filter(p =>
      p.suministro.toLowerCase().includes(query) ||
      p.serie.toLowerCase().includes(query) ||
      (p.tecnico && p.tecnico.toLowerCase().includes(query)) ||
      (p.notas && p.notas.toLowerCase().includes(query))
    );
  }, [points, searchQuery]);

  // Ordenar puntos
  const sortedPoints = useMemo(() => {
    const sorted = [...filteredPoints].sort((a, b) => {
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
        case 'tecnico':
          aVal = a.tecnico || '';
          bVal = b.tecnico || '';
          break;
        case 'fechaContraste':
          aVal = a.fechaContraste || '';
          bVal = b.fechaContraste || '';
          break;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const comparison = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [filteredPoints, sortField, sortDirection]);

  // Calcular paginación
  const totalPages = Math.ceil(sortedPoints.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPoints = sortedPoints.slice(startIndex, endIndex);

  // Calcular máximo de fotos
  const maxPhotos = useMemo(() => {
    return Math.max(...points.map(p => p.photoLinks?.length || 0), 0);
  }, [points]);

  // Handlers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleReset = () => {
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Abrir foto en modal
  const handleOpenPhoto = (photos: { url: string; nombre: string }[], suministro: string, initialIndex: number = 0) => {
    if (photos && photos.length > 0) {
      setSelectedPhotos({ photos, suministro, initialIndex });
    }
  };

  // Generar PDF individual
  const handleGeneratePDF = useCallback(async (point: ObservadoPoint, withImages: boolean = true) => {
    setGeneratingPDF(point.suministro);

    try {
      const pdfData: ObservadoPDFData = {
        numero: point.numero,
        serie: point.serie,
        suministro: point.suministro,
        codigoRuta: point.codigoRuta,
        tecnico: point.tecnico,
        fechaContraste: formatDate(point.fechaContraste),
        syncedAt: formatDate(point.syncedAt),
        observacion: point.notas,
        semana: point.semana || semana,  // Usar semana individual del punto
        photoLinks: point.photoLinks || []
      };

      if (withImages) {
        await generateObservadoPDF(pdfData);
      } else {
        const result = generateObservadoPDFSimpleBlob(pdfData);
        const url = URL.createObjectURL(result.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error generando PDF:', error);
      alert('Error al generar el PDF');
    } finally {
      setGeneratingPDF(null);
    }
  }, [semana]);

  // Exportar todos los PDFs como ZIP
  const handleBatchExport = useCallback(async (withImages: boolean = false) => {
    if (sortedPoints.length === 0) return;

    setShowBatchModal(false);
    setIsBatchExporting(true);
    setBatchProgress({ current: 0, total: sortedPoints.length, currentFile: '' });

    const zip = new JSZip();
    const folderName = `Observados_SEMANA_${semana || 'X'}_${new Date().toISOString().split('T')[0]}`;
    const folder = zip.folder(folderName);

    if (!folder) {
      alert('Error creando carpeta ZIP');
      setIsBatchExporting(false);
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < sortedPoints.length; i++) {
      const point = sortedPoints[i];
      setBatchProgress({
        current: i + 1,
        total: sortedPoints.length,
        currentFile: `${point.suministro} (${i + 1}/${sortedPoints.length})`
      });

      try {
        const pdfData: ObservadoPDFData = {
          numero: i + 1,  // Renumerar
          serie: point.serie,
          suministro: point.suministro,
          codigoRuta: point.codigoRuta,
          tecnico: point.tecnico,
          fechaContraste: formatDate(point.fechaContraste),
          syncedAt: formatDate(point.syncedAt),
          observacion: point.notas,
          semana: point.semana || semana,  // Usar semana individual del punto
          photoLinks: point.photoLinks || []
        };

        let result: { blob: Blob; fileName: string };

        if (withImages) {
          result = await generateObservadoPDFBlob(pdfData);
        } else {
          result = generateObservadoPDFSimpleBlob(pdfData);
        }

        folder.file(result.fileName, result.blob);
        successCount++;
      } catch (error) {
        console.error(`Error generando PDF para ${point.suministro}:`, error);
        errorCount++;
      }

      // Pausa para no bloquear UI
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

      alert(`ZIP generado exitosamente!\n\nPDFs creados: ${successCount}\nErrores: ${errorCount}`);
    } catch (error) {
      console.error('Error generando ZIP:', error);
      alert('Error al generar el archivo ZIP');
    } finally {
      setIsBatchExporting(false);
      setBatchProgress({ current: 0, total: 0, currentFile: '' });
    }
  }, [sortedPoints, semana]);

  // Exportar a CSV
  const exportToCSV = () => {
    const headers = ['N', 'Serie', 'Suministro', 'Ruta', 'Tecnico', 'F.Contraste', 'F.Sync', 'Observacion', 'Semana', 'Fotos'];

    const rows = sortedPoints.map((point) => [
      point.numero,
      point.serie,
      point.suministro,
      point.codigoRuta,
      point.tecnico,
      point.fechaContraste,
      point.syncedAt,
      point.notas,
      point.semana,
      point.photoLinks?.length || 0
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `observados_semana_${semana}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Renderizar icono de ordenamiento
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="text-gray-400" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-orange-600" />
      : <ArrowDown size={14} className="text-orange-600" />;
  };

  if (loadingSheets) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="text-orange-600" />
            Reportes OBSERVADOS
          </h1>
          <p className="text-gray-500">
            {selectedSheet
              ? `SUPERVISION DE SUMINISTROS OBSERVADOS - P227 - SEMANA ${semana || '?'}`
              : 'Selecciona una hoja de observados'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Selector de hoja */}
          <select
            value={selectedSheet}
            onChange={(e) => {
              setSelectedSheet(e.target.value);
              setCurrentPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2"
            disabled={sheets.length === 0}
          >
            {sheets.length === 0 ? (
              <option value="">No hay hojas OBSERVADOS</option>
            ) : (
              sheets.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))
            )}
          </select>

          {/* Botón mapear fotos */}
          <button
            onClick={handleMapearFotos}
            disabled={!selectedSheet || isMapping}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMapping ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <FolderSync size={18} />
            )}
            {isMapping ? 'Mapeando...' : 'Mapear Fotos'}
          </button>

          {/* Botón recargar */}
          <button
            onClick={loadData}
            disabled={!selectedSheet || isLoading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Estado del mapeo */}
      {isMapping && mapeoStatus && mapeoStatus.status === 'in_progress' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Loader2 size={24} className="animate-spin text-orange-600" />
            <div className="flex-1">
              <p className="font-medium text-orange-800">Mapeando fotos desde Google Drive...</p>
              <p className="text-sm text-orange-600">
                Procesados: {mapeoStatus.processed || 0} / {mapeoStatus.total || '?'} |
                Fotos encontradas: {mapeoStatus.fotosEncontradas || 0}
              </p>
              <p className="text-xs text-orange-500 mt-1">
                El proceso continúa automáticamente si excede 5 minutos
              </p>
            </div>
          </div>
          <div className="mt-3 w-full bg-orange-200 rounded-full h-2">
            <div
              className="bg-orange-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${mapeoStatus.total ? (mapeoStatus.processed! / mapeoStatus.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-orange-600 font-medium">Suministros Observados</p>
            <p className="text-3xl font-bold text-orange-900">{points.length}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Fotos totales: {points.reduce((acc, p) => acc + (p.photoLinks?.length || 0), 0)}</p>
            <p className="text-sm text-gray-500">Semana: {semana || '-'}</p>
          </div>
        </div>
      </div>

      {/* Barra de acciones */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Búsqueda */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Buscar suministro, serie, técnico..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
          >
            <RotateCcw size={18} />
            Limpiar
          </button>

          {/* Exportar ZIP */}
          <button
            onClick={() => setShowBatchModal(true)}
            disabled={sortedPoints.length === 0 || isBatchExporting}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Package size={18} />
            Exportar {sortedPoints.length} PDFs
          </button>

          {/* CSV */}
          <button
            onClick={exportToCSV}
            disabled={sortedPoints.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            CSV
          </button>
        </div>

        <div className="mt-3 text-sm text-gray-500">
          Mostrando {sortedPoints.length} suministros
          {searchQuery && ` (filtrados de ${points.length})`}
        </div>
      </div>

      {/* Mensaje si no hay hojas */}
      {sheets.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <AlertCircle size={48} className="mx-auto text-yellow-500 mb-4" />
          <h3 className="text-lg font-medium text-yellow-800">No hay hojas OBSERVADOS</h3>
          <p className="text-yellow-600 mt-2">
            Crea una hoja cuyo nombre empiece con "Observados" (ej: "Observados Semana 45")
          </p>
        </div>
      )}

      {/* Tabla */}
      {selectedSheet && (
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
                  <th className="text-left py-3 px-3 text-sm font-medium text-gray-500 whitespace-nowrap">
                    Ruta
                  </th>
                  <th
                    className="text-left py-3 px-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                    onClick={() => handleSort('tecnico')}
                  >
                    <span className="flex items-center gap-1">
                      Tecnico
                      <SortIcon field="tecnico" />
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
                  <th className="text-left py-3 px-3 text-sm font-medium text-gray-500 whitespace-nowrap min-w-[200px]">
                    Observacion
                  </th>
                  {/* Columnas de fotos */}
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
                {isLoading ? (
                  <tr>
                    <td colSpan={10 + Math.min(maxPhotos, 4)} className="text-center py-12">
                      <Loader2 size={32} className="animate-spin text-orange-600 mx-auto" />
                      <p className="text-gray-500 mt-2">Cargando datos...</p>
                    </td>
                  </tr>
                ) : paginatedPoints.length === 0 ? (
                  <tr>
                    <td colSpan={10 + Math.min(maxPhotos, 4)} className="text-center py-12 text-gray-500">
                      <FileText size={48} className="mx-auto mb-4 opacity-50" />
                      <p>No hay datos</p>
                      <p className="text-sm mt-1">
                        {points.length === 0
                          ? 'Haz clic en "Mapear Fotos" para buscar fotos en Drive'
                          : 'No se encontraron resultados para la búsqueda'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedPoints.map((point, index) => (
                    <tr
                      key={`${point.suministro}-${index}`}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-2 px-3 text-sm text-gray-600">{point.numero}</td>
                      <td className="py-2 px-3 text-sm font-mono text-gray-900">{point.serie}</td>
                      <td className="py-2 px-3 text-sm font-medium text-gray-900">{point.suministro}</td>
                      <td className="py-2 px-3 text-sm font-mono text-gray-600">{point.codigoRuta || '-'}</td>
                      <td className="py-2 px-3 text-sm text-gray-600">{point.tecnico || '-'}</td>
                      <td className="py-2 px-3 text-sm text-gray-600">{formatDate(point.fechaContraste)}</td>
                      <td className="py-2 px-3">
                        <span
                          className="text-sm text-gray-700 truncate block max-w-[200px]"
                          title={point.notas}
                        >
                          {point.notas || '-'}
                        </span>
                      </td>
                      {/* Botones de fotos */}
                      {Array.from({ length: Math.min(maxPhotos, 4) }, (_, i) => (
                        <td key={i} className="py-2 px-1 text-center">
                          {point.photoLinks && point.photoLinks[i] ? (
                            <button
                              onClick={() => handleOpenPhoto(point.photoLinks, point.suministro, i)}
                              className="p-1 text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded transition-colors"
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
                          {point.photoLinks && point.photoLinks.length > 4 && (
                            <button
                              onClick={() => handleOpenPhoto(point.photoLinks, point.suministro, 4)}
                              className="px-1.5 py-0.5 text-xs text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded transition-colors"
                            >
                              +{point.photoLinks.length - 4}
                            </button>
                          )}
                        </td>
                      )}
                      {/* Botón generar PDF */}
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => handleGeneratePDF(point, true)}
                          disabled={generatingPDF === point.suministro}
                          className="p-1.5 text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded transition-colors disabled:opacity-50"
                          title="Generar PDF con imágenes"
                        >
                          {generatingPDF === point.suministro ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <FileDown size={16} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {sortedPoints.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  Mostrando {startIndex + 1}-{Math.min(endIndex, sortedPoints.length)} de {sortedPoints.length}
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
                  Página {currentPage} de {totalPages || 1}
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
                  Última
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de fotos */}
      {selectedPhotos && (
        <PhotoGalleryModal
          photos={selectedPhotos.photos.map((p, idx) => ({
            url: p.url,
            fecha: '',
            numero: idx + 1,
            lectura: p.nombre
          }))}
          suministro={selectedPhotos.suministro}
          initialIndex={selectedPhotos.initialIndex}
          onClose={() => setSelectedPhotos(null)}
        />
      )}

      {/* Modal de selección para batch export */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-orange-600 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Package size={20} />
                Exportar PDFs OBSERVADOS
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
                Se generarán {sortedPoints.length} PDFs para la Semana {semana || '?'}
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => handleBatchExport(false)}
                  className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center justify-center gap-2"
                >
                  <FileDown size={18} />
                  Sin imágenes (rápido)
                </button>

                <button
                  onClick={() => handleBatchExport(true)}
                  className="w-full px-4 py-3 bg-orange-800 text-white rounded-lg hover:bg-orange-900 flex items-center justify-center gap-2"
                >
                  <FileDown size={18} />
                  Con imágenes (lento)
                </button>
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
              <Loader2 size={48} className="animate-spin text-orange-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Generando PDFs OBSERVADOS...
              </h3>
              <p className="text-gray-600 mb-4">
                {batchProgress.currentFile}
              </p>

              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div
                  className="bg-orange-600 h-3 rounded-full transition-all duration-300"
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
