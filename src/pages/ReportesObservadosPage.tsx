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
import { supervisionObservadosTitle } from '../config/report';
import { downloadCsv } from '../utils/csv';
import { PageHeader, StatCard, SectionCard, EmptyState, Badge, ui } from '../components/ui';

// Formato de miles es-PE (solo visual)
const fmt = (n: number) => n.toLocaleString('es-PE');

// Configuración de paginación
const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

// Limites del polling de estado del mapeo de fotos
const MAPEO_MAX_POLL_MS = 10 * 60 * 1000; // 10 minutos
const MAPEO_MAX_FAILURES = 3;
const MAPEO_IDLE_GRACE_MS = 15 * 1000;

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

  // Verificar estado del mapeo periódicamente.
  // Se detiene si: termina, el servidor responde idle/null/error, o se supera el tiempo maximo.
  useEffect(() => {
    if (!isMapping) return;

    const startedAt = Date.now();
    let consecutiveFailures = 0;
    let stopped = false;

    const stop = (message?: string) => {
      if (stopped) return;
      stopped = true;
      clearInterval(interval);
      setIsMapping(false);
      if (message) alert(message);
    };

    const interval = setInterval(async () => {
      if (Date.now() - startedAt > MAPEO_MAX_POLL_MS) {
        stop('El mapeo de fotos tardó demasiado. Revisa el estado más tarde con "Actualizar".');
        return;
      }

      let status: MapeoStatusResponse | null = null;
      try {
        status = await getMapeoStatus();
      } catch {
        status = null;
      }
      if (stopped) return;

      if (!status || status.success === false) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAPEO_MAX_FAILURES) {
          stop('No se pudo consultar el estado del mapeo de fotos.');
        }
        return;
      }
      consecutiveFailures = 0;
      setMapeoStatus(status);

      if (status.status === 'completed') {
        stop();
        loadData();
      } else if (status.status === 'idle' && Date.now() - startedAt > MAPEO_IDLE_GRACE_MS) {
        // El servidor ya no tiene un mapeo en curso: dejar de consultar y recargar
        // (se da un margen inicial porque el servidor puede tardar en marcar "in_progress")
        stop();
        loadData();
      }
    }, 3000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [isMapping, selectedSheet]);

  // Iniciar mapeo de fotos
  async function handleMapearFotos() {
    if (!selectedSheet) return;

    setIsMapping(true);
    setMapeoStatus(null);

    try {
      const result = await mapearFotosObservados(selectedSheet);

      if (!result) {
        // Error de red o respuesta invalida: no quedar consultando indefinidamente
        setIsMapping(false);
        alert('Error al iniciar el mapeo de fotos');
        return;
      }

      if (result.status === 'completed') {
        setIsMapping(false);
        alert(`¡Mapeo completado!\n\nSuministros procesados: ${result.processed}\nFotos encontradas: ${result.fotosEncontradas}`);
        loadData();
      } else if (result.status === 'in_progress') {
        // El mapeo continúa en segundo plano: (re)activar el polling
        setIsMapping(true);
        setMapeoStatus({
          success: true,
          message: result.message,
          status: 'in_progress',
          processed: result.processed,
          total: result.total,
          fotosEncontradas: result.fotosEncontradas
        });
      } else {
        setIsMapping(false);
        alert(result.message || 'El mapeo de fotos no se pudo completar');
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

      alert(`¡ZIP generado correctamente!\n\nPDFs creados: ${successCount}\nErrores: ${errorCount}`);
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

    downloadCsv(`observados_semana_${semana}_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  // Renderizar icono de ordenamiento
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="text-gray-400" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-electric" />
      : <ArrowDown size={14} className="text-electric" />;
  };

  // Derivados solo para mostrar
  const totalFotos = points.reduce((acc, p) => acc + (p.photoLinks?.length || 0), 0);
  const sinFotos = points.filter(p => !p.photoLinks || p.photoLinks.length === 0).length;
  const sortTh = `${ui.th} cursor-pointer select-none whitespace-nowrap hover:text-electric`;
  const pagerBtn = 'rounded-lg border border-gray-300 px-2.5 py-1 text-sm text-gray-700 transition hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-40';

  if (loadingSheets) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-gray-200 border-t-electric"></div>
        <p className="text-sm text-gray-500">Cargando hojas de observados…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Supervisión · Observados"
        title="Reportes de observados"
        icon={<FileText size={22} />}
        subtitle={
          selectedSheet
            ? supervisionObservadosTitle(semana)
            : 'Selecciona una hoja de observados'
        }
        actions={
          <>
            {/* Selector de hoja */}
            <select
              value={selectedSheet}
              onChange={(e) => {
                setSelectedSheet(e.target.value);
                setCurrentPage(1);
              }}
              className={`${ui.input} w-auto min-w-[200px]`}
              disabled={sheets.length === 0}
              aria-label="Hoja de observados"
            >
              {sheets.length === 0 ? (
                <option value="">No hay hojas de observados</option>
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
              className={ui.btnPrimary}
              title="Vincula las fotos de Google Drive con cada suministro observado"
            >
              {isMapping ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FolderSync size={16} />
              )}
              {isMapping ? 'Vinculando fotos…' : 'Mapear fotos'}
            </button>

            {/* Botón recargar */}
            <button
              onClick={loadData}
              disabled={!selectedSheet || isLoading}
              className={ui.btnSecondary}
              title="Recargar datos de la hoja"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </>
        }
      />

      {/* Estado del mapeo */}
      {isMapping && mapeoStatus && mapeoStatus.status === 'in_progress' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-3">
            <Loader2 size={22} className="animate-spin text-energy" />
            <div className="flex-1">
              <p className="font-medium text-amber-800">Vinculando fotos desde Google Drive…</p>
              <p className="mt-0.5 text-sm text-gray-600">
                Procesados: <span className="font-mono text-gray-800">{fmt(mapeoStatus.processed || 0)} / {mapeoStatus.total ? fmt(mapeoStatus.total) : '?'}</span>
                <span className="mx-2 text-gray-400">·</span>
                Fotos encontradas: <span className="font-mono text-gray-800">{fmt(mapeoStatus.fotosEncontradas || 0)}</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Si supera los 5 minutos, el proceso continúa automáticamente en segundo plano.
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-energy transition-all duration-300"
              style={{ width: `${mapeoStatus.total ? (mapeoStatus.processed! / mapeoStatus.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Suministros observados"
          tone="amber"
          icon={<FileText size={18} />}
          value={fmt(points.length)}
        />
        <StatCard
          label="Fotos vinculadas"
          tone="cyan"
          icon={<Eye size={18} />}
          value={fmt(totalFotos)}
          hint="Total de fotos encontradas en Drive"
        />
        <StatCard
          label="Sin fotos"
          tone={sinFotos > 0 ? 'red' : 'green'}
          icon={<AlertCircle size={18} />}
          value={fmt(sinFotos)}
          hint="Suministros aún sin foto vinculada"
        />
        <StatCard
          label="Semana"
          tone="gray"
          icon={<FileDown size={18} />}
          value={semana || '—'}
        />
      </div>

      {/* Barra de acciones */}
      <SectionCard bodyClassName="p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Búsqueda */}
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar suministro, serie, técnico u observación…"
              className={`${ui.input} pl-9`}
            />
          </div>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-electric"
          >
            <RotateCcw size={16} />
            Limpiar
          </button>

          {/* Exportar ZIP */}
          <button
            onClick={() => setShowBatchModal(true)}
            disabled={sortedPoints.length === 0 || isBatchExporting}
            className={ui.btnPrimary}
            title="Genera un PDF por suministro y los descarga en un ZIP"
          >
            <Package size={16} />
            Exportar {fmt(sortedPoints.length)} PDF (ZIP)
          </button>

          {/* CSV */}
          <button
            onClick={exportToCSV}
            disabled={sortedPoints.length === 0}
            className={ui.btnSuccess}
          >
            <Download size={16} />
            Exportar CSV
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Mostrando <span className="font-mono text-gray-700">{fmt(sortedPoints.length)}</span> suministros
          {searchQuery && <> (filtrados de <span className="font-mono text-gray-700">{fmt(points.length)}</span>)</>}
        </p>
      </SectionCard>

      {/* Mensaje si no hay hojas */}
      {sheets.length === 0 && (
        <SectionCard>
          <EmptyState
            icon="reporte"
            title="No hay hojas de observados"
            description={<>Crea una hoja cuyo nombre empiece con «Observados» (por ejemplo, «Observados Semana 45»).</>}
          />
        </SectionCard>
      )}

      {/* Tabla */}
      {selectedSheet && (
        <div className={ui.tableWrap}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={ui.theadRow}>
                  <th className={sortTh} onClick={() => handleSort('numero')}>
                    <span className="flex items-center gap-1">
                      N.º
                      <SortIcon field="numero" />
                    </span>
                  </th>
                  <th className={sortTh} onClick={() => handleSort('serie')}>
                    <span className="flex items-center gap-1">
                      Serie
                      <SortIcon field="serie" />
                    </span>
                  </th>
                  <th className={sortTh} onClick={() => handleSort('suministro')}>
                    <span className="flex items-center gap-1">
                      Suministro
                      <SortIcon field="suministro" />
                    </span>
                  </th>
                  <th className={`${ui.th} whitespace-nowrap`}>
                    Ruta
                  </th>
                  <th className={sortTh} onClick={() => handleSort('tecnico')}>
                    <span className="flex items-center gap-1">
                      Técnico
                      <SortIcon field="tecnico" />
                    </span>
                  </th>
                  <th className={sortTh} onClick={() => handleSort('fechaContraste')} title="Fecha de contraste">
                    <span className="flex items-center gap-1">
                      F. contraste
                      <SortIcon field="fechaContraste" />
                    </span>
                  </th>
                  <th className={`${ui.th} min-w-[200px] whitespace-nowrap`}>
                    Observación
                  </th>
                  {/* Columnas de fotos */}
                  {Array.from({ length: Math.min(maxPhotos, 4) }, (_, i) => (
                    <th key={i} className={`${ui.th} whitespace-nowrap px-2 text-center`} title={`Foto ${i + 1}`}>
                      Foto {i + 1}
                    </th>
                  ))}
                  {maxPhotos > 4 && (
                    <th className={`${ui.th} whitespace-nowrap px-2 text-center`} title="Fotos adicionales">
                      Más
                    </th>
                  )}
                  <th className={`${ui.th} whitespace-nowrap text-center`}>
                    PDF
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10 + Math.min(maxPhotos, 4)} className="py-12 text-center">
                      <Loader2 size={32} className="mx-auto animate-spin text-electric" />
                      <p className="mt-2 text-sm text-gray-500">Cargando datos…</p>
                    </td>
                  </tr>
                ) : paginatedPoints.length === 0 ? (
                  <tr>
                    <td colSpan={10 + Math.min(maxPhotos, 4)}>
                      <EmptyState
                        icon="reporte"
                        compact
                        title="No hay datos para mostrar"
                        description={points.length === 0
                          ? 'Haz clic en «Mapear fotos» para vincular las fotos de Google Drive con cada suministro observado.'
                          : 'No se encontraron resultados para la búsqueda.'}
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedPoints.map((point, index) => (
                    <tr
                      key={`${point.suministro}-${index}`}
                      className={ui.tbodyRow}
                    >
                      <td className={`${ui.td} py-2 font-mono text-gray-500`}>{point.numero}</td>
                      <td className={`${ui.td} py-2 font-mono text-gray-900`}>{point.serie}</td>
                      <td className={`${ui.td} py-2 font-mono font-semibold text-gray-900`}>{point.suministro}</td>
                      <td className={`${ui.td} py-2 font-mono text-gray-600`}>{point.codigoRuta || '—'}</td>
                      <td className={`${ui.td} py-2`}>{point.tecnico || '—'}</td>
                      <td className={`${ui.td} whitespace-nowrap py-2 font-mono`}>{formatDate(point.fechaContraste)}</td>
                      <td className={`${ui.td} py-2`}>
                        <span
                          className="block max-w-[220px] truncate text-gray-700"
                          title={point.notas}
                        >
                          {point.notas || '—'}
                        </span>
                      </td>
                      {/* Botones de fotos */}
                      {Array.from({ length: Math.min(maxPhotos, 4) }, (_, i) => (
                        <td key={i} className="px-1 py-2 text-center">
                          {point.photoLinks && point.photoLinks[i] ? (
                            <button
                              onClick={() => handleOpenPhoto(point.photoLinks, point.suministro, i)}
                              className="rounded-lg p-1.5 text-electric transition-colors hover:bg-cyan-400/10"
                              title={`Ver foto ${i + 1}`}
                            >
                              <Eye size={16} />
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      ))}
                      {maxPhotos > 4 && (
                        <td className="px-1 py-2 text-center">
                          {point.photoLinks && point.photoLinks.length > 4 && (
                            <button
                              onClick={() => handleOpenPhoto(point.photoLinks, point.suministro, 4)}
                              className="rounded-md px-1.5 py-0.5 font-mono text-xs text-electric transition-colors hover:bg-cyan-400/10"
                              title="Ver fotos adicionales"
                            >
                              +{point.photoLinks.length - 4}
                            </button>
                          )}
                        </td>
                      )}
                      {/* Botón generar PDF */}
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleGeneratePDF(point, true)}
                          disabled={generatingPDF === point.suministro}
                          className="rounded-lg p-1.5 text-energy transition-colors hover:bg-amber-50 disabled:opacity-50"
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
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 px-4 py-3">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  Mostrando <span className="font-mono text-gray-700">{fmt(startIndex + 1)}–{fmt(Math.min(endIndex, sortedPoints.length))}</span> de{' '}
                  <span className="font-mono text-gray-700">{fmt(sortedPoints.length)}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Filas por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-gray-300 bg-navy-900 px-2 py-1 font-mono text-sm outline-none focus:border-electric"
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
                  className={pagerBtn}
                >
                  Primera
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={pagerBtn}
                  title="Página anterior"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 text-sm text-gray-500">
                  Página <span className="font-mono text-gray-800">{currentPage}</span> de <span className="font-mono text-gray-800">{totalPages || 1}</span>
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className={pagerBtn}
                  title="Página siguiente"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <p className="brand-kicker">Exportación masiva</p>
                <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <Package size={20} className="text-electric" />
                  Exportar PDF de observados
                </h3>
              </div>
              <button
                onClick={() => setShowBatchModal(false)}
                className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                title="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="mb-4 text-sm text-gray-600">
                Se generarán <span className="font-mono font-semibold text-gray-900">{fmt(sortedPoints.length)}</span> PDF para la semana{' '}
                <Badge tone="cyan">{semana || '?'}</Badge>, comprimidos en un archivo ZIP.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => handleBatchExport(false)}
                  className={`${ui.btnPrimary} w-full py-3`}
                >
                  <FileDown size={18} />
                  Sin imágenes (rápido)
                </button>

                <button
                  onClick={() => handleBatchExport(true)}
                  className={`${ui.btnSecondary} w-full py-3`}
                >
                  <FileDown size={18} />
                  Con imágenes (lento)
                </button>
              </div>

              <button
                onClick={() => setShowBatchModal(false)}
                className="mt-4 w-full rounded-xl px-4 py-2 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Indicador de progreso batch export */}
      {isBatchExporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl shadow-black/50">
            <div className="text-center">
              <Loader2 size={44} className="mx-auto mb-4 animate-spin text-electric" />
              <p className="brand-kicker">Exportación en curso</p>
              <h3 className="mb-2 mt-1 text-lg font-semibold text-gray-900">
                Generando PDF de observados…
              </h3>
              <p className="mb-4 truncate font-mono text-sm text-gray-600">
                {batchProgress.currentFile}
              </p>

              <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-2.5 rounded-full bg-electric transition-all duration-300"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-gray-500">
                <span className="font-mono text-gray-800">{fmt(batchProgress.current)}</span> de{' '}
                <span className="font-mono text-gray-800">{fmt(batchProgress.total)}</span> ({Math.round((batchProgress.current / batchProgress.total) * 100)} %)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
